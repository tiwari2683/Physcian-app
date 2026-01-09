import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: "ap-southeast-2" });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const s3 = new S3Client({
    region: "ap-southeast-2",
    forcePathStyle: true
});

// Table names
const PATIENTS_TABLE = 'Patients';
const CLINICAL_HISTORY_TABLE = 'ClinicalParametersHistory';
const MEDICAL_HISTORY_TABLE = 'MedicalHistoryEntries';
const DIAGNOSIS_HISTORY_TABLE = 'DiagnosisHistoryEntries';
const INVESTIGATIONS_HISTORY_TABLE = 'InvestigationsHistoryEntries';
const REPORTS_BUCKET = 'dr-gawli-patient-files';

// ============================================
// PRESIGNED URL GENERATION FOR UPLOADS
// ============================================

/**
 * Generate presigned URL for direct file upload from frontend
 * This eliminates Base64 encoding entirely
 */
async function generatePresignedUploadUrl(requestData) {
    try {
        const { patientId, fileName, fileType, category = 'uncategorized' } = requestData;

        if (!patientId || !fileName) {
            return formatErrorResponse("Missing patientId or fileName");
        }

        // Generate unique S3 key
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 10000);
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const s3Key = `${patientId}/${timestamp}-${randomSuffix}-${sanitizedName}`;

        console.log(`📤 Generating presigned URL for: ${s3Key}`);

        // Create presigned PUT URL (expires in 5 minutes)
        const command = new PutObjectCommand({
            Bucket: REPORTS_BUCKET,
            Key: s3Key,
            ContentType: fileType || 'application/octet-stream',
            Metadata: {
                'patient-id': patientId,
                'original-name': sanitizedName,
                'category': category,
                'upload-timestamp': new Date().toISOString()
            }
        });

        const presignedUrl = await getSignedUrl(s3, command, {
            expiresIn: 300 // 5 minutes
        });

        console.log(`✅ Generated presigned URL for ${fileName}`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                uploadUrl: presignedUrl,
                s3Key: s3Key,
                fileName: fileName,
                expiresIn: 300
            })
        };
    } catch (error) {
        console.error('❌ Error generating presigned URL:', error);
        return formatErrorResponse(`Failed to generate upload URL: ${error.message}`);
    }
}

/**
 * Confirm file upload and save metadata to DynamoDB
 * Called after frontend successfully uploads to S3
 */
async function confirmFileUpload(requestData) {
    try {
        const { patientId, s3Key, fileName, fileType, category = 'uncategorized', fileSize } = requestData;

        if (!patientId || !s3Key) {
            return formatErrorResponse("Missing patientId or s3Key");
        }

        console.log(`🔍 Confirming upload for: ${s3Key}`);

        // Verify file exists in S3
        try {
            await s3.send(new HeadObjectCommand({
                Bucket: REPORTS_BUCKET,
                Key: s3Key
            }));
            console.log(`✅ File verified in S3: ${s3Key}`);
        } catch (error) {
            console.error(`❌ File not found in S3: ${s3Key}`);
            return formatErrorResponse("File upload verification failed");
        }

        // Get current patient record
        const patientResult = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientResult.Item) {
            return formatErrorResponse("Patient not found");
        }

        // Create file metadata (NO URLs, NO Base64)
        const fileMetadata = {
            s3Key: s3Key,
            fileName: fileName,
            fileType: fileType || 'application/octet-stream',
            category: category,
            fileSize: fileSize || 0,
            uploadedAt: new Date().toISOString(),
            uploadedToS3: true
        };

        // Add to patient's reportFiles array
        const currentFiles = patientResult.Item.reportFiles || [];
        currentFiles.push(fileMetadata);

        // Update patient record
        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: "SET reportFiles = :files, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":files": currentFiles,
                ":updatedAt": new Date().toISOString()
            }
        }));

        console.log(`✅ File metadata saved to DynamoDB for patient ${patientId}`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: "File upload confirmed",
                fileMetadata: fileMetadata
            })
        };
    } catch (error) {
        console.error('❌ Error confirming file upload:', error);
        return formatErrorResponse(`Failed to confirm upload: ${error.message}`);
    }
}

// ============================================
// SIGNED URL GENERATION FOR DOWNLOADS
// ============================================

