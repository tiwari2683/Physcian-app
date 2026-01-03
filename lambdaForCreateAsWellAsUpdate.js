import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// ============================================
// AWS CLIENT INITIALIZATION
// ============================================
const dynamoClient = new DynamoDBClient({ region: "ap-southeast-2" });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: { removeUndefinedValues: true }
});
const s3 = new S3Client({
    region: "ap-southeast-2",
    forcePathStyle: true
});

// ============================================
// CONSTANTS
// ============================================
const PATIENTS_TABLE = 'Patients';
const CLINICAL_HISTORY_TABLE = 'ClinicalParametersHistory';
const MEDICAL_HISTORY_TABLE = 'MedicalHistoryEntries';
const DIAGNOSIS_HISTORY_TABLE = 'DiagnosisHistoryEntries';
const INVESTIGATIONS_HISTORY_TABLE = 'InvestigationsHistoryEntries';
const REPORTS_BUCKET = 'dr-gawli-patient-files';

// History table configurations
const HISTORY_CONFIGS = {
    clinical: {
        tableName: CLINICAL_HISTORY_TABLE,
        idPrefix: 'param',
        fallbackFields: ['clinicalHistory', 'history.clinical'],
        itemKey: 'paramId'
    },
    medical: {
        tableName: MEDICAL_HISTORY_TABLE,
        idPrefix: 'history',
        fallbackFields: ['medicalHistoryEntries', 'history.medical'],
        itemKey: 'entryId'
    },
    diagnosis: {
        tableName: DIAGNOSIS_HISTORY_TABLE,
        idPrefix: 'diagnosis',
        fallbackFields: ['diagnosisHistory', 'history.diagnosis'],
        itemKey: 'entryId'
    },
    investigations: {
        tableName: INVESTIGATIONS_HISTORY_TABLE,
        idPrefix: 'inv',
        fallbackFields: ['investigationsHistory', 'history.investigations'],
        itemKey: 'entryId'
    }
};

// ============================================
// GENERIC HISTORY OPERATIONS
// ============================================

/**
 * Generic function to fetch history for any type
 */
async function fetchHistory(patientId, type, includeAll = true) {
    try {
        const config = HISTORY_CONFIGS[type];
        if (!config) throw new Error(`Unknown history type: ${type}`);

        console.log(`Fetching ${type} history for patient: ${patientId}`);

        // Check if dedicated history table exists
        let historyExists = await checkTableExists(config.tableName);
        let historyItems = [];

        // Try dedicated table first
        if (historyExists) {
            historyItems = await queryHistoryTable(patientId, config.tableName);
        }

        // Fallback to patient record if no results
        if (historyItems.length === 0) {
            historyItems = await fetchHistoryFromPatientRecord(patientId, config, includeAll);
        }

        // Sort and format
        historyItems = sortAndFormatHistory(historyItems);

        console.log(`Found ${historyItems.length} ${type} history entries`);
        return { success: true, [`${type}History`]: historyItems };
    } catch (error) {
        console.error(`Error fetching ${type} history:`, error.message);
        return { success: false, error: `Failed to fetch ${type} history: ${error.message}` };
    }
}

/**
 * Check if a DynamoDB table exists
 */
async function checkTableExists(tableName) {
    try {
        await dynamodb.send(new ScanCommand({ TableName: tableName, Limit: 1 }));
        return true;
    } catch (error) {
        console.warn(`Table ${tableName} not accessible:`, error.message);
        return false;
    }
}

/**
 * Query history from dedicated table
 */
async function queryHistoryTable(patientId, tableName) {
    try {
        const result = await dynamodb.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "patientId = :patientId",
            ExpressionAttributeValues: { ":patientId": patientId },
            ScanIndexForward: false
        }));
        return result.Items || [];
    } catch (error) {
        console.error(`Error querying ${tableName}:`, error.message);
        return [];
    }
}

/**
 * Fetch history from patient record as fallback
 */
async function fetchHistoryFromPatientRecord(patientId, config, includeAll) {
    try {
        const patientResult = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        const patient = patientResult.Item;
        if (!patient) return [];

        // Try different possible field locations
        for (const field of config.fallbackFields) {
            const value = getNestedValue(patient, field);
            if (Array.isArray(value) && value.length > 0) {
                return value;
            }
        }

        // Create synthetic entry if includeAll and relevant field exists
        if (includeAll) {
            return createSyntheticHistoryEntry(patient, config);
        }

        return [];
    } catch (error) {
        console.error(`Error fetching from patient record:`, error.message);
        return [];
    }
}

/**
 * Get nested object value by path (e.g., "history.diagnosis")
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Create synthetic history entry from current patient data
 */
