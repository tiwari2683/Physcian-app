import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// Initialize AWS Clients
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

// Table Name - UPDATE THIS WITH YOUR ACTUAL TABLE NAME
const PATIENTS_TABLE = "Patients";

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

export const handler = async (event) => {
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
        createdAt: timestamp,
        updatedAt: timestamp,
        lastVisitDate: timestamp,
        totalVisits: 1,
        version: 1,
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

        return successResponse({ message: "Patient created successfully", patientId, patient });
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
    const fieldsToUpdate = [
        'medicalHistory', 'diagnosis', 'prescription', 'treatment',
        'reports', 'advisedInvestigations', 'clinicalParameters',
        'medications', 'reportFiles', 'reportData', 'age', 'sex', 'mobile', 'address'
    ];

    if (body.name) {
        updateExpression += ", #name = :name, nameSearchable = :nameSearchable";
        expressionAttributeValues[":name"] = body.name;
        expressionAttributeValues[":nameSearchable"] = body.name.toLowerCase();
        expressionAttributeNames["#name"] = "name";
    }

    fieldsToUpdate.forEach(field => {
        if (body[field] !== undefined) {
            updateExpression += `, ${field} = :${field}`;
            expressionAttributeValues[`:${field}`] = body[field];
        }
    });

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

        const result = await dynamodb.send(new UpdateCommand(params));

        return successResponse({ message: "Patient updated successfully", patientId, patient: result.Attributes });
    } catch (error) {
        console.error("updatePatientData error:", error);
        return errorResponse(500, "Failed to update patient", error);
    }
}

async function getAllPatients() {
    try {
        const result = await dynamodb.send(new ScanCommand({ TableName: PATIENTS_TABLE }));
        const patients = (result.Items || []).sort((a, b) =>
            new Date(b.lastVisitDate || b.createdAt || 0) - new Date(a.lastVisitDate || a.createdAt || 0)
        );
        return successResponse({ patients, count: patients.length });
    } catch (error) {
        console.error("getAllPatients error:", error);
        return errorResponse(500, "Failed to get patients", error);
    }
}

async function searchPatients(body) {
    const { searchTerm } = body;
    if (!searchTerm || searchTerm.trim() === "") return getAllPatients();

    try {
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE,
            FilterExpression: "contains(nameSearchable, :search) OR contains(mobileSearchable, :search)",
            ExpressionAttributeValues: { ":search": searchTerm.toLowerCase().trim() }
        }));
        return successResponse({ patients: result.Items || [], count: result.Items?.length || 0 });
    } catch (error) {
        console.error("searchPatients error:", error);
        return errorResponse(500, "Failed to search patients", error);
    }
}

async function deletePatient(body) {
    const { patientId } = body;
    if (!patientId) return errorResponse(400, "Missing patientId");

    try {
        await dynamodb.send(new DeleteCommand({ TableName: PATIENTS_TABLE, Key: { patientId } }));
        return successResponse({ message: "Patient deleted successfully", patientId });
    } catch (error) {
        console.error("deletePatient error:", error);
        return errorResponse(500, "Failed to delete patient", error);
    }
}

async function getMedicalHistory(body) {
    const { patientId } = body;
    if (!patientId) return errorResponse(400, "Missing patientId");

    try {
        const result = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            ProjectionExpression: "medicalHistory, diagnosis, clinicalParameters"
        }));

        if (!result.Item) return errorResponse(404, "Patient not found");

        return successResponse({
            medicalHistory: result.Item.medicalHistory ? [{ text: result.Item.medicalHistory, timestamp: new Date().toISOString() }] : [],
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
    if (!patientId || (!fileUrl && !fileName)) return errorResponse(400, "Missing patientId or file identifier");

    try {
        const getResult = await dynamodb.send(new GetCommand({ TableName: PATIENTS_TABLE, Key: { patientId } }));
        if (!getResult.Item) return errorResponse(404, "Patient not found");

        let reportFiles = getResult.Item.reportFiles || [];
        reportFiles = reportFiles.filter(file => file.url !== fileUrl && file.uri !== fileUrl && file.name !== fileName);

        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: "SET reportFiles = :reportFiles, updatedAt = :updatedAt",
            ExpressionAttributeValues: { ":reportFiles": reportFiles, ":updatedAt": new Date().toISOString() }
        }));

        return successResponse({ message: "File deleted successfully", remainingFiles: reportFiles.length });
    } catch (error) {
        console.error("deletePatientFile error:", error);
        return errorResponse(500, "Failed to delete file", error);
    }
}