/**
 * Non-destructive helper: Add signed URLs to report files
 * CRITICAL: Never removes data, only enriches it
 */
async function enrichPatientFilesWithSignedUrls(reportFiles) {
    if (!Array.isArray(reportFiles) || reportFiles.length === 0) {
        return [];
    }

    console.log(`🔐 Generating signed URLs for ${reportFiles.length} files`);

    const enrichedFiles = await Promise.all(
        reportFiles.map(async (file) => {
            try {
                // Preserve all original data
                const enrichedFile = { ...file };

                // Check for both 'key' and 's3Key' for backward compatibility
                const s3Key = file.s3Key || file.key;

                // Generate signed URL if we have an S3 key
                if (s3Key) {
                    try {
                        const command = new GetObjectCommand({
                            Bucket: REPORTS_BUCKET,
                            Key: s3Key
                        });

                        const signedUrl = await getSignedUrl(s3, command, {
                            expiresIn: 600 // 10 minutes for viewing
                        });

                        enrichedFile.url = signedUrl; // Set 'url' field for UI compatibility
                        enrichedFile.signedUrl = signedUrl; // Also keep signedUrl
                        enrichedFile.s3Key = s3Key; // Normalize to s3Key
                        enrichedFile.urlExpiresAt = new Date(Date.now() + 600000).toISOString();
                        console.log(`✅ Signed URL generated for: ${file.fileName || file.name}`);
                    } catch (signError) {
                        console.warn(`⚠️ Failed to sign ${file.fileName || file.name}: ${signError.message}`);
                        enrichedFile.signError = signError.message;
                        // File metadata still returned - no data loss
                    }
                } else {
                    console.warn(`⚠️ No S3 key for file: ${file.fileName || file.name}`);
                }

                return enrichedFile;
            } catch (error) {
                console.error(`❌ Error processing file: ${error.message}`);
                // Return original file data - no data loss
                return file;
            }
        })
    );

    return enrichedFiles;
}

// ============================================
// PATIENT DATA RETRIEVAL
// ============================================

async function handleGetPatient(patientId, forceRefresh = false) {
    try {
        console.log(`🔍 Getting patient data for ID: ${patientId}`);

        const command = new GetItemCommand({
            TableName: PATIENTS_TABLE,
            Key: { "patientId": { "S": patientId } }
        });

        if (forceRefresh) {
            command.input.ConsistentRead = true;
        }

        const result = await dynamoClient.send(command);

        if (!result.Item) {
            return formatErrorResponse(`Patient not found: ${patientId}`);
        }

        const patientData = unmarshallDynamoDBItem(result.Item);

        // Enrich report files with signed URLs (non-destructive)
        if (patientData.reportFiles && Array.isArray(patientData.reportFiles)) {
            console.log(`📂 Found ${patientData.reportFiles.length} report files`);
            patientData.reportFiles = await enrichPatientFilesWithSignedUrls(patientData.reportFiles);
        }

        // Get history data
        const clinicalHistoryResponse = await fetchClinicalHistory(patientId);
        const medicalHistoryResponse = await fetchMedicalHistory(patientId);
        const diagnosisHistoryResponse = await fetchDiagnosisHistory(patientId);
        const investigationsHistoryResponse = await fetchInvestigationsHistory(patientId);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: JSON.stringify({
                success: true,
                patient: patientData,
                clinicalHistory: clinicalHistoryResponse.clinicalHistory || [],
                medicalHistory: medicalHistoryResponse.medicalHistory || [],
                diagnosisHistory: diagnosisHistoryResponse.diagnosisHistory || [],
                investigationsHistory: investigationsHistoryResponse.investigationsHistory || [],
                freshData: forceRefresh
            })
        };
    } catch (error) {
        console.error('❌ Error getting patient:', error);
        return formatErrorResponse(`Failed to get patient: ${error.message}`);
    }
}

/**
 * Get all patient files with signed URLs
 */
async function handleGetPatientFiles(patientId) {
    try {
        console.log(`📂 Getting files for patient: ${patientId}`);

        // Get from DynamoDB
        const patientResult = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientResult.Item) {
            return formatErrorResponse("Patient not found");
        }

        const reportFiles = patientResult.Item.reportFiles || [];

        // Enrich with signed URLs
        const enrichedFiles = await enrichPatientFilesWithSignedUrls(reportFiles);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                files: enrichedFiles,
                count: enrichedFiles.length
            })
        };
    } catch (error) {
        console.error('❌ Error getting patient files:', error);
        return formatErrorResponse(`Failed to get files: ${error.message}`);
    }
}