function createSyntheticHistoryEntry(patient, config) {
    const timestamp = patient.updatedAt || new Date().toISOString();
    const baseEntry = {
        patientId: patient.patientId,
        date: timestamp,
        timestamp: new Date(timestamp).getTime(),
        synthesized: true
    };

    switch (config.idPrefix) {
        case 'diagnosis':
            return patient.diagnosis ? [{
                ...baseEntry,
                diagnosis: patient.diagnosis,
                advisedInvestigations: patient.advisedInvestigations || ""
            }] : [];
        case 'inv':
            return patient.advisedInvestigations ? [{
                ...baseEntry,
                advisedInvestigations: patient.advisedInvestigations,
                doctor: "Dr. Dipak Gawli"
            }] : [];
        default:
            return [];
    }
}

/**
 * Sort and format history entries
 */
function sortAndFormatHistory(items) {
    if (!items.length) return items;

    // Sort by timestamp (newest first)
    items.sort((a, b) => {
        const tsA = a.timestamp || new Date(a.date).getTime();
        const tsB = b.timestamp || new Date(b.date).getTime();
        return tsB - tsA;
    });

    // Format dates
    return items.map(item => {
        try {
            const date = new Date(item.date);
            return {
                ...item,
                formattedDate: date.toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric"
                }),
                formattedTime: date.toLocaleTimeString("en-US", {
                    hour: "2-digit", minute: "2-digit", hour12: true
                })
            };
        } catch (error) {
            return item;
        }
    });
}

/**
 * Generic function to save history entry
 */
async function saveHistoryEntry(patientId, data, type, doctor = "Dr. Dipak Gawli") {
    try {
        const config = HISTORY_CONFIGS[type];
        if (!config) throw new Error(`Unknown history type: ${type}`);

        // Validate data
        if (!data || (typeof data === 'string' && !data.trim())) {
            console.log(`No ${type} data provided, skipping history save`);
            return false;
        }

        const now = new Date();
        const timestamp = now.getTime();

        // Create history record
        const historyRecord = {
            patientId,
            [config.itemKey]: `${patientId}_${config.idPrefix}_${timestamp}`,
            timestamp,
            date: now.toISOString(),
            ...(typeof data === 'string' ? { text: data } : data),
            doctor
        };

        // Try dedicated table first
        try {
            await dynamodb.send(new PutCommand({
                TableName: config.tableName,
                Item: historyRecord
            }));
            console.log(`Saved ${type} history to dedicated table`);
            return true;
        } catch (tableError) {
            console.warn(`Dedicated table not available, using fallback`);
            return await saveHistoryToPatientRecord(patientId, historyRecord, config);
        }
    } catch (error) {
        console.error(`Error saving ${type} history:`, error.message);
        return false;
    }
}

/**
 * Save history to patient record as fallback
 */
async function saveHistoryToPatientRecord(patientId, historyRecord, config) {
    try {
        const patientRecord = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientRecord.Item) {
            console.error(`Patient ${patientId} not found`);
            return false;
        }

        const historyField = config.fallbackFields[0];
        const currentHistory = patientRecord.Item[historyField] || [];
        currentHistory.push(historyRecord);

        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: `SET ${historyField} = :history`,
            ExpressionAttributeValues: { ":history": currentHistory }
        }));

        console.log(`Saved ${config.idPrefix} history to patient record`);
        return true;
    } catch (error) {
        console.error(`Fallback save failed:`, error.message);
        return false;
    }
}

// ============================================
// PUBLIC HISTORY API FUNCTIONS
// ============================================

async function fetchClinicalHistory(patientId) {
    return fetchHistory(patientId, 'clinical');
}

async function fetchMedicalHistory(patientId) {
    return fetchHistory(patientId, 'medical');
}

async function fetchDiagnosisHistory(patientId, includeAll = true) {
    return fetchHistory(patientId, 'diagnosis', includeAll);
}

async function fetchInvestigationsHistory(patientId, includeAll = true) {
    return fetchHistory(patientId, 'investigations', includeAll);
}

async function saveClinicalParametersHistory(patientId, parameters) {
    const data = { ...parameters, recordDate: new Date().toISOString() };
    return saveHistoryEntry(patientId, data, 'clinical');
}

async function saveMedicalHistoryEntry(patientId, historyText) {
    return saveHistoryEntry(patientId, historyText, 'medical');
}

async function saveDiagnosisHistoryEntry(patientId, diagnosis, advisedInvestigations = "") {
    const data = { diagnosis, advisedInvestigations };
    return saveHistoryEntry(patientId, data, 'diagnosis');
}

async function saveInvestigationsHistoryEntry(patientId, advisedInvestigations, doctor = "Dr. Dipak Gawli") {
    return saveHistoryEntry(patientId, advisedInvestigations, 'investigations', doctor);
}

// ============================================
// PATIENT OPERATIONS
// ============================================

