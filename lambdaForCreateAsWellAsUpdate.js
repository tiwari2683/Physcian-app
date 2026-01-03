import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Initialize AWS clients - using only region for simplest configuration
const dynamoClient = new DynamoDBClient({ region: "ap-southeast-2" });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const s3 = new S3Client({
    region: "ap-southeast-2",
    // No custom credentials - use Lambda's execution role
    forcePathStyle: true
});

// Table name for DynamoDB
const PATIENTS_TABLE = 'Patients';
// Table name for clinical parameters history
const CLINICAL_HISTORY_TABLE = 'ClinicalParametersHistory';
// Table name for medical history entries
const MEDICAL_HISTORY_TABLE = 'MedicalHistoryEntries';
// Table name for diagnosis history entries
const DIAGNOSIS_HISTORY_TABLE = 'DiagnosisHistoryEntries';
// Table name for investigations history entries
const INVESTIGATIONS_HISTORY_TABLE = 'InvestigationsHistoryEntries';
// S3 bucket name - this must match exactly
const REPORTS_BUCKET = 'dr-gawli-patient-files';

// Using public URL for the S3 objects - path style for maximum compatibility
const S3_URL_PREFIX = `https://${REPORTS_BUCKET}.s3.ap-southeast-2.amazonaws.com/`;

// Function to unmarshall DynamoDB data
function unmarshallDynamoDBItem(item) {
    if (!item) return null;

    // Convert DynamoDB JSON to regular JSON
    const unmarshalledItem = {};

    for (const key in item) {
        const value = item[key];

        // Handle different types of DynamoDB attributes
        if (value.S !== undefined) {
            unmarshalledItem[key] = value.S;
        } else if (value.N !== undefined) {
            unmarshalledItem[key] = Number(value.N);
        } else if (value.BOOL !== undefined) {
            unmarshalledItem[key] = value.BOOL;
        } else if (value.NULL !== undefined) {
            unmarshalledItem[key] = null;
        } else if (value.M !== undefined) {
            unmarshalledItem[key] = unmarshallDynamoDBItem(value.M);
        } else if (value.L !== undefined) {
            unmarshalledItem[key] = value.L.map(item => {
                if (item.M !== undefined) {
                    return unmarshallDynamoDBItem(item.M);
                } else if (item.S !== undefined) {
                    return item.S;
                } else if (item.N !== undefined) {
                    return Number(item.N);
                } else if (item.BOOL !== undefined) {
                    return item.BOOL;
                } else {
                    return null;
                }
            });
        } else {
            unmarshalledItem[key] = value; // Fallback
        }
    }

    return unmarshalledItem;
}

// Function to fetch investigations history for a patient
async function fetchInvestigationsHistory(patientId, includeAll = true) {
    try {
        console.log(`Fetching investigations history for patient: ${patientId}, includeAll: ${includeAll}`);

        // Check if the history table exists
        let historyExists = false;
        try {
            const scanResult = await dynamodb.send(new ScanCommand({
                TableName: INVESTIGATIONS_HISTORY_TABLE,
                Limit: 1
            }));
            historyExists = true;
            console.log(`Investigations history table exists: ${INVESTIGATIONS_HISTORY_TABLE}`);
        } catch (error) {
            console.warn(`Investigations history table does not exist or cannot be accessed: ${error.message}`);
            // We'll try a fallback approach if table doesn't exist
        }

        // Array to store complete investigations history
        let investigationsHistory = [];

        if (historyExists) {
            // Query the dedicated history table for this patient
            try {
                const queryResult = await dynamodb.send(new QueryCommand({
                    TableName: INVESTIGATIONS_HISTORY_TABLE,
                    KeyConditionExpression: "patientId = :patientId",
                    ExpressionAttributeValues: {
                        ":patientId": patientId
                    },
                    ScanIndexForward: false // Return newest first
                }));

                if (queryResult.Items && queryResult.Items.length > 0) {
                    console.log(`Found ${queryResult.Items.length} investigations history entries for patient ${patientId} in dedicated table`);
                    investigationsHistory = queryResult.Items;
                } else {
                    console.log(`No investigations history found for patient ${patientId} in dedicated table`);
                }
            } catch (queryError) {
                console.error(`Error querying investigations history table: ${queryError.message}`);
                console.error(queryError.stack);
            }
        }

        // If no dedicated table or no results, try getting history from the diagnosis history table
        // since advised investigations are often stored alongside diagnoses
        if (investigationsHistory.length === 0) {
            console.log(`Trying to get investigations history from diagnosis history table: ${patientId}`);
            try {
                const diagnosisHistory = await fetchDiagnosisHistory(patientId, false);

                if (diagnosisHistory.success && diagnosisHistory.diagnosisHistory && diagnosisHistory.diagnosisHistory.length > 0) {
                    console.log(`Found ${diagnosisHistory.diagnosisHistory.length} diagnosis records with potential investigations`);

                    // Filter only entries that have advisedInvestigations
                    investigationsHistory = diagnosisHistory.diagnosisHistory
                        .filter(entry => entry.advisedInvestigations && entry.advisedInvestigations.trim() !== '')
                        .map(entry => ({
                            patientId: entry.patientId,
                            entryId: entry.entryId || `${entry.patientId}_inv_${entry.timestamp || Date.now()}`,
                            date: entry.date,
                            timestamp: entry.timestamp || new Date(entry.date).getTime(),
                            advisedInvestigations: entry.advisedInvestigations,
                            // Add reference to the source diagnosis if available
                            diagnosisReference: entry.diagnosis ? {
                                diagnosis: entry.diagnosis,
                                entryId: entry.entryId
                            } : null,
                            doctor: entry.doctor || "Dr. Diapk Gawli" // Default doctor name
                        }));

                    console.log(`Extracted ${investigationsHistory.length} investigation entries from diagnosis history`);
                } else {
                    console.log(`No diagnosis history with investigations found for patient ${patientId}`);
                }
            } catch (diagnosisError) {
                console.error(`Error getting investigations from diagnosis history: ${diagnosisError.message}`);
            }
        }

        // If still no results, try getting directly from the patient record as fallback
        if (investigationsHistory.length === 0) {
            console.log(`Trying to get investigations history from patient record: ${patientId}`);
            try {
                const patientResult = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                const patient = patientResult.Item;
                if (patient) {
                    console.log(`Found patient record for ID: ${patientId}`);

                    // Check all possible places where investigations history might be stored
                    if (patient.investigationsHistory && Array.isArray(patient.investigationsHistory)) {
                        console.log(`Found ${patient.investigationsHistory.length} entries in patient.investigationsHistory`);
                        investigationsHistory = patient.investigationsHistory;
                    } else if (patient.history && patient.history.investigations && Array.isArray(patient.history.investigations)) {
                        console.log(`Found ${patient.history.investigations.length} entries in patient.history.investigations`);
                        investigationsHistory = patient.history.investigations;
                    } else {
                        console.log(`No investigations history found in patient record: ${patientId}`);

                        // If we still don't have history but includeAll is true, create at least one entry from current investigations
                        if (includeAll && patient.advisedInvestigations && patient.advisedInvestigations.trim() !== '') {
                            console.log(`Creating synthetic history entry from current advisedInvestigations`);

                            // Get the most recent update timestamp or fall back to now
                            const timestamp = patient.updatedAt || new Date().toISOString();

                            // Create a history entry from the current investigations
                            investigationsHistory = [{
                                patientId: patientId,
                                advisedInvestigations: patient.advisedInvestigations,
                                date: timestamp,
                                timestamp: new Date(timestamp).getTime(),
                                synthesized: true, // Mark this as synthesized for transparency
                                doctor: "Dr. Dipak Gawli" // Default doctor name
                            }];
                        }
                    }
                } else {
                    console.log(`Patient record not found for ID: ${patientId}`);
                }
            } catch (patientError) {
                console.error(`Error getting patient record for investigations history: ${patientError.message}`);
                console.error(patientError.stack);
            }
        }

        // Log the results
        console.log(`Final investigations history result count: ${investigationsHistory.length}`);
        if (investigationsHistory.length > 0) {
            // Log a sample of the first entry
            console.log(`Sample history entry: ${JSON.stringify(investigationsHistory[0]).substring(0, 200)}...`);
        }

        // Sort history by date (newest first) if we have entries
        if (investigationsHistory.length > 0) {
            investigationsHistory.sort((a, b) => {
                // First try using timestamp field
                if (a.timestamp && b.timestamp) {
                    return b.timestamp - a.timestamp;
                }
                // Fall back to date string comparison
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });

            console.log(`Sorted investigations history by date (newest first)`);
        }

        // Format dates for better display in the UI
        investigationsHistory = investigationsHistory.map(item => {
            try {
                const date = new Date(item.date);
                return {
                    ...item,
                    formattedDate: date.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    }),
                    formattedTime: date.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                    })
                };
            } catch (dateError) {
                console.warn(`Error formatting date for history item: ${dateError.message}`);
                return item;
            }
        });

        return {
            success: true,
            investigationsHistory: investigationsHistory
        };
    } catch (error) {
        console.error(`Error in fetchInvestigationsHistory: ${error.message}`);
        console.error(error.stack);
        return {
            success: false,
            error: `Failed to fetch investigations history: ${error.message}`
        };
    }
}

