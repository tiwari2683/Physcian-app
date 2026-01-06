const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize AWS Client
const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

// Table Name
const TABLE_NAME = "Appointments";

exports.handler = async (event) => {
    console.log("Event:", JSON.stringify(event));

    // Header for CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE"
    };

    try {
        // Handle different HTTP methods - Support both v1 (REST) and v2 (HTTP/Function URL)
        const method = event.httpMethod || event.requestContext?.http?.method;

        if (method === "GET") {
            // GET /appointments - Fetch all appointments
            const params = {
                TableName: TABLE_NAME
            };

            const result = await dynamodb.send(new ScanCommand(params));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result.Items || [])
            };
        }

        if (method === "POST") {
            // POST /appointments - Create or Update appointment
            const body = JSON.parse(event.body);

            // 1. INPUT VALIDATION
            // Check for valid patient name (letters, spaces, hyphens, apostrophes only)
            const nameRegex = /^[a-zA-Z\s\-\']+$/;
            if (body.patientName && !nameRegex.test(body.patientName)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: "Invalid patient name. Only letters, spaces, hyphens, and apostrophes are allowed." })
                };
            }

            if (!body.id) {
                // Generate ID if not present - always as string
                body.id = Date.now().toString();
            } else {
                // Ensure ID is always a string
                body.id = String(body.id);
            }

            // Ensure status defaults to upcoming if missing
            if (!body.status) {
                body.status = "upcoming";
            }

            // VALIDATION: Required fields for new appointments
            if (body.status === "upcoming") {
                if (!body.date) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: "Date is required for appointments." })
                    };
                }
                if (!body.time) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: "Time is required for appointments." })
                    };
                }
            }

            // VALIDATION: Patient age must be a positive number if provided
            if (body.patientAge !== undefined && body.patientAge !== null) {
                const age = parseInt(body.patientAge);
                if (isNaN(age) || age < 0 || age > 150) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: "Patient age must be a valid number between 0 and 150." })
                    };
                }
                body.patientAge = age;
            }

            // SANITIZATION: Clean notes field (remove potential script tags)
            if (body.notes && typeof body.notes === 'string') {
                body.notes = body.notes
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]*>/g, '')
                    .trim()
                    .substring(0, 1000); // Limit notes length
            }

            // Allow patientId to be passed
            if (body.patientId) {
                // We trust the frontend to provide a valid patientId
                // In a stricter system, we might verify it exists in the Patients table here
            }

            // 2. DOUBLE BOOKING CHECK
            if (body.date && body.time && body.status !== "canceled") {
                const scanParams = {
                    TableName: TABLE_NAME,
                    FilterExpression: "#d = :date AND #t = :time AND #s <> :canceledStatus",
                    ExpressionAttributeNames: {
                        "#d": "date",
                        "#t": "time",
                        "#s": "status"
                    },
                    ExpressionAttributeValues: {
                        ":date": body.date,
                        ":time": body.time,
                        ":canceledStatus": "canceled"
                    }
                };

                const existingAppointments = await dynamodb.send(new ScanCommand(scanParams));

                // If we found a conflict AND it's not the same appointment we are updating
                const conflict = existingAppointments.Items.find(item => item.id.toString() !== body.id.toString());

                if (conflict) {
                    return {
                        statusCode: 409, // Conflict
                        headers,
                        body: JSON.stringify({ message: `Time slot ${body.time} on ${body.date} is already booked.` })
                    };
                }
            }

            const params = {
                TableName: TABLE_NAME,
                Item: body
            };

            await dynamodb.send(new PutCommand(params));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: "Appointment saved successfully", data: body })
            };
        }

        if (method === "DELETE") {
            // DELETE /appointments - Delete an appointment
            const id = event.queryStringParameters ? event.queryStringParameters.id : null;

            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: "Missing appointment ID" })
                };
            }

            const params = {
                TableName: TABLE_NAME,
                Key: { id: id }
            };

            await dynamodb.send(new DeleteCommand(params));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: "Appointment deleted successfully" })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "Unsupported method" })
        };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: "Internal Server Error", error: error.message })
        };
    }
};