async function handleGetPatient(patientId, forceRefresh = false) {
    try {
        const command = new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            ConsistentRead: forceRefresh
        });

        const result = await dynamodb.send(command);
        if (!result.Item) {
            return { success: false, message: `Patient not found with ID: ${patientId}` };
        }

        const patientData = result.Item;

        // Sign S3 URLs for report files
        if (patientData.reportFiles?.length) {
            patientData.reportFiles = await Promise.all(
                patientData.reportFiles.map(async (file) => {
                    if (file.key && (file.uploadedToS3 || !file.storedLocally)) {
                        try {
                            const signedUrl = await getSignedUrl(
                                s3,
                                new GetObjectCommand({ Bucket: REPORTS_BUCKET, Key: file.key }),
                                { expiresIn: 3600 }
                            );
                            return { ...file, url: signedUrl };
                        } catch (e) {
                            console.warn(`Failed to sign URL for ${file.key}`);
                            return file;
                        }
                    }
                    return file;
                })
            );
        }

        // Fetch all history types
        const [clinical, medical, diagnosis, investigations] = await Promise.all([
            fetchClinicalHistory(patientId),
            fetchMedicalHistory(patientId),
            fetchDiagnosisHistory(patientId),
            fetchInvestigationsHistory(patientId)
        ]);

        return {
            success: true,
            patient: patientData,
            clinicalHistory: clinical.clinicalHistory || [],
            medicalHistory: medical.medicalHistory || [],
            diagnosisHistory: diagnosis.diagnosisHistory || [],
            investigationsHistory: investigations.investigationsHistory || [],
            freshData: forceRefresh
        };
    } catch (error) {
        console.error(`Error getting patient:`, error.message);
        return { success: false, error: `Failed to get patient: ${error.message}` };
    }
}

async function handleGetPatientFiles(patientId) {
    try {
        const allFiles = [];

        // Get files from patient record
        const patientRecord = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        const recordFiles = patientRecord.Item?.reportFiles || [];

        // Get files from S3
        const listResult = await s3.send(new ListObjectsV2Command({
            Bucket: REPORTS_BUCKET,
            Prefix: `${patientId}/`
        }));

        const s3Files = await Promise.all(
            (listResult.Contents || []).map(async (object) => {
                const signedUrl = await getSignedUrl(
                    s3,
                    new GetObjectCommand({ Bucket: REPORTS_BUCKET, Key: object.Key }),
                    { expiresIn: 3600 }
                );

                return {
                    name: object.Key.split('/').pop(),
                    key: object.Key,
                    url: signedUrl,
                    size: object.Size,
                    lastModified: object.LastModified?.toISOString(),
                    fromS3: true
                };
            })
        );

        // Deduplicate by URL/key
        const fileMap = new Map();
        [...s3Files, ...recordFiles].forEach(file => {
            const key = file.key || file.url;
            if (key && !fileMap.has(key)) {
                fileMap.set(key, file);
            }
        });

        return { success: true, files: Array.from(fileMap.values()) };
    } catch (error) {
        console.error(`Error getting patient files:`, error.message);
        return { success: false, error: `Failed to get patient files: ${error.message}` };
    }
}

async function getAllPatients() {
    try {
        const result = await dynamodb.send(new ScanCommand({ TableName: PATIENTS_TABLE }));
        const patients = (result.Items || []).sort((a, b) => {
            const dateA = new Date(a.lastVisitDate || a.createdAt || 0);
            const dateB = new Date(b.lastVisitDate || b.createdAt || 0);
            return dateB - dateA;
        });

        return { success: true, patients, count: patients.length };
    } catch (error) {
        console.error("Error getting all patients:", error.message);
        return { success: false, error: error.message };
    }
}

async function searchPatients(requestData) {
    const { searchTerm } = requestData;
    if (!searchTerm?.trim()) return getAllPatients();

    try {
        const searchLower = searchTerm.toLowerCase().trim();
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE,
            FilterExpression: "contains(#name, :search) OR contains(mobile, :search)",
            ExpressionAttributeNames: { "#name": "name" },
            ExpressionAttributeValues: { ":search": searchLower }
        }));

        return { success: true, patients: result.Items || [], count: result.Items?.length || 0 };
    } catch (error) {
        console.error("Error searching patients:", error.message);
        return { success: false, error: error.message };
    }
}

async function deletePatient(requestData) {
    const { patientId } = requestData;
    if (!patientId) return formatErrorResponse("Missing patientId");

    try {
        await dynamodb.send(new DeleteCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));
        return { success: true, message: "Patient deleted successfully", patientId };
    } catch (error) {
        console.error("Error deleting patient:", error.message);
        return { success: false, error: error.message };
    }
}