/**
 * Delete a patient file
 */
async function deletePatientFile(requestData) {
    try {
        const { patientId, s3Key, fileName } = requestData;

        if (!patientId || (!s3Key && !fileName)) {
            return formatErrorResponse("Missing patientId or file identifier");
        }

        console.log(`🗑️ Deleting file: ${s3Key || fileName}`);

        // Get patient record
        const patientResult = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientResult.Item) {
            return formatErrorResponse("Patient not found");
        }

        // Find and remove file from array
        let reportFiles = patientResult.Item.reportFiles || [];
        const fileToDelete = reportFiles.find(f =>
            f.s3Key === s3Key || f.fileName === fileName
        );

        if (!fileToDelete) {
            return formatErrorResponse("File not found");
        }

        // Delete from S3 if it exists
        if (fileToDelete.s3Key) {
            try {
                await s3.send(new DeleteObjectCommand({
                    Bucket: REPORTS_BUCKET,
                    Key: fileToDelete.s3Key
                }));
                console.log(`✅ Deleted from S3: ${fileToDelete.s3Key}`);
            } catch (s3Error) {
                console.warn(`⚠️ S3 deletion failed: ${s3Error.message}`);
                // Continue with DynamoDB deletion
            }
        }

        // Remove from array
        reportFiles = reportFiles.filter(f =>
            f.s3Key !== s3Key && f.fileName !== fileName
        );

        // Update DynamoDB
        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: "SET reportFiles = :files, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":files": reportFiles,
                ":updatedAt": new Date().toISOString()
            }
        }));

        console.log(`✅ File deleted successfully`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: "File deleted successfully",
                remainingFiles: reportFiles.length
            })
        };
    } catch (error) {
        console.error('❌ Error deleting file:', error);
        return formatErrorResponse(`Failed to delete file: ${error.message}`);
    }
}

// ============================================
// MAIN HANDLER
// ============================================

export const handler = async (event, context) => {
    try {
        console.log("� RAW EVENT:", JSON.stringify(event));
        console.log("�📥 Lambda invoked");
        context.callbackWaitsForEmptyEventLoop = false;

        // Handle CORS preflight
        if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                    "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE"
                },
                body: ""
            };
        }

        // Parse request body
        let requestData;
        if (event.body) {
            const rawBody = event.isBase64Encoded
                ? Buffer.from(event.body, 'base64').toString('utf8')
                : event.body;
            requestData = JSON.parse(rawBody);
        } else {
            requestData = event;
        }

        console.log("🧾 requestData:", requestData);

        const action = requestData.action;
        console.log(`🎯 Action: ${action}`);

        // Route to appropriate handler
        switch (action) {
            case 'getPresignedUploadUrl':
                return await generatePresignedUploadUrl(requestData);

            case 'confirmFileUpload':
                return await confirmFileUpload(requestData);

            case 'getPatient':
                return await handleGetPatient(requestData.patientId);

            case 'getPatientFiles':
                return await handleGetPatientFiles(requestData.patientId);

            case 'deletePatientFile':
                return await deletePatientFile(requestData);

            case 'getClinicalHistory':
                return await fetchClinicalHistory(requestData.patientId);

            case 'getMedicalHistory':
                return await fetchMedicalHistory(requestData.patientId);

            case 'getDiagnosisHistory':
                return await fetchDiagnosisHistory(requestData.patientId);

            case 'getInvestigationsHistory':
                return await fetchInvestigationsHistory(requestData.patientId);

            case 'getAllPatients':
                return await getAllPatients();

            case 'searchPatients':
                return await searchPatients(requestData);

            case "deleteDraft":
                return await deleteDraft(requestData);

            // MEDICINE MASTER APIS
            case "searchMedicines":
                return await searchMedicines(requestData);
            case "addMedicine":
                return await addMedicine(requestData);

            default:
                // Handle legacy create/update operations
                if (requestData.patientId && requestData.updateMode) {
                    return await updatePatientData(requestData);
                } else if (requestData.isPartialSave) {
                    return await processSectionSave(requestData);
                } else {
                    return await processPatientData(requestData);
                }
        }
    } catch (error) {
        console.error('❌ Handler error:', error);
        return formatErrorResponse(error.message || "Request failed");
    }
};