// Function to save an investigations history entry
async function saveInvestigationsHistoryEntry(patientId, advisedInvestigations, doctor = "Dr. Dipak Gawli") {
    try {
        console.log(`Saving investigations history entry for patient ${patientId}`);

        if (!advisedInvestigations || advisedInvestigations.trim() === '') {
            console.log("No investigations provided, skipping history save");
            return false;
        }

        // Create a timestamp that we'll use for sorting
        const now = new Date();
        const timestamp = now.getTime();
        const isoTimestamp = now.toISOString();

        // Create a history record with timestamp
        const historyRecord = {
            patientId: patientId,
            entryId: `${patientId}_inv_${timestamp}`, // Unique ID for this history entry
            timestamp: timestamp, // Numeric timestamp for sorting
            date: isoTimestamp,
            advisedInvestigations: advisedInvestigations,
            doctor: doctor
        };

        console.log(`Created investigations history record with ID: ${historyRecord.entryId}`);

        // Try to save to dedicated investigations history table first
        try {
            await dynamodb.send(new PutCommand({
                TableName: INVESTIGATIONS_HISTORY_TABLE,
                Item: historyRecord
            }));

            console.log(`Successfully saved investigations history to dedicated table: ${INVESTIGATIONS_HISTORY_TABLE}`);
            return true;
        } catch (tableError) {
            console.warn(`Error saving to investigations history table: ${tableError.message}`);
            console.warn("This is expected if the table doesn't exist, falling back to storing in patient record");

            // Fall back to storing in the patient record
            try {
                // Get current patient record
                const patientRecord = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                if (!patientRecord.Item) {
                    console.error(`Patient ${patientId} not found for investigations history fallback`);
                    return false;
                }

                // Initialize or append to investigationsHistory array
                const currentHistory = patientRecord.Item.investigationsHistory || [];
                currentHistory.push(historyRecord);

                // Update the patient record with the history
                await dynamodb.send(new UpdateCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId },
                    UpdateExpression: "SET investigationsHistory = :history",
                    ExpressionAttributeValues: {
                        ":history": currentHistory
                    }
                }));

                console.log(`Saved investigations history to patient record, ${currentHistory.length} total entries`);
                return true;
            } catch (fallbackError) {
                console.error(`Error saving investigations history to fallback: ${fallbackError.message}`);
                return false;
            }
        }
    } catch (error) {
        console.error(`Error saving investigations history entry: ${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// Function to fetch diagnosis history for a patient
async function fetchDiagnosisHistory(patientId, includeAll = true) {
    try {
        console.log(`Fetching diagnosis history for patient: ${patientId}, includeAll: ${includeAll}`);

        // Check if the history table exists
        let historyExists = false;
        try {
            const scanResult = await dynamodb.send(new ScanCommand({
                TableName: DIAGNOSIS_HISTORY_TABLE,
                Limit: 1
            }));
            historyExists = true;
            console.log(`Diagnosis history table exists: ${DIAGNOSIS_HISTORY_TABLE}`);
        } catch (error) {
            console.warn(`Diagnosis history table does not exist or cannot be accessed: ${error.message}`);
            // We'll try a fallback approach if table doesn't exist
        }

        // Array to store complete diagnosis history
        let diagnosisHistory = [];

        if (historyExists) {
            // Query the dedicated history table for this patient
            try {
                const queryResult = await dynamodb.send(new QueryCommand({
                    TableName: DIAGNOSIS_HISTORY_TABLE,
                    KeyConditionExpression: "patientId = :patientId",
                    ExpressionAttributeValues: {
                        ":patientId": patientId
                    },
                    ScanIndexForward: false // Return newest first
                }));

                if (queryResult.Items && queryResult.Items.length > 0) {
                    console.log(`Found ${queryResult.Items.length} diagnosis history entries for patient ${patientId} in dedicated table`);
                    diagnosisHistory = queryResult.Items;
                } else {
                    console.log(`No diagnosis history found for patient ${patientId} in dedicated table`);
                }
            } catch (queryError) {
                console.error(`Error querying diagnosis history table: ${queryError.message}`);
                console.error(queryError.stack);
            }
        }

        // If no dedicated table or no results, try getting history from the patient record itself
        if (diagnosisHistory.length === 0) {
            console.log(`Trying to get diagnosis history from patient record: ${patientId}`);
            try {
                const patientResult = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                const patient = patientResult.Item;
                if (patient) {
                    console.log(`Found patient record for ID: ${patientId}`);

                    // Check all possible places where diagnosis history might be stored
                    if (patient.diagnosisHistory && Array.isArray(patient.diagnosisHistory)) {
                        console.log(`Found ${patient.diagnosisHistory.length} diagnosis history entries in patient.diagnosisHistory`);
                        diagnosisHistory = patient.diagnosisHistory;
                    } else if (patient.history && patient.history.diagnosis && Array.isArray(patient.history.diagnosis)) {
                        console.log(`Found ${patient.history.diagnosis.length} diagnosis history entries in patient.history.diagnosis`);
                        diagnosisHistory = patient.history.diagnosis;
                    } else {
                        console.log(`No diagnosis history found in patient record: ${patientId}`);

                        // If we still don't have history but includeAll is true, create at least one entry from current diagnosis
                        if (includeAll && patient.diagnosis) {
                            console.log(`Creating synthetic history entry from current diagnosis`);

                            // Get the most recent update timestamp or fall back to now
                            const timestamp = patient.updatedAt || new Date().toISOString();

                            // Create a history entry from the current diagnosis
                            diagnosisHistory = [{
                                patientId: patientId,
                                diagnosis: patient.diagnosis,
                                advisedInvestigations: patient.advisedInvestigations || "",
                                date: timestamp,
                                timestamp: new Date(timestamp).getTime(),
                                synthesized: true // Mark this as synthesized for transparency
                            }];
                        }
                    }
                } else {
                    console.log(`Patient record not found for ID: ${patientId}`);
                }
            } catch (patientError) {
                console.error(`Error getting patient record for diagnosis history: ${patientError.message}`);
                console.error(patientError.stack);
            }
        }

        // Log the results
        console.log(`Final diagnosis history result count: ${diagnosisHistory.length}`);
        if (diagnosisHistory.length > 0) {
            // Log a sample of the first entry
            console.log(`Sample history entry: ${JSON.stringify(diagnosisHistory[0]).substring(0, 200)}...`);
        }

        // Sort history by date (newest first) if we have entries
        if (diagnosisHistory.length > 0) {
            diagnosisHistory.sort((a, b) => {
                // First try using timestamp field
                if (a.timestamp && b.timestamp) {
                    return b.timestamp - a.timestamp;
                }
                // Fall back to date string comparison
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });

            console.log(`Sorted diagnosis history by date (newest first)`);
        }

        // Format dates for better display in the UI
        diagnosisHistory = diagnosisHistory.map(item => {
            try {
                const date = new Date(item.date);
                return {
                    ...item,
                    formattedDate: date.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    }),
                    formattedTime: date.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                    })
                };
            } catch (dateError) {
                console.warn(`Error formatting date for history item: ${dateError.message}`);
                return item;
            }
        });

        return {
            success: true,
            diagnosisHistory: diagnosisHistory
        };
    } catch (error) {
        console.error(`Error in fetchDiagnosisHistory: ${error.message}`);
        console.error(error.stack);
        return {
            success: false,
            error: `Failed to fetch diagnosis history: ${error.message}`
        };
    }
}

// Function to save a diagnosis history entry
async function saveDiagnosisHistoryEntry(patientId, diagnosis, advisedInvestigations = "") {
    try {
        console.log(`Saving diagnosis history entry for patient ${patientId}`);

        if (!diagnosis) {
            console.log("No diagnosis text provided, skipping history save");
            return false;
        }

        // Create a timestamp that we'll use for sorting
        const now = new Date();
        const timestamp = now.getTime();
        const isoTimestamp = now.toISOString();

        // Create a history record with timestamp
        const historyRecord = {
            patientId: patientId,
            entryId: `${patientId}_diagnosis_${timestamp}`, // Unique ID for this history entry
            timestamp: timestamp, // Numeric timestamp for sorting
            date: isoTimestamp,
            diagnosis: diagnosis,
            advisedInvestigations: advisedInvestigations || ""
        };

        console.log(`Created diagnosis history record with ID: ${historyRecord.entryId}`);

        // Try to save to dedicated diagnosis history table first
        try {
            await dynamodb.send(new PutCommand({
                TableName: DIAGNOSIS_HISTORY_TABLE,
                Item: historyRecord
            }));

            console.log(`Successfully saved diagnosis history to dedicated table: ${DIAGNOSIS_HISTORY_TABLE}`);

            // Also save investigations history separately if provided
            if (advisedInvestigations && advisedInvestigations.trim() !== '') {
                try {
                    await saveInvestigationsHistoryEntry(patientId, advisedInvestigations);
                    console.log(`Successfully saved separate investigations history entry`);
                } catch (invHistoryError) {
                    console.error(`Error saving separate investigations history: ${invHistoryError.message}`);
                    // Continue even if this fails
                }
            }

            return true;
        } catch (tableError) {
            console.warn(`Error saving to diagnosis history table: ${tableError.message}`);
            console.warn("This is expected if the table doesn't exist, falling back to storing in patient record");

            // Fall back to storing in the patient record
            try {
                // Get current patient record
                const patientRecord = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                if (!patientRecord.Item) {
                    console.error(`Patient ${patientId} not found for diagnosis history fallback`);
                    return false;
                }

                // Initialize or append to diagnosisHistory array
                const currentHistory = patientRecord.Item.diagnosisHistory || [];
                currentHistory.push(historyRecord);

                // Update the patient record with the history
                await dynamodb.send(new UpdateCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId },
                    UpdateExpression: "SET diagnosisHistory = :history",
                    ExpressionAttributeValues: {
                        ":history": currentHistory
                    }
                }));

                console.log(`Saved diagnosis history to patient record, ${currentHistory.length} total entries`);

                // Also try to save investigations history to fallback
                if (advisedInvestigations && advisedInvestigations.trim() !== '') {
                    try {
                        // Initialize or append to investigationsHistory array
                        const currentInvHistory = patientRecord.Item.investigationsHistory || [];

                        // Create investigations history record
                        const invHistoryRecord = {
                            patientId: patientId,
                            entryId: `${patientId}_inv_${timestamp}`,
                            timestamp: timestamp,
                            date: isoTimestamp,
                            advisedInvestigations: advisedInvestigations,
                            diagnosisReference: {
                                diagnosis: diagnosis,
                                entryId: historyRecord.entryId
                            }
                        };

                        currentInvHistory.push(invHistoryRecord);

                        // Update the patient record with the investigations history
                        await dynamodb.send(new UpdateCommand({
                            TableName: PATIENTS_TABLE,
                            Key: { patientId },
                            UpdateExpression: "SET investigationsHistory = :history",
                            ExpressionAttributeValues: {
                                ":history": currentInvHistory
                            }
                        }));

                        console.log(`Saved investigations history to patient record fallback, ${currentInvHistory.length} total entries`);
                    } catch (invFallbackError) {
                        console.error(`Error saving investigations history to fallback: ${invFallbackError.message}`);
                        // Continue even if this fails
                    }
                }

                return true;
            } catch (fallbackError) {
                console.error(`Error saving diagnosis history to fallback: ${fallbackError.message}`);
                return false;
            }
        }
    } catch (error) {
        console.error(`Error saving diagnosis history entry: ${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// Function to fetch medical history entries for a patient
async function fetchMedicalHistory(patientId) {
    try {
        console.log(`Fetching medical history entries for patient: ${patientId}`);

        // Check if the history table exists
        let historyExists = false;
        try {
            const scanResult = await dynamodb.send(new ScanCommand({
                TableName: MEDICAL_HISTORY_TABLE,
                Limit: 1
            }));
            historyExists = true;
            console.log(`Medical history table exists: ${MEDICAL_HISTORY_TABLE}`);
        } catch (error) {
            console.warn(`Medical history table does not exist or cannot be accessed: ${error.message}`);
            // We'll return empty history if table doesn't exist
        }

        if (!historyExists) {
            console.log("No medical history table found, returning empty history");
            return {
                success: true,
                medicalHistory: []
            };
        }

        // Query the history table for entries matching this patient ID
        const queryResult = await dynamodb.send(new QueryCommand({
            TableName: MEDICAL_HISTORY_TABLE,
            KeyConditionExpression: "patientId = :patientId",
            ExpressionAttributeValues: {
                ":patientId": patientId
            },
            ScanIndexForward: false // Return newest first
        }));

        console.log(`Found ${queryResult.Items?.length || 0} medical history entries for patient ${patientId}`);

        return {
            success: true,
            medicalHistory: queryResult.Items || []
        };
    } catch (error) {
        console.error(`Error fetching medical history: ${error.message}`);
        console.error(error.stack);
        return {
            success: false,
            error: `Failed to fetch medical history: ${error.message}`
        };
    }
}

// Function to fetch clinical parameters history for a patient
async function fetchClinicalHistory(patientId) {
    try {
        console.log(`Fetching clinical parameters history for patient: ${patientId}`);

        // Check if the history table exists
        let historyExists = false;
        try {
            const scanResult = await dynamodb.send(new ScanCommand({
                TableName: CLINICAL_HISTORY_TABLE,
                Limit: 1
            }));
            historyExists = true;
            console.log(`Clinical history table exists: ${CLINICAL_HISTORY_TABLE}`);
        } catch (error) {
            console.warn(`Clinical history table does not exist or cannot be accessed: ${error.message}`);
            // We'll return empty history if table doesn't exist
        }

        if (!historyExists) {
            console.log("No history table found, returning empty history");
            return {
                success: true,
                clinicalHistory: []
            };
        }

        // Query the history table for entries matching this patient ID
        const queryResult = await dynamodb.send(new QueryCommand({
            TableName: CLINICAL_HISTORY_TABLE,
            KeyConditionExpression: "patientId = :patientId",
            ExpressionAttributeValues: {
                ":patientId": patientId
            },
            ScanIndexForward: false // Return newest first
        }));

        console.log(`Found ${queryResult.Items?.length || 0} clinical history entries for patient ${patientId}`);

        return {
            success: true,
            clinicalHistory: queryResult.Items || []
        };
    } catch (error) {
        console.error(`Error fetching clinical history: ${error.message}`);
        console.error(error.stack);
        return {
            success: false,
            error: `Failed to fetch clinical history: ${error.message}`
        };
    }
}

// FIXED: handleGetPatient function with proper GetItemCommand usage
async function handleGetPatient(patientId, forceRefresh = false) {
    try {
        console.log(`Getting patient data for ID: ${patientId}, forceRefresh: ${forceRefresh}`);

        // Get the patient record from DynamoDB - using raw DynamoDB client with GetItemCommand
        const command = new GetItemCommand({
            TableName: PATIENTS_TABLE,
            Key: { "patientId": { "S": patientId } }
        });

        // Add ConsistentRead option if forceRefresh is set
        if (forceRefresh) {
            command.input.ConsistentRead = true;
            console.log("Using ConsistentRead to get fresh data");
        }

        const result = await dynamoClient.send(command);

        console.log(`Raw DynamoDB response keys: ${Object.keys(result).join(', ')}`);

        if (!result.Item) {
            console.log(`No patient found with ID: ${patientId}`);
            return {
                success: false,
                message: `Patient not found with ID: ${patientId}`
            };
        }

        // Transform DynamoDB format to plain JavaScript objects
        const patientData = unmarshallDynamoDBItem(result.Item);

        console.log(`Successfully unmarshalled patient data. Found ${patientData.clinicalParameters ? 'with' : 'without'} clinical parameters`);
        if (patientData.clinicalParameters) {
            console.log(`Clinical parameters keys: ${Object.keys(patientData.clinicalParameters).join(', ')}`);
        }

        // SIGN PRE-SIGNED URLS FOR REPORT FILES
        if (patientData.reportFiles && Array.isArray(patientData.reportFiles)) {
            console.log("Signing S3 URLs for patient view...");
            try {
                patientData.reportFiles = await Promise.all(patientData.reportFiles.map(async (file) => {
                    // Only sign if we have a key and it looks like an S3 file
                    if (file.key && (file.uploadedToS3 || !file.storedLocally)) {
                        try {
                            const getCommand = new GetObjectCommand({
                                Bucket: REPORTS_BUCKET,
                                Key: file.key
                            });
                            // Generate URL valid for 1 hour
                            const signedUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });
                            return { ...file, url: signedUrl };
                        } catch (e) {
                            console.warn(`Failed to sign URL for ${file.key}:`, e.message);
                            return file;
                        }
                    }
                    return file;
                }));
            } catch (err) {
                console.error("Error signing URLs:", err);
            }
        }

        // Get clinical history for this patient
        const clinicalHistoryResponse = await fetchClinicalHistory(patientId);

        // Get medical history entries for this patient
        const medicalHistoryResponse = await fetchMedicalHistory(patientId);

        // Get diagnosis history for this patient
        const diagnosisHistoryResponse = await fetchDiagnosisHistory(patientId);

        // Get investigations history for this patient
        const investigationsHistoryResponse = await fetchInvestigationsHistory(patientId);

        // Return success response with transformed data
        return {
            success: true,
            patient: patientData,
            clinicalHistory: clinicalHistoryResponse.clinicalHistory || [],
            medicalHistory: medicalHistoryResponse.medicalHistory || [],
            diagnosisHistory: diagnosisHistoryResponse.diagnosisHistory || [],
            investigationsHistory: investigationsHistoryResponse.investigationsHistory || [],
            freshData: forceRefresh // Indicate if this was a fresh read
        };
    } catch (error) {
        console.error(`Error getting patient data: ${error.message}`);
        console.error(error.stack);
        return {
            success: false,
            error: `Failed to get patient data: ${error.message}`
        };
    }
}

// Function to get patient files (both from S3 and locally stored)
async function handleGetPatientFiles(patientId) {
    try {
        console.log(`Getting files for patient ID: ${patientId}`);

        // Initialize array for all files
        let allFiles = [];

        // First, try to get files from patient record in DynamoDB
        let recordFiles = [];
        try {
            console.log(`Checking DynamoDB for patient record files: ${patientId}`);

            const patientRecord = await dynamodb.send(new GetCommand({
                TableName: PATIENTS_TABLE,
                Key: { patientId }
            }));

            if (patientRecord.Item && patientRecord.Item.reportFiles && Array.isArray(patientRecord.Item.reportFiles)) {
                recordFiles = patientRecord.Item.reportFiles;
                console.log(`Found ${recordFiles.length} files in patient record`);

                // Log file details for first few files
                recordFiles.slice(0, 3).forEach((file, idx) => {
                    console.log(`Record file ${idx + 1}: Name: ${file.name}, URL: ${file.url?.substring(0, 30) || 'none'}, Type: ${file.type || 'unknown'}`);
                });
            } else {
                console.log(`No files found in patient record: ${patientId}`);
            }
        } catch (dbError) {
            console.error(`Error querying DynamoDB for patient files: ${dbError.message}`);
            console.log(`Continuing with S3 file search`);
        }

        // Next, try to list objects in S3 for this patient
        let s3Files = [];
        try {
            console.log(`Listing objects in S3 bucket: ${REPORTS_BUCKET} for prefix: ${patientId}/`);

            const s3ListParams = {
                Bucket: REPORTS_BUCKET,
                Prefix: `${patientId}/`
            };

            const listObjectsResult = await s3.send(new ListObjectsV2Command(s3ListParams));

            if (listObjectsResult.Contents && listObjectsResult.Contents.length > 0) {
                console.log(`Found ${listObjectsResult.Contents.length} objects in S3 for patient ${patientId}`);

                // Process each S3 object
                s3Files = await Promise.all(listObjectsResult.Contents.map(async (object) => {
                    try {
                        // Get object metadata
                        const objectKey = object.Key;
                        const fileNameMatch = objectKey.match(/[^\/]+$/);
                        const fileName = fileNameMatch ? fileNameMatch[0] : objectKey;

                        console.log(`Processing S3 object: ${fileName}`);

                        // Try to get metadata
                        let metadata = {};
                        try {
                            const headResult = await s3.send(new GetObjectCommand({
                                Bucket: REPORTS_BUCKET,
                                Key: objectKey
                            }));

                            metadata = headResult.Metadata || {};
                            console.log(`Got metadata for ${fileName}: ${JSON.stringify(metadata)}`);
                        } catch (metadataError) {
                            console.warn(`Couldn't get metadata for ${fileName}: ${metadataError.message}`);
                        }

                        // Determine file type from key or metadata
                        const fileType = metadata['content-type'] ||
                            (fileName.endsWith('.pdf') ? 'application/pdf' :
                                fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
                                    fileName.endsWith('.png') ? 'image/png' : 'application/octet-stream');


                        // Generate presigned URL for secure access
                        let signedUrl = "";
                        try {
                            const getCommand = new GetObjectCommand({
                                Bucket: REPORTS_BUCKET,
                                Key: objectKey
                            });
                            // Generate URL valid for 1 hour
                            signedUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });
                            console.log(`Generated signed URL for ${fileName}`);
                        } catch (signError) {
                            console.error(`Error generating signed URL: ${signError.message}`);
                            // Fallback to standard URL if signing fails
                            signedUrl = `${S3_URL_PREFIX}${objectKey}`;
                        }

                        // Create file object
                        return {
                            name: metadata['original-name'] || fileName,
                            key: objectKey,
                            url: signedUrl,
                            type: fileType,
                            size: object.Size,
                            lastModified: object.LastModified?.toISOString(),
                            uploadDate: metadata['upload-date'] || object.LastModified?.toISOString(),
                            category: metadata.category || 'uncategorized',
                            fromS3: true
                        };
                    } catch (objectError) {
                        console.error(`Error processing S3 object: ${object.Key}: ${objectError.message}`);
                        return {
                            key: object.Key,
                            url: `${S3_URL_PREFIX}${object.Key}`,
                            name: object.Key,
                            error: objectError.message,
                            fromS3: true
                        };
                    }
                }));

                console.log(`Processed ${s3Files.length} S3 files for patient ${patientId}`);
            } else {
                console.log(`No objects found in S3 for patient ${patientId}`);
            }
        } catch (s3Error) {
            console.error(`Error listing objects in S3: ${s3Error.message}`);
            console.log(`Continuing with record files only`);
        }

        // Combine files and deduplicate
        const fileMap = new Map();

        // Add S3 files first (they're more reliable)
        s3Files.forEach(file => {
            if (file.url) {
                fileMap.set(file.url, file);
            }
        });

        // Then add record files, but don't overwrite S3 files with same URL
        recordFiles.forEach(file => {
            // Only add if we have a URL
            if (file.url && !fileMap.has(file.url)) {
                fileMap.set(file.url, {
                    ...file,
                    fromRecord: true
                });
            }
        });

        // Convert map back to array
        allFiles = Array.from(fileMap.values());

        console.log(`Found a total of ${allFiles.length} unique files for patient ${patientId}`);

        return {
            success: true,
            files: allFiles
        };
    } catch (error) {
        console.error(`Error in handleGetPatientFiles: ${error.message}`);
        console.error(error.stack);
        return {
            success: false,
            error: `Failed to get patient files: ${error.message}`
        };
    }
}