async function deletePatientFile(requestData) {
    const { patientId, fileUrl, fileName } = requestData;
    if (!patientId || (!fileUrl && !fileName)) {
        return formatErrorResponse("Missing patientId or file identifier");
    }

    try {
        const patientRecord = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientRecord.Item) return formatErrorResponse("Patient not found");

        const reportFiles = (patientRecord.Item.reportFiles || []).filter(
            file => file.url !== fileUrl && file.uri !== fileUrl && file.name !== fileName
        );

        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: "SET reportFiles = :reportFiles, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":reportFiles": reportFiles,
                ":updatedAt": new Date().toISOString()
            }
        }));

        return { success: true, message: "File deleted successfully", remainingFiles: reportFiles.length };
    } catch (error) {
        console.error("Error deleting file:", error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// FILE PROCESSING
// ============================================

async function processReportFiles(reportFiles, patientId) {
    const processedFiles = [];
    const filesForResponse = [];
    const failedUploads = [];

    if (!Array.isArray(reportFiles)) return { processedFiles, filesForResponse, failedUploads };

    // Deduplicate
    const uniqueFiles = deduplicateFiles(reportFiles, []);

    for (const file of uniqueFiles) {
        try {
            // Case 1: Existing remote URL
            if (file.uri?.startsWith('http')) {
                const existingFile = {
                    name: file.name || `file_${Date.now()}`,
                    type: file.type || 'application/octet-stream',
                    url: file.uri,
                    uri: file.uri,
                    existing: true,
                    category: file.category || 'uncategorized',
                    processedAt: new Date().toISOString()
                };
                processedFiles.push(existingFile);
                filesForResponse.push(existingFile);
                continue;
            }

            // Case 2: New upload
            if (!file.base64Data) {
                failedUploads.push(file.name || "Unknown File");
                continue;
            }

            const timestamp = Date.now();
            const sanitizedName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileKey = `${patientId}/${timestamp}-${Math.floor(Math.random() * 10000)}-${sanitizedName}`;

            // Clean and prepare base64
            let cleanBase64 = file.base64Data;
            if (cleanBase64.startsWith('data:')) {
                cleanBase64 = cleanBase64.split(',')[1];
            }
            const fileBuffer = Buffer.from(cleanBase64, 'base64');
            const fileType = file.type || 'application/octet-stream';

            // Upload to S3
            await s3.send(new PutObjectCommand({
                Bucket: REPORTS_BUCKET,
                Key: fileKey,
                Body: fileBuffer,
                ContentType: fileType,
                Metadata: {
                    'patient-id': patientId,
                    'original-name': sanitizedName,
                    'category': file.category || 'uncategorized'
                }
            }));

            // Verify upload
            await s3.send(new HeadObjectCommand({ Bucket: REPORTS_BUCKET, Key: fileKey }));

            // Create DB entry (no URL)
            const dbEntry = {
                key: fileKey,
                name: file.name || sanitizedName,
                type: fileType,
                size: fileBuffer.length,
                category: file.category || 'uncategorized',
                uploadedToS3: true,
                uploadSuccessTime: new Date().toISOString(),
                patientId
            };

            // Create response entry (with signed URL)
            const signedUrl = await getSignedUrl(
                s3,
                new GetObjectCommand({ Bucket: REPORTS_BUCKET, Key: fileKey }),
                { expiresIn: 3600 }
            );

            processedFiles.push(dbEntry);
            filesForResponse.push({ ...dbEntry, url: signedUrl });

        } catch (error) {
            console.error(`Upload failed for ${file.name}:`, error.message);
            failedUploads.push(file.name || "Unknown File");
        }
    }

    return { processedFiles, failedUploads, filesForResponse };
}

function deduplicateFiles(newFiles, existingFiles) {
    if (!Array.isArray(newFiles) || !newFiles.length) return [];

    const existingKeys = new Set(
        (existingFiles || []).map(f => getFileUniqueKey(f))
    );

    const seen = new Set();
    return newFiles.filter(file => {
        const key = getFileUniqueKey(file);
        if (existingKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getFileUniqueKey(file) {
    if (file.url) return `url:${file.url}`;
    if (file.uri) return `uri:${file.uri}`;
    if (file.key) return `key:${file.key}`;
    if (file.base64Data) {
        const fingerprint = file.base64Data.substring(0, 100);
        return `data:${file.name || ''}_${fingerprint}`;
    }
    return `name:${file.name || 'unnamed'}_${file.category || 'uncategorized'}`;
}

// ============================================
// PATIENT SAVE/UPDATE OPERATIONS
// ============================================

async function processPatientData(patientData) {
    try {
        if (!patientData.name || !patientData.age) {
            return formatErrorResponse("Missing required patient information (name or age)");
        }

        const patientId = randomUUID();
        console.log(`Creating patient: ${patientId}`);

        // Process medications
        if (patientData.medications?.length) {
            patientData.medications = processMedications(patientData.medications);
        }

        // Process files
        const { processedFiles, failedUploads, filesForResponse } = 
            await processReportFiles(patientData.reportFiles || [], patientId);

        // Generate prescription
        const generatedPrescription = patientData.medications?.length
            ? generatePrescriptionText(patientData.medications)
            : "";

        // Create patient item
        const patientItem = {
            patientId,
            name: patientData.name,
            age: parseInt(patientData.age) || 0,
            sex: patientData.sex,
            mobile: patientData.mobile || "",
            address: patientData.address || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            medicalHistory: patientData.medicalHistory || "",
            diagnosis: patientData.diagnosis || "",
            advisedInvestigations: patientData.advisedInvestigations || "",
            reports: patientData.reports || "",
            firstVisit: {
                date: new Date().toISOString().split('T')[0],
                diagnosis: patientData.diagnosis || "",
                reports: patientData.reports || "",
                advisedInvestigations: patientData.advisedInvestigations || ""
            },
            medications: patientData.medications || [],
            reportFiles: processedFiles,
            generatedPrescription,
            savedSections: { basic: true, clinical: true, prescription: true, diagnosis: true },
            clinicalParameters: patientData.clinicalParameters || initializeClinicaParameters()
        };

        // Save to DynamoDB
        await dynamodb.send(new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: patientItem
        }));

        // Save history entries
        await Promise.all([
            patientData.clinicalParameters && patientData.createParameterHistory
                ? saveClinicalParametersHistory(patientId, patientData.clinicalParameters)
                : null,
            patientData.medicalHistory && patientData.createMedicalHistoryEntry
                ? saveMedicalHistoryEntry(patientId, patientData.medicalHistory)
                : null,
            patientData.diagnosis && patientData.createDiagnosisHistory
                ? saveDiagnosisHistoryEntry(patientId, patientData.diagnosis, patientData.advisedInvestigations)
                : null,
            patientData.advisedInvestigations
                ? saveInvestigationsHistoryEntry(patientId, patientData.advisedInvestigations)
                : null
        ].filter(Boolean));

        return {
            statusCode: 200,
            headers: corsHeaders(),
            body: JSON.stringify({
                success: true,
                message: 'Patient added successfully',
                patientId,
                savedSections: patientItem.savedSections,
                fileDetails: processedFiles.length || failedUploads.length ? {
                    filesProcessed: processedFiles.length,
                    failedUploads,
                    fileUrls: filesForResponse.map(f => ({
                        name: f.name,
                        url: f.url,
                        category: f.category || 'uncategorized'
                    }))
                } : null,
                generatedPrescription
            })
        };
    } catch (error) {
        console.error('Error creating patient:', error.message);
        return formatErrorResponse(error.message);
    }
}

async function processSectionSave(sectionData) {
    try {
        const section = sectionData.saveSection;
        if (!section) return formatErrorResponse("Section must be specified");

        let patientId = sectionData.patientId;
        let existingPatient = null;

        // Find existing patient
        if (patientId) {
            const result = await dynamodb.send(new GetCommand({
                TableName: PATIENTS_TABLE,
                Key: { patientId }
            }));
            existingPatient = result.Item;

            // Validate patient match
            if (existingPatient && sectionData.name && existingPatient.name !== sectionData.name) {
                console.warn(`Patient mismatch, creating new record`);
                patientId = null;
                existingPatient = null;
            }
        }

        // Generate new ID if needed
        if (!patientId) {
            patientId = randomUUID();
        }

        // Initialize saved sections
        const savedSections = existingPatient?.savedSections || {
            basic: false, clinical: false, prescription: false, diagnosis: false
        };
        savedSections[section] = true;

        // Build patient item
        let patientItem = existingPatient || {
            patientId,
            createdAt: new Date().toISOString(),
            name: "",
            age: 0,
            sex: "Male"
        };

        patientItem.updatedAt = new Date().toISOString();
        patientItem.lastVisitDate = new Date().toISOString();
        patientItem.savedSections = savedSections;

        // Process section-specific data
        await processSectionData(section, sectionData, patientItem, patientId);

        // Add firstVisit if missing
        if (!patientItem.firstVisit) {
            patientItem.firstVisit = {
                date: new Date().toISOString().split('T')[0],
                diagnosis: patientItem.diagnosis || "",
                reports: patientItem.reports || "",
                advisedInvestigations: patientItem.advisedInvestigations || ""
            };
        }

        // Save patient
        await dynamodb.send(new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: patientItem
        }));

        const allSectionsSaved = Object.values(savedSections).every(s => s);

        return {
            statusCode: 200,
            headers: corsHeaders(),
            body: JSON.stringify({
                success: true,
                message: allSectionsSaved ? 'All sections saved' : `Section ${section} saved`,
                patientId,
                isComplete: allSectionsSaved,
                savedSections
            })
        };
    } catch (error) {
        console.error('Error in section save:', error.message);
        return formatErrorResponse(error.message);
    }
}

async function processSectionData(section, sectionData, patientItem, patientId) {
    switch (section) {
        case 'basic':
            if (!sectionData.name || !sectionData.age || !sectionData.mobile) {
                throw new Error("Missing required basic information");
            }
            patientItem.name = sectionData.name;
            patientItem.age = parseInt(sectionData.age) || 0;
            patientItem.sex = sectionData.sex || "Male";
            patientItem.mobile = sectionData.mobile;
            patientItem.address = sectionData.address || "";
            patientItem.savedSections.basic = true;
            break;

        case 'clinical':
            await handleClinicalUpdate(sectionData, patientItem, patientId);
            break;

        case 'prescription':
            await handlePrescriptionUpdate(sectionData, patientItem, patientId);
            break;

        case 'diagnosis':
            await handleDiagnosisUpdate(sectionData, patientItem, patientId);
            break;
    }
}

async function handleClinicalUpdate(data, patient, patientId) {
    // Medical history with tracking
    if (data.medicalHistory !== undefined) {
        const hasChanged = data.medicalHistory !== (patient.medicalHistory || "");
        const shouldSave = hasChanged && (
            data.createMedicalHistoryEntry ||
            data.medicalHistory.includes("--- New Entry (") ||
            data.pendingHistoryIncluded
        );

        if (shouldSave) {
            await saveMedicalHistoryEntry(patientId, data.medicalHistory);
        }
        patient.medicalHistory = data.medicalHistory;
    }

    // Diagnosis with tracking
    if (data.diagnosis !== undefined) {
        const hasChanged = data.diagnosis !== (patient.diagnosis || "");
        if (hasChanged && data.createDiagnosisHistory) {
            await saveDiagnosisHistoryEntry(patientId, data.diagnosis, data.advisedInvestigations);
        }
        patient.diagnosis = data.diagnosis;
    }

    // Investigations with tracking
    if (data.advisedInvestigations !== undefined) {
        const hasChanged = data.advisedInvestigations !== (patient.advisedInvestigations || "");
        if (hasChanged && data.advisedInvestigations.trim()) {
            await saveInvestigationsHistoryEntry(patientId, data.advisedInvestigations);
        }
        patient.advisedInvestigations = data.advisedInvestigations;
    }

    // Reports and parameters
    if (data.reports !== undefined) patient.reports = data.reports;
    if (data.clinicalParameters) {
        patient.clinicalParameters = data.clinicalParameters;
        if (data.createParameterHistory) {
            await saveClinicalParametersHistory(patientId, data.clinicalParameters);
        }
    }

    // Report files
    if (data.reportFiles?.length) {
        const existing = patient.reportFiles || [];
        const newFiles = deduplicateFiles(data.reportFiles, existing);
        if (newFiles.length) {
            const { processedFiles } = await processReportFiles(newFiles, patientId);
            patient.reportFiles = [...existing, ...processedFiles];
        }
    }
}

async function handlePrescriptionUpdate(data, patient, patientId) {
    // Apply basic info if provided with prescription
    if (data.name && data.mobile) {
        patient.name = data.name;
        patient.mobile = data.mobile;
        if (data.age) patient.age = parseInt(data.age) || 0;
        if (data.sex) patient.sex = data.sex;
        patient.savedSections.basic = true;
    }

    // Process medications
    if (data.medications?.length) {
        patient.medications = processMedications(data.medications);
        patient.generatedPrescription = generatePrescriptionText(patient.medications);
    } else {
        patient.medications = patient.medications || [];
    }
}

async function handleDiagnosisUpdate(data, patient, patientId) {
    // Diagnosis with tracking
    if (data.diagnosis !== undefined) {
        const hasChanged = data.diagnosis !== (patient.diagnosis || "");
        if (hasChanged && data.createDiagnosisHistory) {
            await saveDiagnosisHistoryEntry(patientId, data.diagnosis, data.advisedInvestigations);
        }
        patient.diagnosis = data.diagnosis;
    }

    // Investigations with tracking
    if (data.advisedInvestigations !== undefined) {
        const hasChanged = data.advisedInvestigations !== (patient.advisedInvestigations || "");
        if (hasChanged && data.advisedInvestigations.trim()) {
            await saveInvestigationsHistoryEntry(patientId, data.advisedInvestigations);
        }
        patient.advisedInvestigations = data.advisedInvestigations;
    }

    // Report files
    if (data.reportFiles?.length) {
        const existing = patient.reportFiles || [];
        const newFiles = deduplicateFiles(data.reportFiles, existing);
        if (newFiles.length) {
            const { processedFiles } = await processReportFiles(newFiles, patientId);
            patient.reportFiles = [...existing, ...processedFiles];
        }
    }
}

async function updatePatientData(updateData) {
    try {
        const { patientId, updateSection } = updateData;
        if (!patientId) return formatErrorResponse("Patient ID required");

        // Fetch current patient
        const result = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!result.Item) {
            return formatErrorResponse(`Patient ${patientId} not found`);
        }

        const currentPatient = result.Item;
        const savedSections = currentPatient.savedSections || {
            basic: false, clinical: false, prescription: false, diagnosis: false
        };

        // If no specific section, do full update
        if (!updateSection) {
            const mergedData = {
                ...currentPatient,
                ...updateData,
                patientId: currentPatient.patientId,
                updatedAt: new Date().toISOString(),
                savedSections: { basic: true, clinical: true, prescription: true, diagnosis: true }
            };

            // Handle history fields
            await handleHistoryUpdates(patientId, currentPatient, updateData);

            if (updateData.medications) {
                mergedData.generatedPrescription = generatePrescriptionText(mergedData.medications);
            }

            await dynamodb.send(new PutCommand({
                TableName: PATIENTS_TABLE,
                Item: mergedData
            }));

            return formatSuccessResponse("Patient updated successfully", patientId, mergedData.savedSections);
        }

        // Sectional update
        let updateExpression = "SET updatedAt = :updatedAt";
        const expressionValues = { ":updatedAt": new Date().toISOString() };
        const expressionNames = {};

        // Build update based on section
        await buildSectionUpdate(updateSection, updateData, currentPatient, savedSections, updateExpression, expressionValues, expressionNames);

        savedSections[updateSection] = true;
        updateExpression += ", savedSections = :savedSections";
        expressionValues[":savedSections"] = savedSections;

        // Execute update
        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionValues,
            ...(Object.keys(expressionNames).length && { ExpressionAttributeNames: expressionNames })
        }));

        return formatSuccessResponse(`${updateSection} updated successfully`, patientId, savedSections);
    } catch (error) {
        console.error('Error updating patient:', error.message);
        return formatErrorResponse(error.message);
    }
}