// ============================================
// HELPER FUNCTIONS (Minimal Stubs)
// ============================================

function unmarshallDynamoDBItem(item) {
    if (!item) return null;
    const result = {};
    for (const key in item) {
        const value = item[key];
        if (value.S !== undefined) result[key] = value.S;
        else if (value.N !== undefined) result[key] = Number(value.N);
        else if (value.BOOL !== undefined) result[key] = value.BOOL;
        else if (value.M !== undefined) result[key] = unmarshallDynamoDBItem(value.M);
        else if (value.L !== undefined) result[key] = value.L.map(i => {
            if (i.M) return unmarshallDynamoDBItem(i.M);
            if (i.S) return i.S;
            if (i.N) return Number(i.N);
            return null;
        });
        else result[key] = value;
    }
    return result;
}

function formatErrorResponse(message) {
    return {
        statusCode: 400,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        },
        body: JSON.stringify({
            success: false,
            error: message
        })
    };
}

function formatSuccessResponse(data) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        },
        body: JSON.stringify(data)
    };
}

// ============================================
// FILE DEDUPLICATION LOGIC
// ============================================

/**
 * Verify if a file exists in S3 (for corrupted metadata recovery)
 * @param {string} s3Key - The S3 key to verify
 * @returns {Promise<boolean>} - True if file exists in S3
 */
