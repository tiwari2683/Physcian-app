const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// Initialize AWS Clients
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

// Table and Bucket Names - UPDATE THESE WITH YOUR ACTUAL NAMES
const PATIENTS_TABLE = "Patients";  // Your DynamoDB table for patients
const S3_BUCKET = "dr-gawli-patient-files";  // Your S3 bucket for file uploads (optional)

// CORS Headers
const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE"
};

// Helper function to generate patient ID
const generatePatientId = () => {
    return `PATIENT_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
};

// Helper function to create success response
const successResponse = (data) => ({
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, ...data })
});

// Helper function to create error response
const errorResponse = (statusCode, message, error = null) => ({
    statusCode,
    headers,
    body: JSON.stringify({
        success: false,
        error: message,
        ...(error && { details: error.message })
    })
});

exports.handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));

    // Handle OPTIONS for CORS preflight
    if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        // Parse request body
        let body;
        try {
            body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
        } catch (e) {
            return errorResponse(400, "Invalid JSON in request body");
        }

        // Handle patientData wrapper if present
        if (body.patientData) {
            body = body.patientData;
        }

        const action = body.action;
        console.log("Action:", action);
        console.log("Body:", JSON.stringify(body, null, 2));

        // Route based on action
        switch (action) {
            case "getPatient":
                return await getPatient(body);

            case "createPatient":
                return await createPatient(body);

            case "updatePatientData":
                return await updatePatientData(body);

            case "getAllPatients":
                return await getAllPatients(body);

            case "searchPatients":
                return await searchPatients(body);

            case "deletePatient":
                return await deletePatient(body);

            case "getMedicalHistory":
                return await getMedicalHistory(body);

            case "deletePatientFile":
                return await deletePatientFile(body);

            default:
                // If no action specified, check for updateMode (legacy support)
                if (body.updateMode === true || body.isUpdate === "true") {
                    return await updatePatientData(body);
                }
                // Check for new patient creation (has name but no patientId)
                if (body.name && !body.patientId) {
                    return await createPatient(body);
                }
                return errorResponse(400, `Unknown action: ${action}`);
        }
    } catch (error) {
        console.error("Handler error:", error);
        return errorResponse(500, "Internal server error", error);
    }
};

// ============================================
// ACTION HANDLERS
// ============================================

async function getPatient(body) {
    const { patientId } = body;

    if (!patientId) {
        return errorResponse(400, "Missing patientId");
    }

    try {
        const result = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!result.Item) {
            return errorResponse(404, "Patient not found");
        }

        return successResponse({ patient: result.Item });
    } catch (error) {
        console.error("getPatient error:", error);
        return errorResponse(500, "Failed to get patient", error);
    }
}

async function createPatient(body) {
    const { name, age, sex, mobile, address } = body;

    // Validation
    if (!name || name.trim() === "") {
        return errorResponse(400, "Patient name is required");
    }

    const patientId = body.patientId || generatePatientId();
    const timestamp = new Date().toISOString();

    const patient = {
        patientId,
        name: name.trim(),
        nameSearchable: name.trim().toLowerCase(),
        age: age || "0",
        sex: sex || "Male",
        mobile: mobile || "",
        mobileSearchable: mobile || "",
        address: address || "",
        status: body.status || "REGISTERED", // Default to REGISTERED, allow PRE_REGISTERED
        createdAt: timestamp,
        updatedAt: timestamp,
        lastVisitDate: timestamp,
        totalVisits: 1,
        version: 1,
        // Clinical fields
        medicalHistory: body.medicalHistory || "",
        diagnosis: body.diagnosis || "",
        prescription: body.prescription || "",
        treatment: body.treatment || "",
        reports: body.reports || "",
        advisedInvestigations: body.advisedInvestigations || "",
        clinicalParameters: body.clinicalParameters || {},
        medications: body.medications || [],
        reportFiles: body.reportFiles || [],
    };

    try {
        await dynamodb.send(new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: patient
        }));

        console.log("Patient created:", patientId);
        return successResponse({
            message: "Patient created successfully",
            patientId,
            patient
        });
    } catch (error) {
        console.error("createPatient error:", error);
        return errorResponse(500, "Failed to create patient", error);
    }
}

async function updatePatientData(body) {
    const { patientId, updateSection } = body;

    if (!patientId) {
        return errorResponse(400, "Missing patientId for update");
    }

    const timestamp = new Date().toISOString();
    let updateExpression = "SET updatedAt = :updatedAt";
    let expressionAttributeValues = { ":updatedAt": timestamp };
    let expressionAttributeNames = {};

    // Build update based on section
    switch (updateSection) {
        case "basic":
            if (body.name) {
                updateExpression += ", #name = :name, nameSearchable = :nameSearchable";
                expressionAttributeValues[":name"] = body.name;
                expressionAttributeValues[":nameSearchable"] = body.name.toLowerCase();
                expressionAttributeNames["#name"] = "name";
            }
            if (body.age) {
                updateExpression += ", age = :age";
                expressionAttributeValues[":age"] = body.age;
            }
            if (body.sex) {
                updateExpression += ", sex = :sex";
                expressionAttributeValues[":sex"] = body.sex;
            }
            if (body.mobile) {
                updateExpression += ", mobile = :mobile, mobileSearchable = :mobileSearchable";
                expressionAttributeValues[":mobile"] = body.mobile;
                expressionAttributeValues[":mobileSearchable"] = body.mobile;
            }
            if (body.address !== undefined) {
                updateExpression += ", address = :address";
                expressionAttributeValues[":address"] = body.address;
            }
            if (body.status) {
                updateExpression += ", #status = :status";
                expressionAttributeValues[":status"] = body.status;
                expressionAttributeNames["#status"] = "status";
            }
            break;

        case "clinical":
            if (body.medicalHistory !== undefined) {
                updateExpression += ", medicalHistory = :medicalHistory";
                expressionAttributeValues[":medicalHistory"] = body.medicalHistory;
            }
            if (body.clinicalParameters) {
                updateExpression += ", clinicalParameters = :clinicalParameters";
                expressionAttributeValues[":clinicalParameters"] = body.clinicalParameters;
            }
            if (body.diagnosis !== undefined) {
                updateExpression += ", diagnosis = :diagnosis";
                expressionAttributeValues[":diagnosis"] = body.diagnosis;
            }
            if (body.treatment !== undefined) {
                updateExpression += ", treatment = :treatment";
                expressionAttributeValues[":treatment"] = body.treatment;
            }
            if (body.reports !== undefined) {
                updateExpression += ", reports = :reports";
                expressionAttributeValues[":reports"] = body.reports;
            }
            if (body.advisedInvestigations !== undefined) {
                updateExpression += ", advisedInvestigations = :advisedInvestigations";
                expressionAttributeValues[":advisedInvestigations"] = body.advisedInvestigations;
            }
            if (body.reportFiles) {
                updateExpression += ", reportFiles = :reportFiles";
                expressionAttributeValues[":reportFiles"] = body.reportFiles;
            }
            break;

        case "prescription":
            if (body.medications) {
                updateExpression += ", medications = :medications";
                expressionAttributeValues[":medications"] = body.medications;
            }
            if (body.prescription !== undefined) {
                updateExpression += ", prescription = :prescription";
                expressionAttributeValues[":prescription"] = body.prescription;
            }
            break;

        case "diagnosis":
            if (body.diagnosis !== undefined) {
                updateExpression += ", diagnosis = :diagnosis";
                expressionAttributeValues[":diagnosis"] = body.diagnosis;
            }
            if (body.advisedInvestigations !== undefined) {
                updateExpression += ", advisedInvestigations = :advisedInvestigations";
                expressionAttributeValues[":advisedInvestigations"] = body.advisedInvestigations;
            }
            if (body.reportData) {
                updateExpression += ", reportData = :reportData";
                expressionAttributeValues[":reportData"] = body.reportData;
            }
            if (body.reportFiles) {
                updateExpression += ", reportFiles = :reportFiles";
                expressionAttributeValues[":reportFiles"] = body.reportFiles;
            }
            break;

        default:
            // Update any provided fields directly
            const fieldsToUpdate = [
                'name', 'age', 'sex', 'mobile', 'address',
                'medicalHistory', 'diagnosis', 'prescription', 'treatment',
                'reports', 'advisedInvestigations', 'clinicalParameters',
                'medications', 'reportFiles', 'reportData'
            ];

            fieldsToUpdate.forEach(field => {
                if (body[field] !== undefined) {
                    if (field === 'name') {
                        updateExpression += ", #name = :name, nameSearchable = :nameSearchable";
                        expressionAttributeValues[":name"] = body.name;
                        expressionAttributeValues[":nameSearchable"] = body.name.toLowerCase();
                        expressionAttributeNames["#name"] = "name";
                    } else {
                        updateExpression += `, ${field} = :${field}`;
                        expressionAttributeValues[`:${field}`] = body[field];
                    }
                }
            });
    }

    try {
        const params = {
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: "ALL_NEW"
        };

        if (Object.keys(expressionAttributeNames).length > 0) {
            params.ExpressionAttributeNames = expressionAttributeNames;
        }

        console.log("Update params:", JSON.stringify(params, null, 2));

        const result = await dynamodb.send(new UpdateCommand(params));

        return successResponse({
            message: "Patient updated successfully",
            patientId,
            patient: result.Attributes
        });
    } catch (error) {
        console.error("updatePatientData error:", error);
        return errorResponse(500, "Failed to update patient", error);
    }
}

async function getAllPatients(body) {
    try {
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE
        }));

        // Sort by lastVisitDate (most recent first)
        const patients = (result.Items || []).sort((a, b) => {
            return new Date(b.lastVisitDate || b.createdAt || 0) - new Date(a.lastVisitDate || a.createdAt || 0);
        });

        return successResponse({ patients, count: patients.length });
    } catch (error) {
        console.error("getAllPatients error:", error);
        return errorResponse(500, "Failed to get patients", error);
    }
}

async function searchPatients(body) {
    const { searchTerm } = body;

    if (!searchTerm || searchTerm.trim() === "") {
        return getAllPatients(body);
    }

    try {
        const searchLower = searchTerm.toLowerCase().trim();

        // Scan with filter (for small datasets, consider GSI for larger ones)
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE,
            FilterExpression: "contains(nameSearchable, :search) OR contains(mobileSearchable, :search)",
            ExpressionAttributeValues: {
                ":search": searchLower
            }
        }));

        return successResponse({
            patients: result.Items || [],
            count: result.Items?.length || 0
        });
    } catch (error) {
        console.error("searchPatients error:", error);
        return errorResponse(500, "Failed to search patients", error);
    }
}

async function deletePatient(body) {
    const { patientId } = body;

    if (!patientId) {
        return errorResponse(400, "Missing patientId");
    }

    try {
        await dynamodb.send(new DeleteCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        return successResponse({ message: "Patient deleted successfully", patientId });
    } catch (error) {
        console.error("deletePatient error:", error);
        return errorResponse(500, "Failed to delete patient", error);
    }
}

async function getMedicalHistory(body) {
    const { patientId } = body;

    if (!patientId) {
        return errorResponse(400, "Missing patientId");
    }

    try {
        const result = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            ProjectionExpression: "medicalHistory, diagnosis, clinicalParameters"
        }));

        if (!result.Item) {
            return errorResponse(404, "Patient not found");
        }

        return successResponse({
            medicalHistory: result.Item.medicalHistory ?
                [{ text: result.Item.medicalHistory, timestamp: new Date().toISOString() }] : [],
            diagnosis: result.Item.diagnosis || "",
            clinicalParameters: result.Item.clinicalParameters || {}
        });
    } catch (error) {
        console.error("getMedicalHistory error:", error);
        return errorResponse(500, "Failed to get medical history", error);
    }
}

async function deletePatientFile(body) {
    const { patientId, fileUrl, fileName } = body;

    if (!patientId || (!fileUrl && !fileName)) {
        return errorResponse(400, "Missing patientId or file identifier");
    }

    try {
        // Get current patient data
        const getResult = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!getResult.Item) {
            return errorResponse(404, "Patient not found");
        }

        // Remove file from reportFiles array
        let reportFiles = getResult.Item.reportFiles || [];
        reportFiles = reportFiles.filter(file =>
            file.url !== fileUrl && file.uri !== fileUrl && file.name !== fileName
        );

        // Update patient record
        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: "SET reportFiles = :reportFiles, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":reportFiles": reportFiles,
                ":updatedAt": new Date().toISOString()
            }
        }));

        return successResponse({
            message: "File deleted successfully",
            remainingFiles: reportFiles.length
        });
    } catch (error) {
        console.error("deletePatientFile error:", error);
        return errorResponse(500, "Failed to delete file", error);
    }
}