async function buildSectionUpdate(section, data, current, savedSections, expr, values, names) {
    switch (section) {
        case 'basic':
            if (data.name) {
                expr += ", #name = :name";
                values[":name"] = data.name;
                names["#name"] = "name";
            }
            if (data.age !== undefined) {
                expr += ", age = :age";
                values[":age"] = parseInt(data.age) || 0;
            }
            if (data.sex) {
                expr += ", sex = :sex";
                values[":sex"] = data.sex;
            }
            if (data.mobile !== undefined) {
                expr += ", mobile = :mobile";
                values[":mobile"] = data.mobile;
            }
            if (data.address !== undefined) {
                expr += ", address = :address";
                values[":address"] = data.address;
            }
            savedSections.basic = true;
            break;

        case 'clinical':
        case 'diagnosis':
            await handleHistoryUpdatesForSection(current.patientId, current, data, expr, values);
            break;

        case 'prescription':
            if (data.medications) {
                const processed = processMedications(data.medications);
                expr += ", medications = :medications, generatedPrescription = :prescription";
                values[":medications"] = processed;
                values[":prescription"] = generatePrescriptionText(processed);
            }
            savedSections.prescription = true;
            break;
    }
}

async function handleHistoryUpdates(patientId, current, data) {
    const updates = [
        { field: 'medicalHistory', type: 'medical', flag: 'createMedicalHistoryEntry' },
        { field: 'diagnosis', type: 'diagnosis', flag: 'createDiagnosisHistory' },
        { field: 'advisedInvestigations', type: 'investigations', flag: null }
    ];

    for (const { field, type, flag } of updates) {
        if (data[field] !== undefined && data[field] !== current[field]) {
            if (!flag || data[flag]) {
                if (type === 'diagnosis') {
                    await saveDiagnosisHistoryEntry(patientId, data[field], data.advisedInvestigations);
                } else if (type === 'investigations') {
                    await saveInvestigationsHistoryEntry(patientId, data[field]);
                } else {
                    await saveHistoryEntry(patientId, data[field], type);
                }
            }
        }
    }
}