async function verifyFileExistsInS3(s3Key) {
    if (!s3Key) return false;
    try {
        await s3.send(new HeadObjectCommand({
            Bucket: REPORTS_BUCKET,
            Key: s3Key
        }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        console.warn(`⚠️ S3 verification error for ${s3Key}:`, error.message);
        return false;
    }
}

/**
 * Deduplicate report files - prevents re-uploading existing files
 * 
 * @param {Array} existingFiles - Files already in DynamoDB for this patient
 * @param {Array} incomingFiles - Files sent from frontend in update request
 * @returns {Object} - { mergedFiles, stats: { kept, skipped, new, corrupted } }
 */
async function deduplicateReportFiles(existingFiles = [], incomingFiles = []) {
    console.log(`🔍 Deduplicating files: ${existingFiles.length} existing, ${incomingFiles.length} incoming`);

    const stats = { kept: 0, skipped: 0, new: 0, corrupted: 0, fixed: 0 };

    // Create a Map of existing files by s3Key for O(1) lookup
    const existingByKey = new Map();
    const existingByName = new Map(); // Fallback for legacy files

    for (const file of existingFiles) {
        const key = file.s3Key || file.key;
        if (key) {
            existingByKey.set(key, file);
        }
        // Also track by fileName for fallback matching
        if (file.fileName || file.name) {
            existingByName.set(file.fileName || file.name, file);
        }
    }

    const mergedFiles = [];
    const processedKeys = new Set();

    // Process incoming files
    for (const incomingFile of incomingFiles) {
        const incomingKey = incomingFile.s3Key || incomingFile.key;

        // Case 1: File already has S3 key and uploadedToS3 flag - KEEP as-is
        if (incomingKey && incomingFile.uploadedToS3 === true) {
            console.log(`⏭️ Keeping already-uploaded file: ${incomingFile.fileName || incomingFile.name}`);
            mergedFiles.push(incomingFile);
            processedKeys.add(incomingKey);
            stats.kept++;
            continue;
        }

        // Case 2: File has S3 key but uploadedToS3 is false/missing (corrupted metadata)
        if (incomingKey && incomingFile.uploadedToS3 !== true) {
            console.warn(`⚠️ Detected corrupted metadata for file: ${incomingFile.fileName || incomingFile.name}`);
            stats.corrupted++;

            // Verify with S3 HeadObject
            const existsInS3 = await verifyFileExistsInS3(incomingKey);

            if (existsInS3) {
                console.log(`✅ File exists in S3, fixing metadata for: ${incomingKey}`);
                mergedFiles.push({
                    ...incomingFile,
                    uploadedToS3: true, // Fix the corrupted flag
                    metadataFixedAt: new Date().toISOString()
                });
                processedKeys.add(incomingKey);
                stats.fixed++;
            } else {
                console.log(`❌ File NOT in S3, marking as failed: ${incomingKey}`);
                mergedFiles.push({
                    ...incomingFile,
                    uploadedToS3: false,
                    uploadFailed: true,
                    verifiedAt: new Date().toISOString()
                });
            }
            continue;
        }

        // Case 3: File matches existing by s3Key - SKIP (duplicate from frontend)
        if (incomingKey && existingByKey.has(incomingKey)) {
            console.log(`⏭️ Skipping duplicate file (matches existing s3Key): ${incomingKey}`);
            stats.skipped++;
            // Use the existing file data instead
            if (!processedKeys.has(incomingKey)) {
                mergedFiles.push(existingByKey.get(incomingKey));
                processedKeys.add(incomingKey);
            }
            continue;
        }

        // Case 4: Genuinely NEW file (no s3Key, needs upload)
        console.log(`📤 New file detected (needs upload): ${incomingFile.fileName || incomingFile.name}`);
        mergedFiles.push({
            ...incomingFile,
            isNew: true,
            pendingUpload: true
        });
        stats.new++;
    }

    // Add any existing files that weren't in the incoming array
    // (This preserves files that frontend didn't send - partial array support)
    for (const [key, existingFile] of existingByKey) {
        if (!processedKeys.has(key)) {
            console.log(`📁 Preserving existing file not in update: ${existingFile.fileName || existingFile.name}`);
            mergedFiles.push(existingFile);
            processedKeys.add(key);
            stats.kept++;
        }
    }

    console.log(`✅ Deduplication complete: ${JSON.stringify(stats)}`);
    console.log(`📊 Final merged files count: ${mergedFiles.length}`);

    return { mergedFiles, stats };
}

// ============================================
// HISTORY FETCH FUNCTIONS
// ============================================

async function fetchClinicalHistory(patientId) {
    try {
        console.log(`📊 Fetching clinical history for: ${patientId}`);

        const result = await dynamodb.send(new QueryCommand({
            TableName: CLINICAL_HISTORY_TABLE,
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false, // Latest first
            Limit: 50 // Reasonable limit
        }));

        console.log(`✅ Found ${result.Items?.length || 0} clinical history entries`);
        return { success: true, clinicalHistory: result.Items || [] };
    } catch (error) {
        console.error(`❌ Clinical history fetch error:`, error.message);
        // Return empty on error - non-blocking
        return { success: false, clinicalHistory: [], error: error.message };
    }
}

async function fetchMedicalHistory(patientId) {
    try {
        console.log(`🏥 Fetching medical history for: ${patientId}`);

        const result = await dynamodb.send(new QueryCommand({
            TableName: MEDICAL_HISTORY_TABLE,
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false,
            Limit: 50
        }));

        console.log(`✅ Found ${result.Items?.length || 0} medical history entries`);
        return { success: true, medicalHistory: result.Items || [] };
    } catch (error) {
        console.error(`❌ Medical history fetch error:`, error.message);
        return { success: false, medicalHistory: [], error: error.message };
    }
}

async function fetchDiagnosisHistory(patientId) {
    try {
        console.log(`🩺 Fetching diagnosis history for: ${patientId}`);

        const result = await dynamodb.send(new QueryCommand({
            TableName: DIAGNOSIS_HISTORY_TABLE,
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false,
            Limit: 50
        }));

        console.log(`✅ Found ${result.Items?.length || 0} diagnosis history entries`);
        return { success: true, diagnosisHistory: result.Items || [] };
    } catch (error) {
        console.error(`❌ Diagnosis history fetch error:`, error.message);
        return { success: false, diagnosisHistory: [], error: error.message };
    }
}

async function fetchInvestigationsHistory(patientId) {
    try {
        console.log(`🔬 Fetching investigations history for: ${patientId}`);

        const result = await dynamodb.send(new QueryCommand({
            TableName: INVESTIGATIONS_HISTORY_TABLE,
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false,
            Limit: 50
        }));

        console.log(`✅ Found ${result.Items?.length || 0} investigations history entries`);
        return { success: true, investigationsHistory: result.Items || [] };
    } catch (error) {
        console.error(`❌ Investigations history fetch error:`, error.message);
        return { success: false, investigationsHistory: [], error: error.message };
    }
}

async function getAllPatients() {
    try {
        const result = await dynamodb.send(new ScanCommand({ TableName: PATIENTS_TABLE }));
        const patients = result.Items || [];

        console.log(`📋 Retrieved ${patients.length} patients from DynamoDB`);

        // Enrich each patient's reportFiles with signed URLs
        const enrichedPatients = await Promise.all(
            patients.map(async (patient) => {
                if (patient.reportFiles && Array.isArray(patient.reportFiles)) {
                    console.log(`🔐 Enriching ${patient.reportFiles.length} files for patient: ${patient.patientId}`);
                    patient.reportFiles = await enrichPatientFilesWithSignedUrls(patient.reportFiles);
                }
                return patient;
            })
        );

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                patients: enrichedPatients,
                count: enrichedPatients.length
            })
        };
    } catch (error) {
        console.error('❌ Error getting all patients:', error);
        return formatErrorResponse(`Failed to get patients: ${error.message}`);
    }
}

