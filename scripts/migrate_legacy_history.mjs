import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config'; // Make sure to install dotenv or pass AWS credentials

const REGION = process.env.AWS_REGION || "ap-south-1";
const client = new DynamoDBClient({ region: REGION });
const dynamodb = DynamoDBDocumentClient.from(client);

const VISITS_TABLE = 'Visits';
const CLINICAL_HISTORY_TABLE = 'ClinicalParametersHistory';
const MEDICAL_HISTORY_TABLE = 'MedicalHistoryEntries';
const DIAGNOSIS_HISTORY_TABLE = 'DiagnosisHistoryEntries';
const INVESTIGATIONS_HISTORY_TABLE = 'InvestigationsHistoryEntries';

async function scanAll(tableName) {
    let items = [];
    let lastEvaluatedKey = undefined;
    do {
        const result = await dynamodb.send(new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey
        }));
        if (result.Items) items.push(...result.Items);
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return items;
}

async function updateVisit(visitId, patientId, updateExpression, expressionExpressionValues, expressionAttributeNames) {
    try {
        await dynamodb.send(new UpdateCommand({
            TableName: VISITS_TABLE,
            Key: { visitId },
            UpdateExpression: `SET status = :status, patientId = :patientId, ${updateExpression}`,
            ExpressionAttributeValues: {
                ":status": "COMPLETED",
                ":patientId": patientId,
                ...expressionExpressionValues
            },
            ExpressionAttributeNames: expressionAttributeNames
        }));
        console.log(`✅ Updated visit ${visitId}`);
    } catch (e) {
        console.error(`❌ Failed to update visit ${visitId}:`, e.message);
    }
}

async function migrateClinical() {
    console.log("Migrating ClinicalParametersHistory...");
    const items = await scanAll(CLINICAL_HISTORY_TABLE);
    for (const item of items) {
        const visitId = item.visitId || `legacy_clinic_${Date.now()}`;
        const patientId = item.patientId;
        if (!patientId) continue;
        
        let params = { ...item };
        delete params.patientId;
        delete params.visitId;
        delete params.createdAt;
        delete params.doctorName;

        await updateVisit(
            visitId, 
            patientId, 
            "clinicalParameters = :params, doctorName = :doc, createdAt = if_not_exists(createdAt, :date)", 
            {
                ":params": params,
                ":doc": item.doctorName || "Dr. Tiwari",
                ":date": item.createdAt || new Date().toISOString()
            }
        );
    }
}

async function migrateMedical() {
    console.log("Migrating MedicalHistoryEntries...");
    const items = await scanAll(MEDICAL_HISTORY_TABLE);
    for (const item of items) {
        const visitId = item.visitId || `legacy_med_${Date.now()}`;
        const patientId = item.patientId;
        if (!patientId) continue;

        await updateVisit(
            visitId, 
            patientId, 
            "historyDetails = :hist, doctorName = :doc, createdAt = if_not_exists(createdAt, :date)", 
            {
                ":hist": item.historyDetails || item.newHistoryEntry || "",
                ":doc": item.doctorName || "Dr. Tiwari",
                ":date": item.createdAt || new Date().toISOString()
            }
        );
    }
}

async function migrateDiagnosis() {
    console.log("Migrating DiagnosisHistoryEntries...");
    const items = await scanAll(DIAGNOSIS_HISTORY_TABLE);
    for (const item of items) {
        const visitId = item.visitId || `legacy_diag_${Date.now()}`;
        const patientId = item.patientId;
        if (!patientId) continue;

        await updateVisit(
            visitId, 
            patientId, 
            "diagnosis = :diag, doctorName = :doc, createdAt = if_not_exists(createdAt, :date)", 
            {
                ":diag": item.diagnosis || "",
                ":doc": item.doctorName || "Dr. Tiwari",
                ":date": item.createdAt || new Date().toISOString()
            }
        );
    }
}

async function migrateInvestigations() {
    console.log("Migrating InvestigationsHistoryEntries...");
    const items = await scanAll(INVESTIGATIONS_HISTORY_TABLE);
    for (const item of items) {
        const visitId = item.visitId || `legacy_inv_${Date.now()}`;
        const patientId = item.patientId;
        if (!patientId) continue;

        await updateVisit(
            visitId, 
            patientId, 
            "advisedInvestigations = :inv, customInvestigations = :custom, doctorName = :doc, createdAt = if_not_exists(createdAt, :date)", 
            {
                ":inv": item.investigations || item.advisedInvestigations || [],
                ":custom": item.customInvestigations || "",
                ":doc": item.doctorName || "Dr. Tiwari",
                ":date": item.createdAt || new Date().toISOString()
            }
        );
    }
}

async function run() {
    console.log("🚀 Starting DB Migration...");
    await migrateClinical();
    await migrateMedical();
    await migrateDiagnosis();
    await migrateInvestigations();
    console.log("🎉 Migration Complete! Note: Verify data in Visits table before proceeding to Step 2.");
}

run();