// UPDATED: IMPROVED HANDLER FUNCTION with new getInvestigationsHistory action
export const handler = async (event, context) => {
    try {
        // Enhanced debugging to see exactly what's coming in
        console.log("Lambda function started");
        console.log("Event type:", typeof event);
        console.log("Event structure:", JSON.stringify(event, null, 2).substring(0, 1000));

        // Don't wait for event loop to empty (allows for faster response)
        context.callbackWaitsForEmptyEventLoop = false;

        // Handle OPTIONS for CORS preflight
        if (event.httpMethod === "OPTIONS" || (event.requestContext && event.requestContext.http && event.requestContext.http.method === "OPTIONS")) {
            console.log("Handling OPTIONS preflight request");
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

        // Enhanced request body handling for different integration types
        let requestData;

        // Handle different possible event formats from API Gateway
        if (event.body) {
            // Standard API Gateway proxy integration
            let rawBody = event.body;

            // Handle base64 encoded bodies
            if (event.isBase64Encoded) {
                console.log("Decoding base64 encoded body");
                rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
            }

            // Parse JSON body
            try {
                requestData = JSON.parse(rawBody);
                console.log("Successfully parsed body from event.body");
            } catch (parseError) {
                console.error("Error parsing JSON from event.body:", parseError);
                return formatErrorResponse("Invalid JSON in request body");
            }
        } else if (event.httpMethod && event.pathParameters) {
            // API Gateway REST API integration - might have different structure
            console.log("Detected REST API integration pattern");

            if (event.body === null && event.requestContext) {
                // Some API Gateway configurations might put the body elsewhere
                console.log("Checking alternative body locations");

                if (event.requestContext.body) {
                    try {
                        requestData = JSON.parse(event.requestContext.body);
                        console.log("Found and parsed body from event.requestContext.body");
                    } catch (e) {
                        console.error("Error parsing body from requestContext:", e);
                    }
                }
            }
        } else if (typeof event === 'string') {
            // Direct invocation with string
            try {
                requestData = JSON.parse(event);
                console.log("Parsed request data from direct string invocation");
            } catch (e) {
                console.error("Failed to parse string event as JSON:", e);
                return formatErrorResponse("Invalid event format");
            }
        } else if (typeof event === 'object') {
            // Direct invocation with object or other API Gateway format

            // Check for API Gateway v2 format (HTTP API)
            if (event.version === '2.0' && event.rawPath && event.rawQueryString !== undefined) {
                console.log("Detected API Gateway v2 (HTTP API) format");

                // For HTTP API, the body might be in a different location
                try {
                    if (event.body) {
                        const body = event.isBase64Encoded
                            ? Buffer.from(event.body, 'base64').toString('utf8')
                            : event.body;

                        requestData = JSON.parse(body);
                        console.log("Parsed body from HTTP API format");
                    }
                } catch (e) {
                    console.error("Error parsing HTTP API body:", e);
                }
            } else {
                // Assume it's the request data directly
                requestData = event;
                console.log("Using event object directly as request data");
            }
        }

        // Final validation that we have request data in some form
        if (!requestData) {
            console.error("Could not extract request data from event");
            return formatErrorResponse("Unable to process request: No valid request data found");
        }

        // Log what we found to help with debugging
        console.log("Extracted request data keys:", Object.keys(requestData));
        console.log("Patient ID:", requestData.patientId);
        console.log("Update mode:", requestData.updateMode, "type:", typeof requestData.updateMode);
        console.log("Save section:", requestData.saveSection);
        console.log("Mobile number:", requestData.mobile);
        console.log("Patient name:", requestData.name);
        console.log("Action:", requestData.action);

        // Check for getInvestigationsHistory action
        if (requestData.action === 'getInvestigationsHistory') {
            console.log(`Processing getInvestigationsHistory action for ID: ${requestData.patientId}`);
            const includeAll = requestData.includeAll === true || requestData.includeAll === 'true';
            const response = await fetchInvestigationsHistory(requestData.patientId, includeAll);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                body: JSON.stringify(response)
            };
        }

        // Check for getDiagnosisHistory action
        if (requestData.action === 'getDiagnosisHistory') {
            console.log(`Processing getDiagnosisHistory action for ID: ${requestData.patientId}`);
            const includeAll = requestData.includeAll === true || requestData.includeAll === 'true';
            const response = await fetchDiagnosisHistory(requestData.patientId, includeAll);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                body: JSON.stringify(response)
            };
        }

        // Check for getPatientFiles action
        if (requestData.action === 'getPatientFiles') {
            console.log(`Processing getPatientFiles action for ID: ${requestData.patientId}`);
            const response = await handleGetPatientFiles(requestData.patientId);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check for getPatient action
        if (requestData.action === 'getPatient') {
            console.log(`Processing getPatient action for ID: ${requestData.patientId}`);
            const response = await handleGetPatient(requestData.patientId);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                body: JSON.stringify(response)
            };
        }

        // Check for getClinicalHistory action
        if (requestData.action === 'getClinicalHistory') {
            console.log(`Processing getClinicalHistory action for ID: ${requestData.patientId}`);
            const response = await fetchClinicalHistory(requestData.patientId);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check for getMedicalHistory action
        if (requestData.action === 'getMedicalHistory') {
            console.log(`Processing getMedicalHistory action for ID: ${requestData.patientId}`);
            const response = await fetchMedicalHistory(requestData.patientId);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check for getAllPatients action
        if (requestData.action === 'getAllPatients') {
            console.log("Processing getAllPatients action");
            const response = await getAllPatients();
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check for searchPatients action
        if (requestData.action === 'searchPatients') {
            console.log(`Processing searchPatients action for term: ${requestData.searchTerm}`);
            const response = await searchPatients(requestData);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check for deletePatient action
        if (requestData.action === 'deletePatient') {
            console.log(`Processing deletePatient action for ID: ${requestData.patientId}`);
            const response = await deletePatient(requestData);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check for deletePatientFile action
        if (requestData.action === 'deletePatientFile') {
            console.log(`Processing deletePatientFile action for ID: ${requestData.patientId}`);
            const response = await deletePatientFile(requestData);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify(response)
            };
        }

        // Check if this is a cleanup request for orphaned records
        if (requestData.action === 'cleanupOrphaned') {
            console.log("Processing cleanup request for orphaned records");
            return await cleanupOrphanedRecords();
        }

        // Determine operation type based on request parameters with improved type checking
        const isUpdateOperation = requestData.patientId && (
            requestData.updateMode === true ||
            requestData.updateMode === 'true' ||
            String(requestData.updateMode).toLowerCase() === 'true' ||
            requestData.isUpdate === 'true' // Additional check for the redundant flag
        );

        console.log("Is update operation:", isUpdateOperation);

        if (isUpdateOperation) {
            console.log(`Processing update request for patient ID: ${requestData.patientId}`);
            return await updatePatientData(requestData);
        } else if (requestData.isPartialSave === true || requestData.isPartialSave === 'true') {
            // Handle sectional save for patient directly - always create permanent records
            console.log("Processing patient section save with direct permanent records");
            return await processSectionSave(requestData);
        } else {
            // Check if we have patientId but updateMode is missing or false
            if (requestData.patientId && (!requestData.updateMode || requestData.updateMode === false)) {
                console.log(`Request has patientId but updateMode is not true. PatientId: ${requestData.patientId}`);
            }

            console.log("Processing new patient creation request");
            return await processPatientData(requestData);
        }
    } catch (error) {
        console.error('Error in handler:', error);
        return formatErrorResponse(error.message || "Request processing failed");
    }
};

// Enhanced saveMedicalHistoryEntry function with better timestamp handling
// and support for the "Add History" button entries with timestamp pattern
async function saveMedicalHistoryEntry(patientId, historyText) {
    try {
        console.log(`Saving medical history entry for patient ${patientId}`);

        if (!historyText) {
            console.log("No history text provided, skipping history save");
            return false;
        }

        // Extract timestamp if this came from "Add History" button
        let extractedTimestamp = null;
        const timestampMatch = historyText.match(/--- (New )?Entry \(([^)]+)\) ---/);
        if (timestampMatch && timestampMatch[2]) {
            try {
                extractedTimestamp = new Date(timestampMatch[2]);
                console.log(`Extracted timestamp from history text: ${extractedTimestamp.toISOString()}`);
            } catch (e) {
                console.warn(`Failed to parse extracted timestamp: ${timestampMatch[2]}`);
            }
        }

        // Create a history record with timestamp
        const historyRecord = {
            patientId: patientId,
            entryId: `${patientId}_${Date.now()}`, // Unique ID for this history entry
            timestamp: Date.now(), // Numeric timestamp for sorting
            recordDate: extractedTimestamp ? extractedTimestamp.toISOString() : new Date().toISOString(),
            text: historyText,
            source: timestampMatch ? 'add_history_button' : 'regular_update', // Track the source of the update
            // Track if this was from pending history in AsyncStorage
            fromPendingHistory: historyText.includes("--- New Entry") && historyText.includes("pending_history")
        };

        console.log(`Created history record with ID: ${historyRecord.entryId}`);

        // Check if the history table exists, create if not
        try {
            // Try to add a history record - will fail if table doesn't exist
            await dynamodb.send(new PutCommand({
                TableName: MEDICAL_HISTORY_TABLE,
                Item: historyRecord
            }));

            console.log(`Successfully saved history record to existing table: ${MEDICAL_HISTORY_TABLE}`);
            return true;
        } catch (error) {
            // If table doesn't exist, we'll handle that case
            console.warn(`Error saving to medical history table: ${error.message}`);
            console.warn("This is expected if the table doesn't exist");

            // For simplicity, we'll store the history in the patient record itself as a fallback
            console.log("Storing history in patient record as fallback");

            try {
                // Get current patient record
                const patientRecord = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                if (!patientRecord.Item) {
                    console.error(`Patient ${patientId} not found for history fallback`);
                    return false;
                }

                // Initialize or append to medicalHistoryEntries array
                const currentHistory = patientRecord.Item.medicalHistoryEntries || [];
                currentHistory.push(historyRecord);

                // Update the patient record with the history
                await dynamodb.send(new UpdateCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId },
                    UpdateExpression: "SET medicalHistoryEntries = :history",
                    ExpressionAttributeValues: {
                        ":history": currentHistory
                    }
                }));

                console.log(`Saved history to patient record fallback, ${currentHistory.length} total entries`);
                return true;
            } catch (fallbackError) {
                console.error(`Error saving history to fallback: ${fallbackError.message}`);
                return false;
            }
        }
    } catch (error) {
        console.error(`Error saving medical history entry: ${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// Function to save clinical parameters history
async function saveClinicalParametersHistory(patientId, parameters) {
    try {
        console.log(`Saving clinical parameters history for patient ${patientId}`);

        if (!parameters) {
            console.log("No parameters provided, skipping history save");
            return false;
        }

        // Ensure parameters have a date
        if (!parameters.date) {
            parameters.date = new Date().toISOString();
            console.log("Added missing date to parameters");
        }

        // Create a history record with timestamp
        const historyRecord = {
            patientId: patientId,
            paramId: `${patientId}_${Date.now()}`, // Unique ID for this parameter entry
            timestamp: Date.now(), // Numeric timestamp for sorting
            recordDate: new Date().toISOString(),
            ...parameters
        };

        console.log(`Created history record with ID: ${historyRecord.paramId}`);

        // Check if the history table exists, create if not
        try {
            // Try to add a history record - will fail if table doesn't exist
            await dynamodb.send(new PutCommand({
                TableName: CLINICAL_HISTORY_TABLE,
                Item: historyRecord
            }));

            console.log(`Successfully saved history record to existing table: ${CLINICAL_HISTORY_TABLE}`);
            return true;
        } catch (error) {
            // If table doesn't exist, we'll handle that case
            console.warn(`Error saving to history table: ${error.message}`);
            console.warn("This is expected if the table doesn't exist");

            // For simplicity, we'll store the history in the patient record itself as a fallback
            console.log("Storing history in patient record as fallback");

            try {
                // Get current patient record
                const patientRecord = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                if (!patientRecord.Item) {
                    console.error(`Patient ${patientId} not found for history fallback`);
                    return false;
                }

                // Initialize or append to clinicalHistory array
                const currentHistory = patientRecord.Item.clinicalHistory || [];
                currentHistory.push(historyRecord);

                // Update the patient record with the history
                await dynamodb.send(new UpdateCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId },
                    UpdateExpression: "SET clinicalHistory = :history",
                    ExpressionAttributeValues: {
                        ":history": currentHistory
                    }
                }));

                console.log(`Saved history to patient record fallback, ${currentHistory.length} total entries`);
                return true;
            } catch (fallbackError) {
                console.error(`Error saving history to fallback: ${fallbackError.message}`);
                return false;
            }
        }
    } catch (error) {
        console.error(`Error saving clinical parameters history: ${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// Function to clean up orphaned records
async function cleanupOrphanedRecords() {
    try {
        console.log("Starting orphaned records cleanup process");

        // Scan for orphaned records
        const scanResult = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE,
            FilterExpression: "attribute_exists(isOrphaned)",
            ExpressionAttributeValues: {
                ":isOrphaned": true
            }
        }));

        if (!scanResult.Items || scanResult.Items.length === 0) {
            console.log("No orphaned records found to clean up");
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true
                },
                body: JSON.stringify({
                    success: true,
                    message: 'No orphaned records found to clean up',
                    cleanedCount: 0
                })
            };
        }

        console.log(`Found ${scanResult.Items.length} orphaned records to analyze`);

        // Identify orphaned records (records missing essential info)
        const orphanedRecords = scanResult.Items.filter(item => {
            // Check for records with no name or empty name
            const missingName = !item.name || item.name.trim() === '';

            // Check for records with no medication info
            const hasMedications = item.medications && item.medications.length > 0;

            // Get record age in days
            const recordAgeMs = Date.now() - new Date(item.createdAt || 0).getTime();
            const recordAgeDays = recordAgeMs / (1000 * 60 * 60 * 24);

            // Records over 30 days old should be considered orphaned
            const isOld = recordAgeDays > 30;

            // Records that are missing name but have medications are likely orphaned prescriptions
            const isOrphanedPrescription = missingName && hasMedications;

            // Records that are old are also candidates for cleanup
            return isOrphanedPrescription || isOld;
        });

        console.log(`Identified ${orphanedRecords.length} orphaned records to clean up`);

        // Clean up orphaned records
        let cleanedCount = 0;
        for (const record of orphanedRecords) {
            try {
                console.log(`Cleaning up orphaned record: ${record.patientId}`);

                await dynamodb.send(new DeleteCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId: record.patientId }
                }));

                cleanedCount++;
                console.log(`Successfully deleted orphaned record: ${record.patientId}`);
            } catch (error) {
                console.error(`Failed to delete orphaned record ${record.patientId}: ${error.message}`);
            }
        }

        console.log(`Cleaned up ${cleanedCount} orphaned records`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: `Successfully cleaned up ${cleanedCount} orphaned records`,
                totalFound: orphanedRecords.length,
                cleanedCount: cleanedCount
            })
        };
    } catch (error) {
        console.error('Error in cleanupOrphanedRecords:', error);
        return formatErrorResponse(error.message || "Failed to clean up orphaned records");
    }
}

