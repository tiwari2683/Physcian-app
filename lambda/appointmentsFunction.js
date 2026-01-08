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
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE,PATCH"
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

        if (method === "PATCH") {
            // PATCH /appointments - Reschedule an appointment
            const body = JSON.parse(event.body);
            const appointmentId = body.id ? String(body.id) : null;

            // Validate required ID
            if (!appointmentId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        errorCode: "MISSING_ID",
                        message: "Appointment ID is required for rescheduling."
                    })
                };
            }

            // 1. Fetch existing appointment
            const getParams = {
                TableName: TABLE_NAME,
                Key: { id: appointmentId }
            };
            const existingResult = await dynamodb.send(new GetCommand(getParams));
            const existingAppointment = existingResult.Item;

            // 2. Validate: appointment exists
            if (!existingAppointment) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        errorCode: "NOT_FOUND",
                        message: "Appointment not found."
                    })
                };
            }

            // 3. Validate: status is not cancelled or completed
            if (existingAppointment.status === "canceled" || existingAppointment.status === "completed") {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        errorCode: "INVALID_STATUS",
                        message: `Cannot reschedule a ${existingAppointment.status} appointment.`
                    })
                };
            }

            // Extract only allowed fields for update
            const newDate = body.date || existingAppointment.date;
            const newTime = body.time || existingAppointment.time;
            const newNotes = body.notes !== undefined ? body.notes : existingAppointment.notes;

            // 4. Validate: new date/time is in the future
            const parseDateTime = (dateStr, timeStr) => {
                const months = {
                    "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5,
                    "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
                };
                const dateMatch = dateStr?.match(/(\w+)\s+(\d+),\s+(\d+)/);
                if (!dateMatch) return new Date(0);

                const month = months[dateMatch[1]] ?? 0;
                const day = parseInt(dateMatch[2]);
                const year = parseInt(dateMatch[3]);

                const timeMatch = timeStr?.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!timeMatch) return new Date(year, month, day, 23, 59);

                let hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const ampm = timeMatch[3].toUpperCase();

                if (ampm === "PM" && hours !== 12) hours += 12;
                if (ampm === "AM" && hours === 12) hours = 0;

                return new Date(year, month, day, hours, minutes);
            };

            const newDateTime = parseDateTime(newDate, newTime);
            const now = new Date();

            if (newDateTime <= now) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        errorCode: "INVALID_DATE",
                        message: "Cannot reschedule to a past date or time."
                    })
                };
            }

            // 5. No-op: if date and time are unchanged
            if (newDate === existingAppointment.date && newTime === existingAppointment.time && newNotes === existingAppointment.notes) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: "No changes detected.",
                        data: existingAppointment
                    })
                };
            }

            // 6. Double-booking check (only if date or time changed)
            if (newDate !== existingAppointment.date || newTime !== existingAppointment.time) {
                const scanParams = {
                    TableName: TABLE_NAME,
                    FilterExpression: "#d = :date AND #t = :time AND #s <> :canceledStatus",
                    ExpressionAttributeNames: {
                        "#d": "date",
                        "#t": "time",
                        "#s": "status"
                    },
                    ExpressionAttributeValues: {
                        ":date": newDate,
                        ":time": newTime,
                        ":canceledStatus": "canceled"
                    }
                };

                const conflictResult = await dynamodb.send(new ScanCommand(scanParams));
                const conflict = conflictResult.Items.find(item => item.id.toString() !== appointmentId);

                if (conflict) {
                    return {
                        statusCode: 409,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            errorCode: "SLOT_ALREADY_BOOKED",
                            message: `Time slot ${newTime} on ${newDate} is already booked.`
                        })
                    };
                }
            }

            // 7. Conditional update - only update if status hasn't changed (race condition protection)
            // Sanitize notes if provided
            let sanitizedNotes = newNotes;
            if (sanitizedNotes && typeof sanitizedNotes === 'string') {
                sanitizedNotes = sanitizedNotes
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]*>/g, '')
                    .trim()
                    .substring(0, 1000);
            }

            const updateParams = {
                TableName: TABLE_NAME,
                Key: { id: appointmentId },
                UpdateExpression: "SET #d = :newDate, #t = :newTime, #n = :newNotes, #updatedAt = :updatedAt",
                ConditionExpression: "#s = :expectedStatus",
                ExpressionAttributeNames: {
                    "#d": "date",
                    "#t": "time",
                    "#n": "notes",
                    "#s": "status",
                    "#updatedAt": "updatedAt"
                },
                ExpressionAttributeValues: {
                    ":newDate": newDate,
                    ":newTime": newTime,
                    ":newNotes": sanitizedNotes || "",
                    ":expectedStatus": existingAppointment.status,
                    ":updatedAt": new Date().toISOString()
                },
                ReturnValues: "ALL_NEW"
            };

            try {
                const updateResult = await dynamodb.send(new UpdateCommand(updateParams));

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: "Appointment rescheduled successfully.",
                        data: updateResult.Attributes
                    })
                };
            } catch (updateError) {
                if (updateError.name === "ConditionalCheckFailedException") {
                    return {
                        statusCode: 409,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            errorCode: "CONCURRENT_UPDATE",
                            message: "Appointment was modified by another user. Please refresh and try again."
                        })
                    };
                }
                throw updateError;
            }
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