async function searchPatients(requestData) {
    try {
        const { searchTerm } = requestData;

        if (!searchTerm || searchTerm.length < 2) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify({
                    success: true,
                    patients: [],
                    message: "Search term too short"
                })
            };
        }

        console.log(`🔍 Searching patients with term: "${searchTerm}"`);

        const searchTermLower = searchTerm.toLowerCase().trim();
        const searchTermClean = searchTerm.replace(/\D/g, ''); // Digits only for phone search
        const isPhoneSearch = /^\d{8,10}$/.test(searchTermClean);

        // Fetch all patients (DynamoDB Scan - for small datasets this is acceptable)
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE,
            ProjectionExpression: "patientId, #n, age, sex, mobile, #s",
            ExpressionAttributeNames: {
                "#n": "name",
                "#s": "status"
            }
        }));

        const allPatients = result.Items || [];
        console.log(`📋 Scanned ${allPatients.length} patients`);

        // Filter patients based on search term
        let matchedPatients = [];

        if (isPhoneSearch) {
            // Phone number search - exact or partial match
            console.log(`📞 Phone search mode: ${searchTermClean}`);
            matchedPatients = allPatients.filter(patient => {
                const patientMobile = (patient.mobile || '').replace(/\D/g, '');
                return patientMobile.includes(searchTermClean) || searchTermClean.includes(patientMobile);
            });
        } else {
            // Name search - case-insensitive contains
            console.log(`👤 Name search mode: ${searchTermLower}`);
            matchedPatients = allPatients.filter(patient => {
                const patientName = (patient.name || '').toLowerCase();
                const patientMobile = (patient.mobile || '').replace(/\D/g, '');
                // Match by name OR partial phone
                return patientName.includes(searchTermLower) ||
                    patientMobile.includes(searchTermClean);
            });
        }

        // Format results
        const formattedPatients = matchedPatients.map(p => ({
            patientId: p.patientId,
            name: p.name || 'Unknown',
            age: p.age ? String(p.age) : '0',
            sex: p.sex || 'N/A',
            mobile: p.mobile || '',
            status: p.status || 'ACTIVE'
        }));

        console.log(`✅ Found ${formattedPatients.length} matching patients`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                patients: formattedPatients,
                count: formattedPatients.length,
                searchType: isPhoneSearch ? 'phone' : 'name'
            })
        };
    } catch (error) {
        console.error('❌ Search error:', error);
        return formatErrorResponse(`Search failed: ${error.message}`);
    }
}

async function deletePatient(requestData) {
    await dynamodb.send(new DeleteCommand({
        TableName: PATIENTS_TABLE,
        Key: { patientId: requestData.patientId }
    }));
    return { success: true };
}