// MODIFIED: processSectionSave function to directly create permanent records
async function processSectionSave(sectionData) {
    try {
        console.log("Starting processSectionSave with direct permanent records");

        // Check which section we're saving
        const section = sectionData.saveSection;
        if (!section) {
            return formatErrorResponse("Section must be specified for sectional saves");
        }

        console.log(`Processing section save for: ${section}`);

        // Use existing patientId if provided, or generate a new one
        let patientId = sectionData.patientId;
        let existingPatient = null;

        // Additional logging for incoming patientId
        console.log(`Incoming patientId: ${patientId || 'not provided'}`);
        console.log(`Incoming patientId type: ${typeof patientId}`);

        // STEP 1: Try to find existing patient if ID is provided
        if (patientId) {
            console.log(`Looking up patient with ID: ${patientId}`);
            try {
                const patientResponse = await dynamodb.send(new GetCommand({
                    TableName: PATIENTS_TABLE,
                    Key: { patientId }
                }));

                existingPatient = patientResponse.Item;

                if (existingPatient) {
                    // CRITICAL FIX: If name or mobile doesn't match, this is probably the wrong patient record
                    if ((sectionData.name && existingPatient.name &&
                        sectionData.name.trim() !== existingPatient.name.trim()) ||
                        (sectionData.mobile && existingPatient.mobile &&
                            sectionData.mobile.trim() !== existingPatient.mobile.trim())) {
                        console.warn(`⚠️ Found patient ${patientId} but name/mobile doesn't match! This appears to be a different patient. Creating new record.`);
                        console.log(`Existing patient: ${existingPatient.name} / ${existingPatient.mobile}`);
                        console.log(`Current data: ${sectionData.name} / ${sectionData.mobile}`);
                        patientId = null; // Force generation of a new ID
                        existingPatient = null;
                    }
                    else {
                        console.log(`Found existing patient by ID: ${existingPatient.name || 'unnamed'}`);

                        // Log savedSections to help with debugging
                        console.log("Existing patient saved sections:", JSON.stringify(existingPatient.savedSections || {}));
                    }
                } else {
                    console.log(`No patient found with ID: ${patientId}`);
                    patientId = null;
                }
            } catch (error) {
                console.warn(`Failed to find patient by ID: ${error.message}`);
                console.warn(error.stack);
                patientId = null; // Reset patientId
            }
        }

        // STEP 2: If patientId not provided or not found, generate a new one
        if (!patientId) {
            // Generate a permanent UUID
            patientId = randomUUID();
            console.log(`Generated new permanent patient ID: ${patientId}`);
        }

        // Initialize/update saved sections tracking
        const savedSections = existingPatient?.savedSections || {
            basic: false,
            clinical: false,
            prescription: false,
            diagnosis: false
        };

        // Always set the current section to be saved right at the beginning
        // This ensures the savedSections flag is set properly
        savedSections[section] = true;
        console.log(`Immediately marking section ${section} as saved. Updated saved sections:`, savedSections);

        // If we're saving the basic section, make sure it's properly marked
        if (section === 'basic') {
            savedSections.basic = true;
            console.log("Basic section is being saved, explicitly setting savedSections.basic = true");
        }

        // If we have the basic info in this request but we're saving prescription,
        // use the data to create a synthetic "basic" save first
        if (section === 'prescription' && !savedSections.basic && sectionData.name && sectionData.mobile) {
            console.log("Prescription section with basic info provided. Creating basic info first.");
            savedSections.basic = true;
            console.log("Synthetic basic section created from prescription data, setting savedSections.basic = true");
        }

        // Validate prescription update
        if (section === 'prescription') {
            console.log("Validating requirements for prescription save...");

            // Check if the basic section has been saved or if we have enough info in this request
            if (!savedSections.basic && !(sectionData.name && sectionData.mobile)) {
                console.warn("⚠️ Attempted to save prescription without basic patient information marked as saved");
                console.log("Current savedSections state:", savedSections);

                // If we have an existing patient with a name but the basic section flag is false,
                // this is probably just a flag issue. Let's fix it instead of failing.
                if (existingPatient && existingPatient.name && existingPatient.name.trim() !== '') {
                    console.log("Found patient with name but basic section not marked as saved. Fixing this inconsistency.");
                    savedSections.basic = true;
                    console.log("Updated savedSections:", savedSections);
                } else {
                    // If we don't have a patient with name, we need to return a more helpful error message
                    console.error("Cannot save prescription without basic patient information");
                    return formatErrorResponse("Cannot save prescription without first saving basic patient information. Please go to the Basic Info tab, complete it, and then return to Prescription tab.");
                }
            }

            // Additional validation to ensure we have a patient with a name
            if ((!existingPatient || !existingPatient.name || existingPatient.name.trim() === '') &&
                (!sectionData.name || sectionData.name.trim() === '')) {
                console.warn("⚠️ Attempted to save prescription but patient has no name");
                return formatErrorResponse("Cannot save prescription: Patient name is required. Please provide patient name in the Basic Info tab first.");
            }


            console.log("Prescription validation passed, continuing with save");
        }

        // Initialize base patient data - either existing or new
        let patientItem = existingPatient || {
            patientId: patientId,
            createdAt: new Date().toISOString(),
            name: "",
            age: 0,
            sex: "Male",
            // Add searchable fields for dashboard
            nameSearchable: "",
            mobileSearchable: ""
        };

        // Update the timestamp and lastVisitDate
        const now = new Date().toISOString();
        patientItem.updatedAt = now;
        patientItem.lastVisitDate = now;

        // Add saved sections tracking
        patientItem.savedSections = savedSections;

        // Process section-specific data
        switch (section) {
            case 'basic':
                // Validate basic required fields
                if (!sectionData.name || !sectionData.age || !sectionData.mobile) {
                    return formatErrorResponse("Missing required basic information (name, age, mobile)");
                }

                patientItem.name = sectionData.name;
                patientItem.age = parseInt(sectionData.age) || 0;
                patientItem.sex = sectionData.sex || "Male";
                patientItem.mobile = sectionData.mobile;
                patientItem.address = sectionData.address || "";

                // Update searchable fields
                patientItem.nameSearchable = sectionData.name.toLowerCase();
                patientItem.mobileSearchable = sectionData.mobile;

                // Explicitly set the basic section as saved again to ensure it's set
                patientItem.savedSections.basic = true;
                console.log("Basic section is being saved, double-checking savedSections.basic = true");
                break;

            case 'clinical':
                // Check if medicalHistory update is from pending history in AsyncStorage
                if (sectionData.medicalHistory !== undefined) {
                    const currentMedicalHistory = patientItem.medicalHistory || "";

                    // Only save history if the text has actually changed
                    if (sectionData.medicalHistory !== currentMedicalHistory) {
                        console.log("Medical history has changed, checking if history should be saved");

                        // Check if this appears to be an "Add History" update by looking for timestamp pattern
                        const hasTimestampPattern = sectionData.medicalHistory.includes("--- New Entry (") ||
                            sectionData.medicalHistory.includes("--- Entry (");

                        // Check if this might be from pending history in AsyncStorage
                        const isPendingHistory = sectionData.pendingHistoryIncluded ||
                            sectionData.medicalHistory.includes("pending_history");

                        // If it has the timestamp pattern from Add History or pending history flags, force history tracking
                        const shouldCreateHistoryEntry = hasTimestampPattern || isPendingHistory;

                        if (shouldCreateHistoryEntry) {
                            try {
                                console.log("Creating medical history entry due to Add History update or pending history");
                                await saveMedicalHistoryEntry(patientId, sectionData.medicalHistory);
                                console.log("Successfully saved medical history entry");
                            } catch (historyError) {
                                console.error(`Error saving medical history entry: ${historyError.message}`);
                                // Continue with the save even if history fails
                            }
                        } else {
                            console.log("No Add History pattern or pending history flag detected, skipping history save");
                        }
                    } else {
                        console.log("Medical history has not changed, skipping history save");
                    }

                    // Add the medicalHistory field
                    patientItem.medicalHistory = sectionData.medicalHistory;
                }

                // Keep diagnosis field
                patientItem.diagnosis = sectionData.diagnosis || "";

                // Handle advisedInvestigations with history tracking
                if (sectionData.advisedInvestigations !== undefined) {
                    const currentInvestigations = patientItem.advisedInvestigations || "";

                    // Check if advisedInvestigations has changed
                    if (sectionData.advisedInvestigations !== currentInvestigations) {
                        console.log("Advised investigations have changed");

                        // Save investigations history if they're not empty
                        if (sectionData.advisedInvestigations && sectionData.advisedInvestigations.trim() !== '') {
                            try {
                                await saveInvestigationsHistoryEntry(patientId, sectionData.advisedInvestigations);
                                console.log("Successfully saved investigations history entry");
                            } catch (invHistoryError) {
                                console.error(`Error saving investigations history entry: ${invHistoryError.message}`);
                                // Continue with save even if history save fails
                            }
                        }
                    }

                    // Update advisedInvestigations field
                    patientItem.advisedInvestigations = sectionData.advisedInvestigations;
                }

                // Update reports text
                patientItem.reports = sectionData.reports || "";

                // Handle clinical parameters if provided
                if (sectionData.clinicalParameters) {
                    console.log("Processing clinical parameters:",
                        Object.keys(sectionData.clinicalParameters).join(", "));

                    // Log if the createParameterHistory flag is set
                    if (sectionData.createParameterHistory) {
                        console.log("createParameterHistory flag is set, will save parameter history");
                    } else {
                        console.log("createParameterHistory flag is NOT set, history will not be saved");
                    }

                    // Store the current clinical parameters in the patient record
                    patientItem.clinicalParameters = sectionData.clinicalParameters;

                    // If createParameterHistory flag is set, save to history
                    if (sectionData.createParameterHistory) {
                        try {
                            // Save the clinical parameters to history
                            await saveClinicalParametersHistory(patientId, sectionData.clinicalParameters);
                        } catch (historyError) {
                            console.error(`Error saving clinical parameters history: ${historyError.message}`);
                            // Continue with the save even if history fails
                        }
                    }
                } else {
                    // Keep existing clinical parameters if they exist
                    patientItem.clinicalParameters = patientItem.clinicalParameters || {
                        date: new Date().toISOString().split('T')[0],
                        inr: "",
                        hb: "",
                        wbc: "",
                        platelet: "",
                        bilirubin: "",
                        sgot: "",
                        sgpt: "",
                        alt: "",
                        tprAlb: "",
                        ureaCreat: "",
                        sodium: "",
                        fastingHBA1C: "",
                        pp: "",
                        tsh: "",
                        ft4: "",
                        others: ""
                    };
                }

                // Process report files if provided in clinical section
                if (sectionData.reportFiles && Array.isArray(sectionData.reportFiles) && sectionData.reportFiles.length > 0) {
                    console.log(`Processing ${sectionData.reportFiles.length} report files from clinical section`);

                    // Log file details for debugging
                    sectionData.reportFiles.forEach((file, index) => {
                        console.log(`File ${index + 1}/${sectionData.reportFiles.length}: 
                            Name: ${file.name || 'unnamed'}, 
                            Type: ${file.type || 'unknown'}, 
                            Has base64Data: ${!!file.base64Data},
                            Base64 length: ${file.base64Data ? file.base64Data.length : 'N/A'},
                            URI: ${file.uri ? `${file.uri.substring(0, 30)}...` : 'None'},
                            Category: ${file.category || 'uncategorized'}`
                        );
                    });

                    try {
                        // Make sure existing files are kept
                        const existingFiles = patientItem.reportFiles || [];

                        // Better file deduplication before processing
                        const newFilesToProcess = deduplicateFiles(sectionData.reportFiles, existingFiles);

                        if (newFilesToProcess.length > 0) {
                            console.log(`After deduplication, processing ${newFilesToProcess.length} new files`);

                            // Process the new files
                            const newFiles = await processReportFiles(newFilesToProcess, patientId);
                            console.log(`Processed ${newFiles.length} new files. Details:`, JSON.stringify(newFiles.map(f => ({
                                name: f.name,
                                url: f.url,
                                uploadedToS3: f.uploadedToS3 || false,
                                category: f.category || 'uncategorized'
                            }))));

                            // Add the processed files to the patient record
                            patientItem.reportFiles = [...existingFiles, ...newFiles];

                            // Update reports text field if files were successfully processed and not already mentioned
                            if (newFiles.length > 0) {
                                const today = new Date().toLocaleDateString();

                                // Add file references to reports text if not already there
                                newFiles.forEach(file => {
                                    const categoryInfo = file.category ? ` (Category: ${file.category})` : '';
                                    const fileReference = `- Uploaded: ${file.name}${categoryInfo} (${today})`;
                                    if (!patientItem.reports.includes(fileReference)) {
                                        patientItem.reports = patientItem.reports
                                            ? `${patientItem.reports}\n${fileReference}`
                                            : fileReference;
                                    }
                                });
                            }
                        } else {
                            console.log("No new files to process after deduplication");
                        }
                    } catch (error) {
                        console.error(`Error processing report files in clinical section: ${error.message}`);
                        console.error(error.stack);
                    }
                }
                break;

            case 'prescription':
                // If we have basic info in the request, apply it to the patient record
                if (sectionData.name && sectionData.mobile) {
                    console.log("Applying basic patient info provided with prescription data");
                    patientItem.name = sectionData.name;
                    patientItem.mobile = sectionData.mobile;

                    // If age is provided
                    if (sectionData.age) {
                        patientItem.age = parseInt(sectionData.age) || 0;
                    }

                    // If sex is provided
                    if (sectionData.sex) {
                        patientItem.sex = sectionData.sex;
                    }

                    // Mark basic section as saved
                    patientItem.savedSections.basic = true;
                    console.log("Basic info applied from prescription data, marked basic section as saved");
                }

                // Process medications if provided
                if (sectionData.medications && Array.isArray(sectionData.medications)) {
                    console.log(`Processing ${sectionData.medications.length} medications`);

                    patientItem.medications = processMedications(sectionData.medications);

                    // Generate prescription text
                    patientItem.generatedPrescription = generatePrescriptionText(patientItem.medications);
                } else {
                    // Initialize empty medications array if not provided
                    patientItem.medications = patientItem.medications || [];
                }
                break;

            case 'diagnosis':
                // Check if diagnosis has changed and save to history if needed
                if (sectionData.diagnosis !== undefined) {
                    const currentDiagnosis = patientItem.diagnosis || "";

                    // Log the diagnosis values for debugging
                    console.log(`Current diagnosis: "${currentDiagnosis}"`);
                    console.log(`New diagnosis: "${sectionData.diagnosis}"`);

                    // Only save history if the text has actually changed
                    if (sectionData.diagnosis !== currentDiagnosis) {
                        console.log("Diagnosis has changed, checking if history should be saved");

                        // Check if createDiagnosisHistory flag is set
                        if (sectionData.createDiagnosisHistory) {
                            console.log("createDiagnosisHistory flag is set, saving diagnosis history");
                            try {
                                await saveDiagnosisHistoryEntry(
                                    patientId,
                                    sectionData.diagnosis,
                                    sectionData.advisedInvestigations
                                );
                                console.log("Successfully saved diagnosis history entry");
                            } catch (historyError) {
                                console.error(`Error saving diagnosis history entry: ${historyError.message}`);
                                // Continue with the save even if history fails
                            }
                        } else {
                            console.log("createDiagnosisHistory flag not set, skipping history save");
                        }
                    } else {
                        console.log("Diagnosis hasn't changed, skipping history save");
                    }

                    // Update the diagnosis
                    patientItem.diagnosis = sectionData.diagnosis;
                }

                // Handle advisedInvestigations with history tracking
                if (sectionData.advisedInvestigations !== undefined) {
                    const currentInvestigations = patientItem.advisedInvestigations || "";

                    // Check if advisedInvestigations has changed
                    if (sectionData.advisedInvestigations !== currentInvestigations) {
                        console.log("Advised investigations have changed");

                        // Save investigations history separately if they're not empty
                        if (sectionData.advisedInvestigations && sectionData.advisedInvestigations.trim() !== '') {
                            try {
                                await saveInvestigationsHistoryEntry(patientId, sectionData.advisedInvestigations);
                                console.log("Successfully saved separate investigations history entry");
                            } catch (invHistoryError) {
                                console.error(`Error saving separate investigations history: ${invHistoryError.message}`);
                                // Continue with save even if history save fails
                            }
                        }
                    }

                    // Update advisedInvestigations field
                    patientItem.advisedInvestigations = sectionData.advisedInvestigations;
                }

                // Process report files if provided
                if (sectionData.reportFiles && sectionData.reportFiles.length > 0) {
                    console.log(`Processing ${sectionData.reportFiles.length} report files for diagnosis section`);

                    // Log file categories
                    sectionData.reportFiles.forEach((file, index) => {
                        console.log(`Report file ${index + 1} category: ${file.category || 'uncategorized'}`);
                    });

                    // Make sure existing files are kept
                    const existingFiles = patientItem.reportFiles || [];

                    // Better file deduplication
                    const newFilesToProcess = deduplicateFiles(sectionData.reportFiles, existingFiles);

                    if (newFilesToProcess.length > 0) {
                        console.log(`After deduplication, processing ${newFilesToProcess.length} new files`);
                        const newFiles = await processReportFiles(newFilesToProcess, patientId);

                        // Combine existing and new files
                        patientItem.reportFiles = [...existingFiles, ...newFiles];
                    } else {
                        console.log("No new files to process after deduplication");
                        patientItem.reportFiles = existingFiles;
                    }
                }
                break;

            default:
                return formatErrorResponse(`Unknown section: ${section}`);
        }

        // Add firstVisit data if not already present
        if (!patientItem.firstVisit) {
            patientItem.firstVisit = {
                date: new Date().toISOString().split('T')[0],
                diagnosis: patientItem.diagnosis || "",
                reports: patientItem.reports || "",
                advisedInvestigations: patientItem.advisedInvestigations || ""
            };
        }

        // Save the updated patient record
        await dynamodb.send(new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: patientItem
        }));

        console.log(`Patient record saved with permanent ID: ${patientId}`);

        // Return patientId and completion status - check if all sections are saved
        const allSectionsSaved = Object.values(savedSections).every(saved => saved === true);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: allSectionsSaved
                    ? 'All sections saved, patient record complete'
                    : `Section ${section} saved successfully`,
                patientId: patientId,
                isComplete: allSectionsSaved,
                savedSections
            })
        };
    } catch (error) {
        console.error('Error in processSectionSave:', error);
        return formatErrorResponse(error.message || "Failed to save section");
    }
}