async function handleHistoryUpdatesForSection(patientId, current, data, expr, values) {
    if (data.medicalHistory !== undefined) {
        const changed = data.medicalHistory !== (current.medicalHistory || "");
        if (changed && (data.createMedicalHistoryEntry || data.medicalHistory.includes("--- New Entry ("))) {
            await saveMedicalHistoryEntry(patientId, data.medicalHistory);
        }
        expr += ", medicalHistory = :medicalHistory";
        values[":medicalHistory"] = data.medicalHistory;
    }

    if (data.diagnosis !== undefined) {
        const changed = data.diagnosis !== (current.diagnosis || "");
        if (changed && data.createDiagnosisHistory) {
            await saveDiagnosisHistoryEntry(patientId, data.diagnosis, data.advisedInvestigations);
        }
        expr += ", diagnosis = :diagnosis";
        values[":diagnosis"] = data.diagnosis;
    }

    if (data.advisedInvestigations !== undefined) {
        const changed = data.advisedInvestigations !== (current.advisedInvestigations || "");
        if (changed && data.advisedInvestigations.trim()) {
            await saveInvestigationsHistoryEntry(patientId, data.advisedInvestigations);
        }
        expr += ", advisedInvestigations = :advisedInvestigations";
        values[":advisedInvestigations"] = data.advisedInvestigations;
    }

    if (data.reports !== undefined) {
        expr += ", reports = :reports";
        values[":reports"] = data.reports;
    }

    if (data.clinicalParameters) {
        expr += ", clinicalParameters = :clinicalParameters";
        values[":clinicalParameters"] = data.clinicalParameters;
        if (data.createParameterHistory) {
            await saveClinicalParametersHistory(patientId, data.clinicalParameters);
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function processMedications(medications) {
    if (!Array.isArray(medications)) return [];

    return medications.map(med => {
        const processed = { ...med };
        if (!processed.name?.trim()) {
            processed.name = `Medication ${Date.now()}`;
        }

        // Ensure timingValues is JSON string
        if (processed.timingValues) {
            if (typeof processed.timingValues !== 'string') {
                processed.timingValues = JSON.stringify(processed.timingValues);
            }
        } else {
            processed.timingValues = "{}";
        }

        processed.specialInstructions = processed.specialInstructions || "";
        processed.duration = processed.duration || "as needed";
        processed.processedAt = processed.processedAt || new Date().toISOString();

        return processed;
    });
}

function generatePrescriptionText(medications) {
    if (!medications?.length) return "";

    return medications.map((med, i) => {
        let line = `${i + 1}. ${med.name || "Medication"}`;

        try {
            const timingValues = typeof med.timingValues === 'string'
                ? JSON.parse(med.timingValues)
                : med.timingValues;

            const timingText = Object.entries(timingValues)
                .map(([time, value]) => `${time.charAt(0).toUpperCase() + time.slice(1)}: ${value}`)
                .join(", ");

            if (timingText) line += ` - ${timingText}`;
        } catch (e) {
            console.warn(`Error parsing timing for med ${i + 1}`);
        }

        if (med.duration) line += ` for ${med.duration}`;
        if (med.specialInstructions?.trim()) {
            line += `\n   Special Instructions: ${med.specialInstructions}`;
        }

        return line;
    }).join("\n\n");
}

function initializeClinicaParameters() {
    return {
        date: new Date().toISOString().split('T')[0],
        inr: "", hb: "", wbc: "", platelet: "", bilirubin: "",
        sgot: "", sgpt: "", alt: "", tprAlb: "", ureaCreat: "",
        sodium: "", fastingHBA1C: "", pp: "", tsh: "", ft4: "", others: ""
    };
}

function corsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    };
}

function formatErrorResponse(message) {
    return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, message: 'Failed to process request', error: message })
    };
}