async function updatePatientData(requestData) {
    try {
        const { patientId, ...updateData } = requestData;

        if (!patientId) {
            return formatErrorResponse("Missing patientId for update");
        }

        console.log(`🔄 Updating patient: ${patientId}`);

        // ============================================
        // STEP 1: Fetch existing patient data first
        // ============================================
        let existingPatient = null;
        try {
            const existingResult = await dynamodb.send(new GetCommand({
                TableName: PATIENTS_TABLE,
                Key: { patientId }
            }));
            existingPatient = existingResult.Item;
            console.log(`📋 Fetched existing patient, has ${existingPatient?.reportFiles?.length || 0} files`);
        } catch (fetchError) {
            console.warn(`⚠️ Could not fetch existing patient: ${fetchError.message}`);
            // Continue anyway - will create if not exists
        }

        // ============================================
        // STEP 2: Deduplicate reportFiles if present
        // ============================================
        let fileStats = null;
        if (updateData.reportFiles && Array.isArray(updateData.reportFiles)) {
            const existingFiles = existingPatient?.reportFiles || [];
            const incomingFiles = updateData.reportFiles;

            console.log(`📁 Processing reportFiles update...`);
            console.log(`   ⏭️ Existing files in DB: ${existingFiles.length}`);
            console.log(`   📥 Incoming files from frontend: ${incomingFiles.length}`);

            // Deduplicate files
            const { mergedFiles, stats } = await deduplicateReportFiles(existingFiles, incomingFiles);
            fileStats = stats;

            // Replace updateData.reportFiles with deduplicated array
            updateData.reportFiles = mergedFiles;

            // Log the action summary
            console.log(`✅ File deduplication result:`);
            console.log(`   ⏭️ Skipped (already uploaded): ${stats.skipped}`);
            console.log(`   📁 Kept (preserved existing): ${stats.kept}`);
            console.log(`   📤 New (pending upload): ${stats.new}`);
            console.log(`   🔧 Fixed (corrupted metadata): ${stats.fixed}`);
            console.log(`   📊 Final file count: ${mergedFiles.length}`);
        } else if (existingPatient?.reportFiles && !updateData.reportFiles) {
            // If frontend didn't send reportFiles, preserve existing ones
            console.log(`📁 No reportFiles in update, preserving existing ${existingPatient.reportFiles.length} files`);
            // Don't add to updateData - let existing files remain unchanged
        }

        // ============================================
        // STEP 3: Build update expression
        // ============================================
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};

        Object.keys(updateData).forEach((key) => {
            if (key !== 'action' && key !== 'updateMode' && key !== 'patientId') {
                const attrName = `#${key}`;
                const attrValue = `:${key}`;
                updateExpression.push(`${attrName} = ${attrValue}`);
                expressionAttributeNames[attrName] = key;
                expressionAttributeValues[attrValue] = updateData[key];
            }
        });

        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();

        // ============================================
        // STEP 4: Execute conditional update
        // ============================================
        const params = {
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamodb.send(new UpdateCommand(params));
        console.log(`✅ Patient updated: ${patientId}`);

        // Return response with file stats if applicable
        const response = {
            success: true,
            patientId,
            updatedFields: Object.keys(updateData).filter(k => k !== 'action' && k !== 'updateMode')
        };

        if (fileStats) {
            response.fileStats = fileStats;
            response.message = `Updated with ${fileStats.kept} existing files preserved, ${fileStats.new} new files added`;
        }

        return formatSuccessResponse(response);
    } catch (error) {
        console.error('❌ Error updating patient:', error);
        return formatErrorResponse(`Failed to update patient: ${error.message}`);
    }
}

async function processSectionSave(requestData) {
    try {
        const { patientId, section, ...sectionData } = requestData;

        if (!patientId || !section) {
            return formatErrorResponse("Missing patientId or section");
        }

        console.log(`💾 Saving ${section} section for patient: ${patientId}`);

        // Build update expression for the specific section
        const updateExpression = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};

        Object.keys(sectionData).forEach((key) => {
            if (key !== 'action' && key !== 'isPartialSave' && key !== 'section' && key !== 'patientId') {
                const attrName = `#${key}`;
                const attrValue = `:${key}`;
                updateExpression.push(`${attrName} = ${attrValue}`);
                expressionAttributeNames[attrName] = key;
                expressionAttributeValues[attrValue] = sectionData[key];
            }
        });

        if (updateExpression.length === 0) {
            return formatSuccessResponse({
                success: true,
                patientId,
                message: "No changes to save"
            });
        }

        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();

        const params = {
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'UPDATED_NEW'
        };

        await dynamodb.send(new UpdateCommand(params));
        console.log(`✅ Section saved: ${section} for ${patientId}`);

        return formatSuccessResponse({
            success: true,
            patientId,
            section,
            message: `${section} section saved successfully`
        });
    } catch (error) {
        console.error('❌ Error saving section:', error);
        return formatErrorResponse(`Failed to save section: ${error.message}`);
    }
}