// Enhance the deduplicateFiles function for better file identification
function deduplicateFiles(newFiles, existingFiles) {
    if (!Array.isArray(newFiles) || newFiles.length === 0) {
        console.log("⚠️ No new files to deduplicate");
        return [];
    }

    console.log(`🔍 DEDUPLICATION: Starting with ${newFiles.length} new files and ${existingFiles?.length || 0} existing files`);

    // Log the first 3 new files for debugging
    newFiles.slice(0, 3).forEach((file, idx) => {
        console.log(`📄 New file ${idx + 1}: Name: ${file.name || 'unnamed'}, Type: ${file.type || 'unknown'}`);
        console.log(`   Has URI: ${!!file.uri}, Has URL: ${!!file.url}, Has base64Data: ${!!file.base64Data}, Has key: ${!!file.key}`);
        if (file.uri) console.log(`   URI preview: ${file.uri.substring(0, 40)}...`);
        if (file.category) console.log(`   Category: ${file.category}`);
    });

    // Also log the first 3 existing files
    if (Array.isArray(existingFiles) && existingFiles.length > 0) {
        existingFiles.slice(0, 3).forEach((file, idx) => {
            console.log(`📂 Existing file ${idx + 1}: Name: ${file.name || 'unnamed'}, Type: ${file.type || 'unknown'}`);
            console.log(`   Has URI: ${!!file.uri}, Has URL: ${!!file.url}, Has base64Data: ${!!file.base64Data}, Has key: ${!!file.key}`);
            if (file.uri) console.log(`   URI preview: ${file.uri.substring(0, 40)}...`);
            if (file.url) console.log(`   URL preview: ${file.url.substring(0, 40)}...`);
            if (file.category) console.log(`   Category: ${file.category}`);
        });
    }

    if (!Array.isArray(existingFiles) || existingFiles.length === 0) {
        // No existing files, just deduplicate within the new files
        const uniqueNewFiles = new Map();

        newFiles.forEach(file => {
            const fileKey = getFileUniqueKey(file);
            console.log(`📋 New file unique key: ${fileKey}`);

            if (!uniqueNewFiles.has(fileKey)) {
                uniqueNewFiles.set(fileKey, file);
            } else {
                console.log(`⚠️ Skipping duplicate new file: ${file.name || 'unnamed'} with key ${fileKey}`);
            }
        });

        const result = Array.from(uniqueNewFiles.values());
        console.log(`✅ After internal deduplication: ${result.length} files`);
        return result;
    }

    // We have both new files and existing files, so check for duplicates across both sets
    const uniqueNewFiles = [];

    // Create a more detailed map of existing files for better matching
    const existingFileKeys = new Map();
    existingFiles.forEach(file => {
        // Store multiple identifiers for each existing file
        const primaryKey = getFileUniqueKey(file);
        existingFileKeys.set(primaryKey, true);
        console.log(`🔑 Existing file key: ${primaryKey} for file: ${file.name || 'unnamed'}`);

        // Also check by name+category combination
        if (file.name) {
            const nameKey = `name:${file.name}_${file.category || 'uncategorized'}`;
            existingFileKeys.set(nameKey, true);
            console.log(`   Also adding name key: ${nameKey}`);
        }

        // Check by URL/URI if available
        if (file.url) {
            existingFileKeys.set(`url:${file.url}`, true);
        }
        if (file.uri) {
            existingFileKeys.set(`uri:${file.uri}`, true);
        }
    });

    // Track unique new files to avoid duplicates within the new batch
    const uniqueNewFileKeys = new Map();

    newFiles.forEach(file => {
        // Check primary key
        const primaryKey = getFileUniqueKey(file);
        console.log(`🔍 Checking new file: ${file.name || 'unnamed'} with key ${primaryKey}`);

        if (existingFileKeys.has(primaryKey)) {
            console.log(`⚠️ Skipping file already in existing files by primary key: ${file.name || 'unnamed'}`);
            return;
        }

        // Check name+category
        if (file.name) {
            const nameKey = `name:${file.name}_${file.category || 'uncategorized'}`;
            if (existingFileKeys.has(nameKey)) {
                console.log(`⚠️ Skipping file already in existing files by name+category: ${file.name}`);
                return;
            }
        }

        // Check URL/URI
        if (file.url && existingFileKeys.has(`url:${file.url}`)) {
            console.log(`⚠️ Skipping file already in existing files by URL: ${file.name || 'unnamed'}`);
            return;
        }
        if (file.uri && existingFileKeys.has(`uri:${file.uri}`)) {
            console.log(`⚠️ Skipping file already in existing files by URI: ${file.name || 'unnamed'}`);
            return;
        }

        // Check if this file duplicates another in the new files batch
        if (uniqueNewFileKeys.has(primaryKey)) {
            console.log(`⚠️ Skipping duplicate in new files: ${file.name || 'unnamed'}`);
            return;
        }

        // This is a unique new file
        console.log(`✅ Adding unique new file: ${file.name || 'unnamed'}`);
        uniqueNewFileKeys.set(primaryKey, true);
        uniqueNewFiles.push(file);
    });

    console.log(`✅ Final result after deduplication: ${uniqueNewFiles.length} new unique files`);
    return uniqueNewFiles;
}

// Updated getFileUniqueKey function with better fingerprinting
function getFileUniqueKey(file) {
    // If it has a url or uri, use that as it's already processed
    if (file.url) {
        return `url:${file.url}`;
    }

    if (file.uri) {
        return `uri:${file.uri}`;
    }

    // If it has base64Data, use a hash of the first part as a fingerprint
    if (file.base64Data) {
        // Extract a portion for comparison
        let dataFingerprint;
        if (file.base64Data.startsWith('data:')) {
            // For data URIs, extract the mime type too as part of the fingerprint
            const parts = file.base64Data.split(',');
            const mimeType = parts[0];
            const data = parts[1] ? parts[1].substring(0, 100) : '';
            dataFingerprint = `${mimeType}_${data}`;
        } else {
            dataFingerprint = file.base64Data.substring(0, 100);
        }
        return `data:${file.name || ''}_${dataFingerprint}`;
    }

    // If it has a key (S3 object key), use that
    if (file.key) {
        return `key:${file.key}`;
    }

    // Fallback to name + category + creation time if available
    const timeStamp = file.processedAt || file.createdAt || file.uploadSuccessTime || '';
    return `name:${file.name || 'unnamed'}_${file.category || 'uncategorized'}_${timeStamp}`;
}

// Function to process medications data - Updated to remove unit field references
// and add more validation to prevent orphaned prescriptions
function processMedications(medications) {
    if (!Array.isArray(medications) || medications.length === 0) {
        console.warn("Empty or invalid medications array");
        return [];
    }

    return medications.map(med => {
        // Make a copy of the medication to avoid modifying the original
        const processedMed = { ...med };

        // Validate medication has a name
        if (!processedMed.name || processedMed.name.trim() === '') {
            console.warn("Medication missing name, adding placeholder");
            processedMed.name = `Medication ${new Date().toISOString()}`;
        }

        // Process timingValues if exists - ensure it's proper JSON
        if (processedMed.timingValues) {
            try {
                // If it's already a string, try to parse it to validate
                if (typeof processedMed.timingValues === 'string') {
                    JSON.parse(processedMed.timingValues);
                    // It's already valid JSON, keep as is
                } else {
                    // If it's an object, stringify it
                    processedMed.timingValues = JSON.stringify(processedMed.timingValues);
                }
            } catch (e) {
                console.warn(`Invalid timingValues for medication ${processedMed.name}: ${e.message}`);
                // Reset to empty object JSON if invalid
                processedMed.timingValues = "{}";
            }
        } else {
            // Initialize if missing
            processedMed.timingValues = "{}";
        }

        // Handle migration from old format (dosage & frequency) to new format if needed
        if (processedMed.dosage && !processedMed.timingValues) {
            console.log(`Converting old medication format to new format for ${processedMed.name}`);
            // If we have dosage but no timing values, and timing is set
            if (processedMed.timing) {
                try {
                    // Create timing values from timing and dosage
                    const timings = processedMed.timing.split(',');
                    const timingValuesObj = {};

                    timings.forEach(timing => {
                        if (timing) {
                            timingValuesObj[timing] = processedMed.dosage;
                        }
                    });

                    processedMed.timingValues = JSON.stringify(timingValuesObj);
                } catch (e) {
                    console.warn(`Failed to convert old medication format: ${e.message}`);
                }
            }
        }

        // Ensure specialInstructions is a string
        if (processedMed.specialInstructions === undefined) {
            processedMed.specialInstructions = "";
        }

        // Ensure duration is set
        if (!processedMed.duration || processedMed.duration.trim() === '') {
            processedMed.duration = "as needed";
        }

        // Add timestamp for when medication was processed
        processedMed.processedAt = processedMed.processedAt || new Date().toISOString();

        return processedMed;
    });
}