function formatSuccessResponse(message, patientId, savedSections) {
    return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ success: true, message, patientId, savedSections })
    };
}

// ============================================
// MAIN HANDLER
// ============================================

export const handler = async (event, context) => {
    try {
        context.callbackWaitsForEmptyEventLoop = false;

        // Handle OPTIONS (CORS preflight)
        if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE"
                },
                body: ""
            };
        }

        // Parse request data
        let requestData;
        if (event.body) {
            let rawBody = event.isBase64Encoded 
                ? Buffer.from(event.body, 'base64').toString('utf8') 
                : event.body;
            requestData = JSON.parse(rawBody);
        } else if (typeof event === 'string') {
            requestData = JSON.parse(event);
        } else {
            requestData = event;
        }

        // Route by action
        const { action, patientId, updateMode, isPartialSave } = requestData;

        // Action-based routing
        if (action === 'getInvestigationsHistory') {
            const includeAll = requestData.includeAll === true || requestData.includeAll === 'true';
            const response = await fetchInvestigationsHistory(patientId, includeAll);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'getDiagnosisHistory') {
            const includeAll = requestData.includeAll === true || requestData.includeAll === 'true';
            const response = await fetchDiagnosisHistory(patientId, includeAll);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'getPatientFiles') {
            const response = await handleGetPatientFiles(patientId);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'getPatient') {
            const response = await handleGetPatient(patientId);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'getClinicalHistory') {
            const response = await fetchClinicalHistory(patientId);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'getMedicalHistory') {
            const response = await fetchMedicalHistory(patientId);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'getAllPatients') {
            const response = await getAllPatients();
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'searchPatients') {
            const response = await searchPatients(requestData);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'deletePatient') {
            const response = await deletePatient(requestData);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        if (action === 'deletePatientFile') {
            const response = await deletePatientFile(requestData);
            return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(response) };
        }

        // Operation-based routing
        const isUpdate = patientId && (
            updateMode === true ||
            updateMode === 'true' ||
            String(updateMode).toLowerCase() === 'true'
        );

        if (isUpdate) {
            return await updatePatientData(requestData);
        } else if (isPartialSave === true || isPartialSave === 'true') {
            return await processSectionSave(requestData);
        } else {
            return await processPatientData(requestData);
        }
    } catch (error) {
        console.error('Handler error:', error);
        return formatErrorResponse(error.message || "Request processing failed");
    }
};