async function processPatientData(requestData) {
    try {
        const { name, age, sex, mobile, address, patientId: providedPatientId } = requestData;

        // Validate required fields
        if (!name || !age || !sex) {
            return formatErrorResponse("Missing required fields: name, age, sex");
        }

        console.log("🆕 Creating new patient...");

        // Generate patient ID if not provided
        const newPatientId = providedPatientId || `patient_${randomUUID().split('-')[0]}`;

        // Create patient record
        const patientRecord = {
            patientId: newPatientId,
            name,
            age: parseInt(age),
            sex,
            mobile: mobile || "",
            address: address || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            reportFiles: [],
            medications: [],
            clinicalParameters: {},
            diagnosis: "",
            treatment: "",
            prescription: "",
            advisedInvestigations: ""
        };

        const params = {
            TableName: PATIENTS_TABLE,
            Item: patientRecord
        };

        await dynamodb.send(new PutCommand(params));
        console.log(`✅ Patient created: ${newPatientId}`);

        return formatSuccessResponse({
            success: true,
            patientId: newPatientId,
            message: "Patient created successfully"
        });
    } catch (error) {
        console.error('❌ Error creating patient:', error);
        return formatErrorResponse(`Failed to create patient: ${error.message}`);
    }
}


// ============================================
// DYNAMIC MEDICINE MASTER LOGIC
// ============================================

/**
 * Normalizes medicine name for consistent storage and search
 * TRIMS whitespace -> COLLAPSES multiple spaces -> UPPERCASE
 * Example: "  para   500 " -> "PARA 500"
 */
function normalizeMedicineName(name) {
    if (!name) return "";
    return name
        .trim()
        .replace(/\s+/g, ' ') // Collapse multiple spaces to single
        .toUpperCase();
}

/**
 * Searches for medicines using prefix search
 * Input: { query: "par" }
 * Output: ["PARA 500", "PARACETAMOL"]
 */
async function searchMedicines(requestData) {
    try {
        const { query } = requestData;
        if (!query || query.length < 1) { // Relaxed check
            return {
                statusCode: 200,
                body: JSON.stringify({ medicines: [] })
            };
        }

        const normalizedQuery = normalizeMedicineName(query);
        console.log(`🔍 Searching medicines with prefix: ${normalizedQuery}`);

        const command = new QueryCommand({
            TableName: "Medicines", // Constant table name
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": "MEDICINE",
                ":sk": normalizedQuery
            },
            Limit: 20 // Performance limit
        });

        const result = await dynamodb.send(command);

        // Extract just the display name
        const medicines = (result.Items || []).map(item => item.name);

        return formatSuccessResponse({
            success: true,
            medicines: medicines
        });

    } catch (error) {
        console.error("❌ Error searching medicines:", error);
        return formatSuccessResponse({ success: false, error: error.message }); // Return 200 with error to avoid 500 crash
    }
}

/**
 * Adds a new medicine to the master database
 * Input: { name: "Azithral 500" }
 * Output: Success
 */
async function addMedicine(requestData) {
    try {
        const { name } = requestData;
        if (!name) return formatErrorResponse("Medicine name is required");

        const normalizedSK = normalizeMedicineName(name);
        const displayName = name.trim().replace(/\s+/g, ' ');

        const params = {
            TableName: "Medicines",
            Item: {
                PK: "MEDICINE",
                SK: normalizedSK,
                name: displayName,
                createdAt: new Date().toISOString()
            },
            ConditionExpression: "attribute_not_exists(SK)" // Prevent overwrite
        };

        try {
            await dynamodb.send(new PutCommand(params));
            console.log(`✅ Added new medicine: ${normalizedSK}`);

            return formatSuccessResponse({
                success: true,
                medicine: { name: displayName }
            });

        } catch (dbError) {
            if (dbError.name === "ConditionalCheckFailedException") {
                console.log(`ℹ️ Medicine already exists: ${normalizedSK}`);
                return formatSuccessResponse({
                    success: true,
                    message: "Medicine already exists",
                    medicine: { name: displayName }
                });
            }
            console.error("❌ DynamoDB error:", dbError);
            throw dbError; // Rethrow so main catch handles it
        }

    } catch (error) {
        console.error("❌ Error adding medicine:", error);
        return formatErrorResponse(`Add failed: ${error.message}`);
    }
}