// Updated updatePatientData function with better "Add History" handling
// Added support for handling pending history from AsyncStorage
async function updatePatientData(updateData) {
    try {
        console.log("Starting updatePatientData with data:", JSON.stringify({
            patientId: updateData.patientId,
            updateSection: updateData.updateSection,
            updateMode: updateData.updateMode,
            hasName: !!updateData.name,
            nameValue: updateData.name
        }));

        const { patientId, updateSection } = updateData;

        if (!patientId) {
            return formatErrorResponse("Patient ID is required for updates");
        }

        console.log(`Update request for patient ${patientId}, section: ${updateSection || 'all'}`);

        // First fetch the current patient record
        const patientResponse = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientResponse.Item) {
            console.error(`Patient with ID ${patientId} not found in database`);
            return formatErrorResponse(`Patient with ID ${patientId} not found`);
        }

        const currentPatient = patientResponse.Item;
        console.log(`Retrieved existing patient record: ${currentPatient.name}`);

        // Initialize update expression and attribute values
        let updateExpression = "SET updatedAt = :updatedAt";
        const expressionAttributeValues = {
            ":updatedAt": new Date().toISOString()
        };

        // Initialize or update savedSections tracking
        const savedSections = currentPatient.savedSections || {
            basic: false,
            clinical: false,
            prescription: false,
            diagnosis: false
        };

        // If the basic section exists, always ensure it's marked as saved
        // if we have a valid name for the patient
        if (currentPatient.name && currentPatient.name.trim() !== '') {
            if (!savedSections.basic) {
                console.log("Patient has name but basic section not marked as saved. Fixing this inconsistency.");
                savedSections.basic = true;
            }
        }

        // Validate prescription update to prevent orphaned prescriptions
        if (updateSection === 'prescription' && (!currentPatient.name || currentPatient.name.trim() === '')) {
            console.warn("⚠️ Attempted to update prescription for patient with no name");
            return formatErrorResponse("Cannot update prescription for a patient with missing basic information");
        }

        // Process report files if any are included in the update
        if (updateData.reportFiles && updateData.reportFiles.length > 0) {
            console.log(`📂 REPORT FILES UPDATE: Processing ${updateData.reportFiles.length} report files for patient ${patientId}`);

            // Deduplicate logic
            const existingFiles = currentPatient.reportFiles || [];
            const newFilesToProcess = deduplicateFiles(updateData.reportFiles, existingFiles);

            if (newFilesToProcess.length > 0) {
                console.log(`✅ After deduplication, processing ${newFilesToProcess.length} new files`);

                try {
                    // Use centralized processReportFiles logic
                    // This returns { processedFiles (for DB), failedUploads, filesForResponse }
                    const { processedFiles, failedUploads } = await processReportFiles(newFilesToProcess, patientId);

                    // Log failures if any
                    if (failedUploads.length > 0) {
                        console.error(`❌ Some files failed to upload: ${failedUploads.join(', ')}`);
                    }

                    // Merge with existing files
                    // processedFiles contains ONLY verified S3 uploads (or existing verified remote URLs)
                    const mergedFiles = [...existingFiles, ...processedFiles];
                    console.log(`📂 Final merged files count: ${mergedFiles.length}`);

                    updateExpression += ", reportFiles = :reportFiles";
                    expressionAttributeValues[":reportFiles"] = mergedFiles;
                } catch (error) {
                    console.error(`❌ Error processing report files: ${error.message}`);
                }
            } else {
                console.log("⚠️ No new files to process after deduplication");
            }
        }

        // Handle updates by section and mark section as saved
        switch (updateSection) {
            case 'basic':
                console.log("Updating basic patient information");
                if (updateData.name) {
                    updateExpression += ", #name = :name";
                    expressionAttributeValues[":name"] = updateData.name;
                }

                if (updateData.age !== undefined) {
                    updateExpression += ", age = :age";
                    expressionAttributeValues[":age"] = parseInt(updateData.age) || 0;
                }

                if (updateData.sex) {
                    updateExpression += ", sex = :sex";
                    expressionAttributeValues[":sex"] = updateData.sex;
                }

                if (updateData.mobile !== undefined) {
                    updateExpression += ", mobile = :mobile";
                    expressionAttributeValues[":mobile"] = updateData.mobile;
                }

                if (updateData.address !== undefined) {
                    updateExpression += ", address = :address";
                    expressionAttributeValues[":address"] = updateData.address;
                }

                // Mark basic section as saved
                savedSections.basic = true;
                break;

            case 'clinical':
                console.log("Updating clinical information");

                // CRITICAL FIX: Always update medicalHistory if it's provided
                if (updateData.medicalHistory !== undefined) {
                    // Check if the medical history has changed
                    const currentMedicalHistory = currentPatient.medicalHistory || "";

                    // Log medicalHistory values for debugging
                    console.log(`Current medicalHistory: "${currentMedicalHistory.substring(0, 50)}..."`);
                    console.log(`New medicalHistory: "${updateData.medicalHistory.substring(0, 50)}..."`);

                    if (updateData.medicalHistory !== currentMedicalHistory) {
                        console.log("Medical history has changed, checking if history should be saved");

                        // Check for timestamp pattern that indicates "Add History" was used
                        const hasTimestampPattern = updateData.medicalHistory.includes("--- New Entry (") ||
                            updateData.medicalHistory.includes("--- Entry (");

                        // Check if this is from pending history in AsyncStorage
                        const isPendingHistory = updateData.pendingHistoryIncluded ||
                            (updateData.medicalHistory &&
                                updateData.medicalHistory.includes("pending_history")) ||
                            (updateData.medicalHistory &&
                                hasTimestampPattern &&
                                !currentMedicalHistory.includes(updateData.medicalHistory.split("---")[1] || ""));

                        // Use explicit flag or detect Add History pattern or pending history
                        const shouldCreateHistoryEntry = updateData.createMedicalHistoryEntry ||
                            hasTimestampPattern ||
                            isPendingHistory;

                        if (shouldCreateHistoryEntry) {
                            try {
                                console.log("Creating medical history entry due to Add History update, explicit flag, or pending history");
                                await saveMedicalHistoryEntry(patientId, updateData.medicalHistory);
                                console.log("Successfully saved medical history entry");
                            } catch (historyError) {
                                console.error(`Error saving medical history entry: ${historyError.message}`);
                                // Continue with the update even if history fails
                            }
                        } else {
                            console.log("No Add History pattern detected and no flags set, skipping history save");
                        }
                    } else if (updateData.forceHistoryUpdate) {
                        // Even if the history text appears unchanged, force history update if flag is set
                        console.log("forceHistoryUpdate flag set - saving medical history even though text appears unchanged");
                        try {
                            await saveMedicalHistoryEntry(patientId, updateData.medicalHistory);
                            console.log("Successfully forced medical history entry save");
                        } catch (historyError) {
                            console.error(`Error forcing medical history entry save: ${historyError.message}`);
                        }
                    } else {
                        console.log("Medical history unchanged, skipping history save");
                    }

                    // CRITICAL FIX: Always update the medicalHistory field in database regardless of other conditions
                    updateExpression += ", medicalHistory = :medicalHistory";
                    expressionAttributeValues[":medicalHistory"] = updateData.medicalHistory;
                    console.log(`Setting medicalHistory in database to: "${updateData.medicalHistory.substring(0, 50)}..."`);
                }

                // Check if diagnosis has changed and save to history if needed
                if (updateData.diagnosis !== undefined) {
                    // Log the current and new diagnosis values
                    const currentDiagnosis = currentPatient.diagnosis || "";
                    console.log(`Current diagnosis: "${currentDiagnosis}"`);
                    console.log(`New diagnosis: "${updateData.diagnosis}"`);

                    // Only save history if the text has actually changed
                    if (updateData.diagnosis !== currentDiagnosis) {
                        console.log("Diagnosis has changed in clinical section, checking if history should be saved");

                        // Check if createDiagnosisHistory flag is set
                        if (updateData.createDiagnosisHistory) {
                            console.log("createDiagnosisHistory flag is set, saving diagnosis history");
                            try {
                                await saveDiagnosisHistoryEntry(
                                    patientId,
                                    updateData.diagnosis,
                                    updateData.advisedInvestigations
                                );
                                console.log("Successfully saved diagnosis history entry from clinical section");
                            } catch (historyError) {
                                console.error(`Error saving diagnosis history entry: ${historyError.message}`);
                                // Continue with the update even if history fails
                            }
                        } else {
                            console.log("createDiagnosisHistory flag not set, skipping history save");
                        }
                    } else {
                        console.log("Diagnosis unchanged, skipping history save");
                    }

                    // Update diagnosis field
                    updateExpression += ", diagnosis = :diagnosis";
                    expressionAttributeValues[":diagnosis"] = updateData.diagnosis;
                }

                if (updateData.reports !== undefined) {
                    updateExpression += ", reports = :reports";
                    expressionAttributeValues[":reports"] = updateData.reports;
                }

                // Handle advisedInvestigations with history tracking
                if (updateData.advisedInvestigations !== undefined) {
                    const currentInvestigations = currentPatient.advisedInvestigations || "";

                    // Check if advisedInvestigations has changed
                    if (updateData.advisedInvestigations !== currentInvestigations) {
                        console.log("Advised investigations have changed in clinical section");

                        // Save investigations history if they're not empty
                        if (updateData.advisedInvestigations && updateData.advisedInvestigations.trim() !== '') {
                            try {
                                await saveInvestigationsHistoryEntry(patientId, updateData.advisedInvestigations);
                                console.log("Successfully saved investigations history entry in clinical section");
                            } catch (invHistoryError) {
                                console.error(`Error saving investigations history entry in clinical section: ${invHistoryError.message}`);
                                // Continue with update even if history save fails
                            }
                        }
                    }

                    // Update advisedInvestigations field
                    updateExpression += ", advisedInvestigations = :advisedInvestigations";
                    expressionAttributeValues[":advisedInvestigations"] = updateData.advisedInvestigations;
                }

                // Handle clinical parameters with history tracking
                if (updateData.clinicalParameters) {
                    console.log("Updating clinical parameters:",
                        Object.keys(updateData.clinicalParameters).join(", "));

                    // Update the expression to set the new parameters
                    updateExpression += ", clinicalParameters = :clinicalParameters";
                    expressionAttributeValues[":clinicalParameters"] = updateData.clinicalParameters;

                    // Check for createParameterHistory flag
                    if (updateData.createParameterHistory) {
                        console.log("createParameterHistory flag is set, saving parameter history");

                        try {
                            // Save parameters to history before updating the current value
                            await saveClinicalParametersHistory(patientId, updateData.clinicalParameters);
                            console.log("Successfully saved clinical parameters history");
                        } catch (historyError) {
                            console.error(`Error saving clinical parameters history: ${historyError.message}`);
                            // Continue with the update even if history fails
                        }
                    } else {
                        console.log("No createParameterHistory flag, skipping history save");
                    }
                }

                // Mark clinical section as saved
                savedSections.clinical = true;
                break;

            case 'prescription':
                console.log("Updating prescription information");

                // Handle medications update
                if (updateData.medications) {
                    // Process medications data with updated structure
                    const processedMedications = processMedications(updateData.medications);

                    updateExpression += ", medications = :medications";
                    expressionAttributeValues[":medications"] = processedMedications;

                    // Generate updated prescription text using per-medication instructions
                    const generatedPrescription = generatePrescriptionText(processedMedications);

                    updateExpression += ", generatedPrescription = :generatedPrescription";
                    expressionAttributeValues[":generatedPrescription"] = generatedPrescription;
                }

                // Mark prescription section as saved
                savedSections.prescription = true;
                break;

            case 'diagnosis':
                console.log("Updating diagnosis information");
                console.log(`Received diagnosis value: "${updateData.diagnosis || 'not provided'}"`);
                console.log(`Current patient diagnosis value: "${currentPatient.diagnosis || 'not set'}"`);

                // Check if diagnosis has changed and save to history if needed
                if (updateData.diagnosis !== undefined) {
                    // Check if the diagnosis has changed
                    const currentDiagnosis = currentPatient.diagnosis || "";

                    // Log the values for debugging
                    console.log(`Current diagnosis: "${currentDiagnosis}"`);
                    console.log(`New diagnosis: "${updateData.diagnosis}"`);

                    // Only save history if the text has actually changed
                    if (updateData.diagnosis !== currentDiagnosis) {
                        console.log("Diagnosis has changed, checking if history should be saved");

                        // Check if createDiagnosisHistory flag is set
                        if (updateData.createDiagnosisHistory) {
                            console.log("createDiagnosisHistory flag is set, saving diagnosis history");
                            try {
                                await saveDiagnosisHistoryEntry(
                                    patientId,
                                    updateData.diagnosis,
                                    updateData.advisedInvestigations || currentPatient.advisedInvestigations || ""
                                );
                                console.log("Successfully saved diagnosis history entry");

                                // If a timestamp was provided, use it instead of the current time
                                if (updateData.diagnosisTimestamp) {
                                    console.log(`Using provided timestamp for diagnosis history: ${updateData.diagnosisTimestamp}`);
                                }
                            } catch (historyError) {
                                console.error(`Error saving diagnosis history entry: ${historyError.message}`);
                                // Continue with the update even if history fails
                            }
                        } else {
                            console.log("createDiagnosisHistory flag not set, skipping history save");
                        }
                    } else {
                        console.log("Diagnosis hasn't changed, skipping history save");
                    }

                    // Add diagnosis field update
                    updateExpression += ", diagnosis = :diagnosis";
                    expressionAttributeValues[":diagnosis"] = updateData.diagnosis;
                    console.log(`✅ Adding diagnosis to update expression: "${updateData.diagnosis}"`);
                } else {
                    console.log("⚠️ updateData.diagnosis is undefined, not updating diagnosis field");
                }

                // Handle advisedInvestigations with history tracking
                if (updateData.advisedInvestigations !== undefined) {
                    const currentInvestigations = currentPatient.advisedInvestigations || "";

                    // Check if advisedInvestigations has changed
                    if (updateData.advisedInvestigations !== currentInvestigations) {
                        console.log("Advised investigations have changed in diagnosis section");

                        // Save investigations history if they're not empty
                        if (updateData.advisedInvestigations && updateData.advisedInvestigations.trim() !== '') {
                            try {
                                await saveInvestigationsHistoryEntry(patientId, updateData.advisedInvestigations);
                                console.log("Successfully saved investigations history entry from diagnosis section");
                            } catch (invHistoryError) {
                                console.error(`Error saving investigations history entry from diagnosis section: ${invHistoryError.message}`);
                                // Continue with update even if history save fails
                            }
                        }
                    }

                    // Update advisedInvestigations field
                    updateExpression += ", advisedInvestigations = :advisedInvestigations";
                    expressionAttributeValues[":advisedInvestigations"] = updateData.advisedInvestigations;
                }

                // Mark diagnosis section as saved
                savedSections.diagnosis = true;
                break;

            default:
                // If no specific section is provided, this is a full update
                console.log("Processing full patient update");

                // In a full update, mark all sections as saved
                savedSections.basic = true;
                savedSections.clinical = true;
                savedSections.prescription = true;
                savedSections.diagnosis = true;

                // Merge all data, preferring the update data over existing data
                const mergedData = {
                    ...currentPatient,
                    ...updateData,
                    patientId: currentPatient.patientId, // Ensure ID doesn't change
                    updatedAt: new Date().toISOString(),
                    savedSections: savedSections // Add saved sections tracking
                };

                // Handle medicalHistory field with history tracking
                if (updateData.medicalHistory !== undefined) {
                    // Check if the medical history has changed
                    const currentMedicalHistory = currentPatient.medicalHistory || "";

                    if (updateData.medicalHistory !== currentMedicalHistory) {
                        console.log("Medical history has changed in full update, checking if history should be saved");

                        // Check for "Add History" pattern or pending history
                        const hasTimestampPattern = updateData.medicalHistory.includes("--- New Entry (") ||
                            updateData.medicalHistory.includes("--- Entry (");

                        const isPendingHistory = updateData.pendingHistoryIncluded ||
                            (updateData.medicalHistory &&
                                updateData.medicalHistory.includes("pending_history"));

                        // Create history if flag is set or Add History pattern detected or pending history
                        const shouldCreateHistoryEntry = updateData.createMedicalHistoryEntry ||
                            hasTimestampPattern ||
                            isPendingHistory;

                        if (shouldCreateHistoryEntry) {
                            try {
                                await saveMedicalHistoryEntry(patientId, updateData.medicalHistory);
                                console.log("Successfully saved medical history entry in full update");
                            } catch (historyError) {
                                console.error(`Error saving medical history entry in full update: ${historyError.message}`);
                                // Continue with the update even if history fails
                            }
                        } else {
                            console.log("No Add History pattern, pending history, or flag set, skipping history save in full update");
                        }
                    } else {
                        console.log("Medical history unchanged in full update, skipping history save");
                    }

                    mergedData.medicalHistory = updateData.medicalHistory;
                }

                // Handle diagnosis field with history tracking
                if (updateData.diagnosis !== undefined) {
                    // Check if the diagnosis has changed
                    const currentDiagnosis = currentPatient.diagnosis || "";

                    if (updateData.diagnosis !== currentDiagnosis) {
                        console.log("Diagnosis has changed in full update, checking if history should be saved");

                        // Check if createDiagnosisHistory flag is set
                        if (updateData.createDiagnosisHistory) {
                            console.log("createDiagnosisHistory flag is set, saving diagnosis history in full update");
                            try {
                                await saveDiagnosisHistoryEntry(
                                    patientId,
                                    updateData.diagnosis,
                                    updateData.advisedInvestigations || currentPatient.advisedInvestigations || ""
                                );
                                console.log("Successfully saved diagnosis history entry in full update");
                            } catch (historyError) {
                                console.error(`Error saving diagnosis history entry in full update: ${historyError.message}`);
                                // Continue with the update even if history fails
                            }
                        } else {
                            console.log("createDiagnosisHistory flag not set, skipping history save in full update");
                        }
                    }

                    mergedData.diagnosis = updateData.diagnosis;
                }

                // Handle advisedInvestigations field with history tracking
                if (updateData.advisedInvestigations !== undefined) {
                    const currentInvestigations = currentPatient.advisedInvestigations || "";

                    if (updateData.advisedInvestigations !== currentInvestigations) {
                        console.log("Advised investigations have changed in full update");

                        // Save investigations history if they're not empty
                        if (updateData.advisedInvestigations && updateData.advisedInvestigations.trim() !== '') {
                            try {
                                await saveInvestigationsHistoryEntry(patientId, updateData.advisedInvestigations);
                                console.log("Successfully saved investigations history entry in full update");
                            } catch (invHistoryError) {
                                console.error(`Error saving investigations history entry in full update: ${invHistoryError.message}`);
                                // Continue with update even if history save fails
                            }
                        }
                    }

                    mergedData.advisedInvestigations = updateData.advisedInvestigations;
                }

                // Handle clinical parameters in full update
                if (updateData.clinicalParameters) {
                    mergedData.clinicalParameters = updateData.clinicalParameters;

                    // Check if we should save history for full update
                    if (updateData.createParameterHistory) {
                        console.log("Saving clinical parameters history in full update");
                        try {
                            await saveClinicalParametersHistory(patientId, updateData.clinicalParameters);
                        } catch (historyError) {
                            console.error(`Error saving clinical parameters history in full update: ${historyError.message}`);
                            // Continue with the update even if history fails
                        }
                    }
                }

                // If medications are updated, regenerate the prescription text with per-medication instructions
                if (updateData.medications) {
                    mergedData.generatedPrescription = generatePrescriptionText(mergedData.medications);
                }

                // For a full update, replace the entire item
                await dynamodb.send(new PutCommand({
                    TableName: PATIENTS_TABLE,
                    Item: mergedData
                }));

                console.log("Full patient update successful");
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
                        message: 'Patient updated successfully',
                        patientId: patientId,
                        savedSections: savedSections, // Include saved sections in response
                        pendingHistoryCleared: updateData.pendingHistoryIncluded || false // Indicate if pending history was handled
                    })
                };
        }

        // Add savedSections to the update
        updateExpression += ", savedSections = :savedSections";
        expressionAttributeValues[":savedSections"] = savedSections;

        // We need this for the UpdateCommand since 'name' is a reserved word in DynamoDB
        const expressionAttributeNames = updateSection === 'basic' && updateData.name ?
            { "#name": "name" } : undefined;

        // If we're here, we're doing a partial update
        console.log(`Executing partial update with expression: ${updateExpression}`);
        console.log(`Update values: ${JSON.stringify(expressionAttributeValues)}`);

        // Execute the update
        await dynamodb.send(new UpdateCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: expressionAttributeNames
        }));

        console.log("Patient update successful");

        // If this was a diagnosis update, clear any cached diagnosis history
        if (updateSection === 'diagnosis' && updateData.createDiagnosisHistory) {
            console.log("Clearing cached diagnosis history after update");

            // Return special message to client to clear cache
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
                    message: `Diagnosis information updated successfully`,
                    patientId: patientId,
                    savedSections: savedSections,
                    clearDiagnosisHistoryCache: true, // Signal to clear diagnosis history cache
                    clearInvestigationsHistoryCache: true // Signal to clear investigations history cache too
                })
            };
        }

        // For clinical section with pending history, indicate that it was handled
        if (updateSection === 'clinical') {
            console.log("Updating clinical information");

            // Handle medical history with enhanced "Add History" detection
            // and support for pending history from AsyncStorage
            if (updateData.medicalHistory !== undefined) {
                // Check if the medical history has changed
                const currentMedicalHistory = currentPatient.medicalHistory || "";

                if (updateData.medicalHistory !== currentMedicalHistory) {
                    console.log("Medical history has changed, checking if history should be saved");

                    // Check for timestamp pattern that indicates "Add History" was used
                    const hasTimestampPattern = updateData.medicalHistory.includes("--- New Entry (") ||
                        updateData.medicalHistory.includes("--- Entry (");

                    // Check if this is from pending history in AsyncStorage
                    const isPendingHistory = updateData.pendingHistoryIncluded ||
                        (updateData.medicalHistory &&
                            updateData.medicalHistory.includes("pending_history")) ||
                        (updateData.medicalHistory &&
                            hasTimestampPattern &&
                            !currentMedicalHistory.includes(updateData.medicalHistory.split("---")[1] || ""));

                    // Use explicit flag or detect Add History pattern or pending history
                    const shouldCreateHistoryEntry = updateData.createMedicalHistoryEntry ||
                        hasTimestampPattern ||
                        isPendingHistory ||
                        updateData.forceHistoryUpdate;

                    if (shouldCreateHistoryEntry) {
                        try {
                            console.log("Creating medical history entry due to Add History update, explicit flag, pending history, or forceHistoryUpdate");
                            await saveMedicalHistoryEntry(patientId, updateData.medicalHistory);
                            console.log("Successfully saved medical history entry");
                        } catch (historyError) {
                            console.error(`Error saving medical history entry: ${historyError.message}`);
                            // Continue with the update even if history fails
                        }
                    } else {
                        console.log("No Add History pattern, pending history, or flags set, skipping history save");
                    }
                } else if (updateData.forceHistoryUpdate) {
                    // Even if the history text appears unchanged, if forceHistoryUpdate is set, save it anyway
                    console.log("forceHistoryUpdate flag set - saving medical history even though text appears unchanged");
                    try {
                        await saveMedicalHistoryEntry(patientId, updateData.medicalHistory);
                        console.log("Successfully forced medical history entry save");
                    } catch (historyError) {
                        console.error(`Error forcing medical history entry save: ${historyError.message}`);
                    }
                } else {
                    console.log("Medical history unchanged, skipping history save");
                }

                // Update the expression to set the new medical history
                updateExpression += ", medicalHistory = :medicalHistory";
                expressionAttributeValues[":medicalHistory"] = updateData.medicalHistory;

                // Add special flag for force updating
                if (updateData.forceHistoryUpdate) {
                    console.log("Adding forceHistoryUpdate flag to the update expression");
                    updateExpression += ", forceHistoryUpdate = :forceHistoryUpdate";
                    expressionAttributeValues[":forceHistoryUpdate"] = true;
                }
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: `Patient ${updateSection ? updateSection + ' information' : 'data'} updated successfully`,
                patientId: patientId,
                savedSections: savedSections // Include saved sections in response
            })
        };
    } catch (error) {
        console.error('Error in updatePatientData:', error);
        return formatErrorResponse(error.message || "Failed to update patient");
    }
}

// Modified processPatientData function to always create permanent records
async function processPatientData(patientData) {
    try {
        console.log("Starting processPatientData with permanent records");

        // Validate essential patient data
        if (!patientData.name || !patientData.age) {
            return formatErrorResponse("Missing required patient information (name or age)");
        }

        // Validate mobile number if provided strictly 
        if (patientData.mobile) {
            // Remove any non-numeric characters just in case
            const cleanMobile = patientData.mobile.replace(/[^0-9]/g, '');
            if (cleanMobile.length !== 10) {
                return formatErrorResponse("Invalid mobile number. Must be exactly 10 digits.");
            }
        }

        // Generate a unique ID for the patient using crypto.randomUUID()
        const patientId = randomUUID();
        console.log(`Generated patient ID: ${patientId}`);

        // Check for pending history in AsyncStorage before creating the patient
        if (patientData.pendingHistoryIncluded && patientData.pendingHistoryText) {
            console.log("Processing pending history from AsyncStorage");

            // Format the pending history with a timestamp
            const timestamp = new Date().toLocaleString();
            let updatedHistory = "";

            if (patientData.medicalHistory && patientData.medicalHistory.trim()) {
                updatedHistory = `--- New Entry (${timestamp}) ---\n${patientData.pendingHistoryText}\n\n${patientData.medicalHistory}`;
            } else {
                updatedHistory = `--- Entry (${timestamp}) ---\n${patientData.pendingHistoryText}`;
            }

            // Replace the medical history with the formatted version that includes the pending history
            patientData.medicalHistory = updatedHistory;
            console.log("Pending history integrated into medicalHistory field");

            // Set flag to create medical history entry
            patientData.createMedicalHistoryEntry = true;
        }

        // Process medications data - validate and normalize the updated structure
        if (patientData.medications && Array.isArray(patientData.medications)) {
            console.log(`Processing ${patientData.medications.length} medications with updated structure`);
            patientData.medications = processMedications(patientData.medications);
        }

        // Extract report files for S3 upload with enhanced validation
        const reportFiles = patientData.reportFiles || [];
        console.log(`Found ${reportFiles.length} report files to process`);

        // Use centralized function for strictly verified S3 uploads
        // Returns: processedFiles (pure DB objects, no URLs), failedUploads, filesForResponse (with Signed URLs)
        const { processedFiles, failedUploads, filesForResponse } = await processReportFiles(reportFiles, patientId);

        // Count confirmed uploads
        const filesUploadedToS3 = processedFiles.filter(f => f.uploadedToS3).length;

        console.log(`📋 Completed processing ${reportFiles.length} files. Verified Success: ${processedFiles.length}, Failures: ${failedUploads.length}`);

        // Generate a prescription text string if medications exist
        let generatedPrescription = "";
        if (patientData.medications && patientData.medications.length > 0) {
            console.log("Generating prescription text from medication data with per-medication instructions");

            generatedPrescription = generatePrescriptionText(patientData.medications);

            console.log("Generated prescription text with per-medication instructions");
        }

        // Initialize savedSections
        const savedSections = {
            basic: true,
            clinical: true,
            prescription: true,
            diagnosis: true
        };

        // Add clinical parameters if provided, or initialize with defaults
        const clinicalParameters = patientData.clinicalParameters || {
            date: new Date().toISOString().split('T')[0],
            inr: "",
            hb: "",
            wbc: "",
            platelet: "",
            bilirubin: "",
            sgot: "",
            sgpt: "",
            alt: "",
            tprAlb: "",
            ureaCreat: "",
            sodium: "",
            fastingHBA1C: "",
            pp: "",
            tsh: "",
            ft4: "",
            others: ""
        };

        // Prepare the item to store in DynamoDB
        const patientItem = {
            patientId: patientId,
            name: patientData.name,
            age: parseInt(patientData.age) || 0,
            sex: patientData.sex,
            mobile: patientData.mobile || "",
            address: patientData.address || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            // Add the medicalHistory field
            medicalHistory: patientData.medicalHistory || "",
            // Keep diagnosis field
            diagnosis: patientData.diagnosis || "",
            // Add advisedInvestigations field
            advisedInvestigations: patientData.advisedInvestigations || "",
            reports: patientData.reports || "",
            firstVisit: {
                date: new Date().toISOString().split('T')[0],
                diagnosis: patientData.diagnosis || "",
                reports: patientData.reports || "",
                advisedInvestigations: patientData.advisedInvestigations || ""
            },
            medications: patientData.medications || [],
            reportFiles: processedFiles, // Store processed file metadata
            generatedPrescription: generatedPrescription || null, // Add generated prescription
            savedSections: savedSections, // Add saved sections tracking for completeness
            clinicalParameters: clinicalParameters, // Add clinical parameters
            // Add flag if pending history was included
            pendingHistoryIncluded: patientData.pendingHistoryIncluded || false
        };

        // Save to DynamoDB
        console.log("Saving patient data to DynamoDB");
        await dynamodb.send(new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: patientItem
        }));
        console.log("DynamoDB save successful");

        // Save initial clinical parameters history if provided
        if (patientData.clinicalParameters && patientData.createParameterHistory) {
            try {
                await saveClinicalParametersHistory(patientId, patientData.clinicalParameters);
                console.log("Saved initial clinical parameters history");
            } catch (historyError) {
                console.error(`Error saving initial clinical parameters history: ${historyError.message}`);
                // Continue even if history save fails
            }
        }

        // Save initial medical history entry if provided
        if (patientData.medicalHistory &&
            (patientData.createMedicalHistoryEntry || patientData.pendingHistoryIncluded)) {
            try {
                await saveMedicalHistoryEntry(patientId, patientData.medicalHistory);
                console.log("Saved initial medical history entry");
            } catch (historyError) {
                console.error(`Error saving initial medical history entry: ${historyError.message}`);
                // Continue even if history save fails
            }
        }

        // Save initial diagnosis history entry if provided
        if (patientData.diagnosis && patientData.createDiagnosisHistory) {
            try {
                await saveDiagnosisHistoryEntry(
                    patientId,
                    patientData.diagnosis,
                    patientData.advisedInvestigations
                );
                console.log("Saved initial diagnosis history entry");
            } catch (historyError) {
                console.error(`Error saving initial diagnosis history entry: ${historyError.message}`);
                // Continue even if history save fails
            }
        }

        // Save initial investigations history entry if provided
        if (patientData.advisedInvestigations && patientData.advisedInvestigations.trim() !== '') {
            try {
                await saveInvestigationsHistoryEntry(patientId, patientData.advisedInvestigations);
                console.log("Saved initial investigations history entry");
            } catch (historyError) {
                console.error(`Error saving initial investigations history entry: ${historyError.message}`);
                // Continue even if history save fails
            }
        }

        // Return success response with detailed file processing information
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // For CORS support
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                success: true,
                message: 'Patient added successfully',
                patientId: patientId,
                savedSections: savedSections, // Include saved sections in response
                pendingHistoryCleared: patientData.pendingHistoryIncluded || false, // Indicate if pending history was included
                fileDetails: (processedFiles.length > 0 || failedUploads.length > 0) ? {
                    filesProcessed: processedFiles.length,
                    filesUploadedToS3: filesUploadedToS3,
                    failedUploads: failedUploads, // Include failures in response
                    fileUrls: filesForResponse.map(file => ({
                        name: file.name,
                        url: file.url, // Signed URL (or remote URL) for immediate display
                        category: file.category || 'uncategorized',
                        uploadStatus: file.uploadedToS3 ? 'success' : 'pending'
                    }))
                } : null,
                generatedPrescription: generatedPrescription || null
            })
        };
    } catch (error) {
        console.error('Error in processPatientData:', error);
        return formatErrorResponse(error.message || "Failed to add patient");
    }
}

// Strict S3 Upload + Verification Function
// Returns: { processedFiles, failedUploads, filesForResponse }
async function processReportFiles(reportFiles, patientId) {
    console.log(`🔄 Processing ${reportFiles.length} report files`);
    const processedFiles = []; // For DynamoDB (clean, no URLs)
    const filesForResponse = []; // For API Response (with Signed URLs)
    const failedUploads = [];

    // Ensure reportFiles is always an array
    if (!Array.isArray(reportFiles)) {
        console.warn("reportFiles is not an array, converting to empty array");
        reportFiles = [];
    }

    // Deduplicate files using Map
    const uniqueFileMap = new Map();
    reportFiles.forEach(file => {
        const fileKey = getFileUniqueKey(file);
        if (!uniqueFileMap.has(fileKey)) uniqueFileMap.set(fileKey, file);
    });
    const deduplicatedFiles = Array.from(uniqueFileMap.values());

    for (let i = 0; i < deduplicatedFiles.length; i++) {
        const reportFile = deduplicatedFiles[i];

        try {
            // Case 1: Existing Remote URL (already processed)
            if (reportFile.uri && (reportFile.uri.startsWith('http://') || reportFile.uri.startsWith('https://'))) {
                const existingFile = {
                    name: reportFile.name || `file_${Date.now()}`,
                    type: reportFile.type || 'application/octet-stream',
                    // Keep existing URLs for backward compatibility
                    url: reportFile.uri,
                    uri: reportFile.uri,
                    existing: true,
                    category: reportFile.category || 'uncategorized',
                    processedAt: new Date().toISOString()
                };

                processedFiles.push(existingFile);
                filesForResponse.push(existingFile);
                continue;
            }

            // Case 2: New Upload
            if (!reportFile.base64Data) {
                console.warn(`⚠️ Skipping file ${reportFile.name}: Missing base64Data`);
                failedUploads.push(reportFile.name || "Unknown File");
                continue;
            }

            // Prepare Metadata
            const timestamp = Date.now();
            const randomSuffix = Math.floor(Math.random() * 10000);
            const sanitizedName = (reportFile.name || "file").replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileKey = `${patientId}/${timestamp}-${randomSuffix}-${sanitizedName}`;

            // Clean Base64
            let cleanBase64 = reportFile.base64Data;
            if (cleanBase64.startsWith('data:')) {
                cleanBase64 = cleanBase64.split(',')[1];
            }
            const fileBuffer = Buffer.from(cleanBase64, 'base64');
            const fileType = reportFile.type || 'application/octet-stream';

            // 1. Upload (NO ACL)
            const uploadParams = {
                Bucket: REPORTS_BUCKET,
                Key: fileKey,
                Body: fileBuffer,
                ContentType: fileType,
                // NO ACL: "public-read" REMOVED
                Metadata: {
                    'patient-id': patientId,
                    'original-name': sanitizedName,
                    'category': reportFile.category || 'uncategorized'
                }
            };

            console.log(`📤 Uploading ${fileKey} to S3...`);
            const uploadResult = await s3.send(new PutObjectCommand(uploadParams));

            // 2. VERIFY (HeadObject) - CRITICAL STEP
            console.log(`🔍 Verifying upload for ${fileKey}...`);
            await s3.send(new HeadObjectCommand({ Bucket: REPORTS_BUCKET, Key: fileKey }));
            console.log(`✅ Verification Successful: ${fileKey}`);

            // 3. Prepare DB Object (Clean, No URL)
            const dbEntry = {
                key: fileKey, // ONLY KEY
                name: reportFile.name || sanitizedName,
                type: fileType,
                size: fileBuffer.length,
                category: reportFile.category || 'uncategorized',
                uploadedToS3: true,
                eTag: uploadResult.ETag,
                uploadSuccessTime: new Date().toISOString(),
                patientId: patientId
                // storedLocally: REMOVED
                // s3UploadFailed: REMOVED
            };

            // 4. Prepare Response Object (Enriched with Signed URL)
            const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
                Bucket: REPORTS_BUCKET,
                Key: fileKey
            }), { expiresIn: 3600 });

            const responseEntry = {
                ...dbEntry,
                url: signedUrl // Present only in Response, NOT in DB
            };

            processedFiles.push(dbEntry);
            filesForResponse.push(responseEntry);

        } catch (error) {
            console.error(`❌ Upload Failed for ${reportFile.name}: ${error.message}`);
            // failedUploads tracked, NOT added to processedFiles
            failedUploads.push(reportFile.name || "Unknown File");
        }
    }

    return { processedFiles, failedUploads, filesForResponse };
}

// Update file status in DynamoDB after successful retry with enhanced logging
async function updateFileStatusInDB(patientId, fileKey, s3Url, eTag) {
    try {
        console.log(`🔄 Updating file status in DynamoDB for ${fileKey}`);

        // Get the current patient record
        const patientData = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientData.Item) {
            console.error(`❌ Patient ${patientId} not found in DynamoDB`);
            return;
        }

        // Find and update the file info
        const reportFiles = patientData.Item.reportFiles || [];
        const fileIndex = reportFiles.findIndex(file => file.key === fileKey);

        if (fileIndex >= 0) {
            console.log(`📋 Found file at index ${fileIndex}`);

            // Update the file status to reflect successful upload
            reportFiles[fileIndex].url = s3Url;
            reportFiles[fileIndex].eTag = eTag;
            reportFiles[fileIndex].storedLocally = false;
            reportFiles[fileIndex].uploadedToS3 = true;
            reportFiles[fileIndex].s3UploadFailed = false;
            reportFiles[fileIndex].uploadSuccessTime = new Date().toISOString();

            // Remove any stored base64 data to save space
            delete reportFiles[fileIndex].truncatedBase64;
            delete reportFiles[fileIndex].base64Data;

            // Add retry success flags
            reportFiles[fileIndex].retrySuccess = true;
            reportFiles[fileIndex].retryTimestamp = new Date().toISOString();

            // Update the patient record
            await dynamodb.send(new UpdateCommand({
                TableName: PATIENTS_TABLE,
                Key: { patientId },
                UpdateExpression: "SET reportFiles = :files, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                    ":files": reportFiles,
                    ":updatedAt": new Date().toISOString()
                }
            }));

            console.log(`✅ Successfully updated file status in DynamoDB for ${fileKey}`);
        } else {
            console.warn(`⚠️ File ${fileKey} not found in patient record`);
        }
    } catch (error) {
        console.error(`❌ Error updating DynamoDB: ${error.message}`);
        console.error(error.stack);
    }
}

// Update file status as permanently failed with more detailed error info
async function updateFileFailureStatus(patientId, fileKey, errorMessage) {
    try {
        console.log(`🔄 Updating file failure status in DynamoDB for ${fileKey}`);

        // Get the current patient record
        const patientData = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!patientData.Item) {
            console.error(`❌ Patient ${patientId} not found in DynamoDB`);
            return;
        }

        // Find and update the file info
        const reportFiles = patientData.Item.reportFiles || [];
        const fileIndex = reportFiles.findIndex(file => file.key === fileKey);

        if (fileIndex >= 0) {
            console.log(`📋 Found file at index ${fileIndex}`);

            // Update the file status to reflect permanent failure
            reportFiles[fileIndex].storedLocally = true;
            reportFiles[fileIndex].uploadedToS3 = false;
            reportFiles[fileIndex].s3UploadFailed = true;
            reportFiles[fileIndex].permanentFailure = true;
            reportFiles[fileIndex].finalErrorMessage = errorMessage;
            reportFiles[fileIndex].finalErrorTime = new Date().toISOString();
            reportFiles[fileIndex].retryAttempts = 5; // We tried the maximum number of retries

            // Update the patient record
            await dynamodb.send(new UpdateCommand({
                TableName: PATIENTS_TABLE,
                Key: { patientId },
                UpdateExpression: "SET reportFiles = :files, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                    ":files": reportFiles,
                    ":updatedAt": new Date().toISOString()
                }
            }));

            console.log(`✅ Successfully updated file failure status in DynamoDB for ${fileKey}`);
        } else {
            console.warn(`⚠️ File ${fileKey} not found in patient record`);
        }
    } catch (error) {
        console.error(`❌ Error updating DynamoDB with failure status: ${error.message}`);
        console.error(error.stack);
    }
}

// Updated helper function to generate prescription text from medications without unit field
// and with better formatting for readability
function generatePrescriptionText(medications) {
    if (!medications || medications.length === 0) {
        return "";
    }

    console.log("Generating prescription text from medication data with per-medication instructions");

    const prescriptionText = medications.map((med, index) => {
        let prescriptionLine = `${index + 1}. ${med.name || "Medication"}`;

        // Process timing values
        if (med.timingValues) {
            try {
                const timingValuesObj = typeof med.timingValues === 'string'
                    ? JSON.parse(med.timingValues)
                    : med.timingValues;

                const timingInstructions = Object.entries(timingValuesObj)
                    .map(([time, value]) => {
                        const timingLabel = time.charAt(0).toUpperCase() + time.slice(1);
                        return `${timingLabel}: ${value}`;
                    })
                    .join(", ");

                if (timingInstructions) {
                    prescriptionLine += ` - ${timingInstructions}`;
                }
            } catch (e) {
                console.warn(`Error parsing timing values for med ${index + 1}: ${e.message}`);
            }
        }

        // Add duration if available
        if (med.duration) {
            prescriptionLine += ` for ${med.duration}`;
        }

        // Add medication-specific special instructions if present
        if (med.specialInstructions && med.specialInstructions.trim() !== "") {
            prescriptionLine += `\n   Special Instructions: ${med.specialInstructions}`;
        }

        return prescriptionLine;
    }).join("\n\n"); // Add extra newline between medications for better readability

    return prescriptionText;
}

// Helper function to format error responses consistently
function formatErrorResponse(errorMessage) {
    return {
        statusCode: 400,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        },
        body: JSON.stringify({
            success: false,
            message: 'Failed to process request',
            error: errorMessage
        })
    };
}

// ============================================
// MISSING ACTION HANDLERS RESTORED
// ============================================

async function getAllPatients() {
    try {
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE
        }));

        // Sort by lastVisitDate (most recent first)
        const patients = (result.Items || []).sort((a, b) => {
            return new Date(b.lastVisitDate || b.createdAt || 0) - new Date(a.lastVisitDate || a.createdAt || 0);
        });

        // Use standard response format expected by handler
        return {
            success: true,
            patients: patients,
            count: patients.length
        };
    } catch (error) {
        console.error("getAllPatients error:", error);
        return formatErrorResponse(`Failed to get patients: ${error.message}`);
    }
}

async function searchPatients(requestData) {
    const { searchTerm } = requestData;

    if (!searchTerm || searchTerm.trim() === "") {
        return getAllPatients();
    }

    try {
        const searchLower = searchTerm.toLowerCase().trim();

        // Scan with filter
        const result = await dynamodb.send(new ScanCommand({
            TableName: PATIENTS_TABLE,
            FilterExpression: "contains(nameSearchable, :search) OR contains(mobileSearchable, :search)",
            ExpressionAttributeValues: {
                ":search": searchLower
            }
        }));

        return {
            success: true,
            patients: result.Items || [],
            count: result.Items?.length || 0
        };
    } catch (error) {
        console.error("searchPatients error:", error);
        return formatErrorResponse(`Failed to search patients: ${error.message}`);
    }
}

async function deletePatient(requestData) {
    const { patientId } = requestData;

    if (!patientId) {
        return formatErrorResponse("Missing patientId");
    }

    try {
        await dynamodb.send(new DeleteCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        return { success: true, message: "Patient deleted successfully", patientId };
    } catch (error) {
        console.error("deletePatient error:", error);
        return formatErrorResponse(`Failed to delete patient: ${error.message}`);
    }
}

async function deletePatientFile(requestData) {
    const { patientId, fileUrl, fileName } = requestData;

    if (!patientId || (!fileUrl && !fileName)) {
        return formatErrorResponse("Missing patientId or file identifier");
    }

    try {
        // Get current patient data
        const getResult = await dynamodb.send(new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
        }));

        if (!getResult.Item) {
            return formatErrorResponse("Patient not found");
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

        return {
            success: true,
            message: "File deleted successfully",
            remainingFiles: reportFiles.length
        };
    } catch (error) {
        console.error("deletePatientFile error:", error);
        return formatErrorResponse(`Failed to delete file: ${error.message}`);
    }
}