import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { API_ENDPOINTS } from "../../../Config";
import { logStateUpdate } from "../../../Utils/Logger";
import { isFileAlreadyUploaded } from "../../../Utils/FileUtils";
import { uploadFilesWithPresignedUrls, FileToUpload } from "../../../Utils/UploadService";
import { DraftService, DraftPatient } from "../Services/DraftService";
import { unmarshallDynamoDBObject } from "../../../Utils/DynamoDbUtils";

// ============================================
// FILE DEDUPLICATION HELPER
// ============================================

/**
 * Deduplicate files by s3Key or name+size
 * Prevents duplicate files in the reportFiles array
 */
const deduplicateFiles = (files: any[]): any[] => {
    if (!files || files.length === 0) return [];

    const seen = new Map<string, boolean>();
    const deduplicated: any[] = [];

    for (const file of files) {
        // Primary: deduplicate by s3Key (most reliable)
        const s3Key = file.s3Key || file.key;
        if (s3Key) {
            if (seen.has(s3Key)) {
                console.warn(`⚠️ Duplicate file by s3Key removed: ${file.name || file.fileName}`);
                continue;
            }
            seen.set(s3Key, true);
            deduplicated.push(file);
            continue;
        }

        // Fallback: deduplicate by name+size (for new files)
        const fallbackKey = `${file.name || file.fileName}_${file.size || 0}`;
        if (seen.has(fallbackKey)) {
            console.warn(`⚠️ Duplicate file by name+size removed: ${file.name || file.fileName}`);
            continue;
        }
        seen.set(fallbackKey, true);
        deduplicated.push(file);
    }

    if (deduplicated.length !== files.length) {
        console.log(`📁 Deduplication: ${files.length} files → ${deduplicated.length} unique files`);
    }

    return deduplicated;
};

interface UsePatientFormProps {
    patient?: any;
    initialTab?: string;
    prefillMode?: boolean;
    hideBasicTab?: boolean;
}

export const usePatientForm = ({
    patient,
    initialTab,
    prefillMode,
    hideBasicTab,
}: UsePatientFormProps) => {
    // Form state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeSection, setActiveSection] = useState<string>(initialTab || "basic");
    const [isNormalFlow] = useState(!prefillMode && !initialTab);
    const [savedSections, setSavedSections] = useState({
        basic: false,
        clinical: false,
        prescription: false,
        diagnosis: false,
    });
    const [permanentPatientId, setPermanentPatientId] = useState<string | null>(null);
    const [isSavingHistory, setIsSavingHistory] = useState(false);

    // Draft ID ref to persist across renders
    const currentDraftId = useRef<string | null>(null);
    // Ref to track if initial load is complete to prevent overwriting draft with empty state
    const isLoaded = useRef(false);
    // Ref to track if component is still mounted (prevents async operations after unmount)
    const isMounted = useRef(true);

    // Extract patientId from patient object or use permanentPatientId
    const patientId = patient?.patientId || permanentPatientId || null;

    const [patientData, setPatientData] = useState({
        // ── Persistent Patient Context (pre-fill from patient object) ──
        name: prefillMode && patient ? patient.name || "" : "",
        age: prefillMode && patient ? patient.age?.toString() || "" : "",
        sex: prefillMode && patient ? patient.sex || "Male" : "Male",
        mobile: prefillMode && patient ? patient.mobile || "" : "",
        address: prefillMode && patient ? patient.address || "" : "",
        medicalHistory: prefillMode && patient ? patient.medicalHistory || "" : "",
        existingData: prefillMode && patient ? patient.existingData || "" : "",

        // ── Visit-Specific Fields (Hydrate from patient if editing) ──
        diagnosis: prefillMode && patient ? patient.diagnosis || "" : "",
        prescription: prefillMode && patient ? patient.prescription || "" : "",
        treatment: prefillMode && patient ? patient.treatment || "" : "",
        reports: prefillMode && patient ? patient.reports || "" : "",
        advisedInvestigations: prefillMode && patient ? patient.advisedInvestigations || "" : "",

        newHistoryEntry: "", // Phase 3: Unified Clinical History Draft Field
    });

    // Clinical parameters state
    const [clinicalParameters, setClinicalParameters] = useState(() => {
        if (prefillMode && patient && patient.clinicalParameters) {
            const params = { ...patient.clinicalParameters };
            if (typeof params.date === 'string') {
                params.date = new Date(params.date);
            }
            if (!params.date || isNaN(params.date.getTime())) {
                params.date = new Date();
            }
            return {
                date: params.date,
                inr: params.inr || "", hb: params.hb || "", wbc: params.wbc || "", platelet: params.platelet || "", bilirubin: params.bilirubin || "",
                sgot: params.sgot || "", sgpt: params.sgpt || "", alt: params.alt || "", tprAlb: params.tprAlb || "", ureaCreat: params.ureaCreat || "",
                sodium: params.sodium || "", fastingHBA1C: params.fastingHBA1C || "", pp: params.pp || "", tsh: params.tsh || "", ft4: params.ft4 || "", others: params.others || "",
            };
        }
        return {
            date: new Date(),
            inr: "", hb: "", wbc: "", platelet: "", bilirubin: "",
            sgot: "", sgpt: "", alt: "", tprAlb: "", ureaCreat: "",
            sodium: "", fastingHBA1C: "", pp: "", tsh: "", ft4: "", others: "",
        };
    });

    // Medications state — Hydrate from patient if editing
    const [medications, setMedications] = useState<any[]>(() => {
        return prefillMode && patient && patient.medications ? patient.medications : [];
    });
    const [newPrescriptionIndices, setNewPrescriptionIndices] = useState<number[]>([]);
    const [expandedMedications, setExpandedMedications] = useState<number[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

    // Prescription generation state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tempDate, setTempDate] = useState(new Date());

    // Report data state — Hydrate from patient if editing
    const [reportData, setReportData] = useState(() => {
        if (prefillMode && patient && patient.reportData) {
            return {
                testName: patient.reportData.testName || "",
                testDate: patient.reportData.testDate || "",
                testResults: patient.reportData.testResults || "",
                interpretation: patient.reportData.interpretation || "",
                recommendations: patient.reportData.recommendations || "",
            };
        }
        return {
            testName: "", testDate: "", testResults: "", interpretation: "", recommendations: "",
        };
    });

    // Report files state - ENHANCED to preserve S3 metadata and deduplicate
    const [reportFiles, setReportFiles] = useState<Array<{ uri: string; name: string; type: string; category?: string; base64Data?: string; s3Key?: string; uploadedToS3?: boolean; uploadDate?: string; fileId?: string }>>(() => {
        if (prefillMode && patient && patient.reportFiles && patient.reportFiles.length > 0) {
            console.log(`📁 Initializing ${patient.reportFiles.length} reportFiles from patient data`);
            const mappedFiles = patient.reportFiles.map((file: any) => {
                // Detect and log files with incomplete S3 metadata
                const hasS3Metadata = !!(file.s3Key || file.key);
                const hasUrl = !!(file.url || file.signedUrl);

                if (hasUrl && !hasS3Metadata) {
                    console.warn(`⚠️ File missing S3 metadata: ${file.name || file.fileName}`);
                }

                return {
                    uri: file.url || file.signedUrl || "",
                    name: file.name || file.fileName || "",
                    type: file.type || file.fileType || "application/pdf",
                    category: file.category || "",
                    // CRITICAL: Preserve S3 metadata for deduplication
                    s3Key: file.s3Key || file.key || null,
                    uploadedToS3: file.uploadedToS3 || !!file.s3Key || !!file.key,
                    uploadDate: file.uploadDate || file.uploadedAt || null,
                    // Add unique ID for tracking
                    fileId: file.s3Key || file.key || `pending_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                };
            });

            // Deduplicate to prevent duplicate files in state
            return deduplicateFiles(mappedFiles);
        }
        return [];
    });

    const [errors, setErrors] = useState({ name: "", age: "", mobile: "" });

    // --- DRAFT SYSTEM LOGIC START ---

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isMounted.current = false;
            console.log("[usePatientForm] Component unmounting, stopping async operations");
        };
    }, []);

    // Initialize Data (Draft -> Server Full Fetch -> Sparse Props)
    useEffect(() => {
        const initializeData = async () => {
            let idToUse = patient?.patientId || permanentPatientId;

            if (idToUse) {
                currentDraftId.current = idToUse;
                // Try to load existing draft
                const draft = await DraftService.getDraft(idToUse);
                if (draft) {
                    console.log(`[usePatientForm] Loaded draft for ${idToUse}`);
                    // Merge draft data into state
                    if (draft.patientData) setPatientData(prev => ({ ...prev, ...draft.patientData }));
                    if (draft.clinicalParameters) {
                        try {
                            const params = { ...draft.clinicalParameters };
                            if (typeof params.date === 'string') {
                                params.date = new Date(params.date);
                            }
                            if (!params.date || isNaN(params.date.getTime())) {
                                console.warn("Invalid date in draft, using current date");
                                params.date = new Date();
                            }
                            setClinicalParameters(params);
                        } catch (e) {
                            console.error("Error restoring clinicalParameters date from draft", e);
                            setClinicalParameters({ ...draft.clinicalParameters, date: new Date() });
                        }
                    }
                    if (draft.medications) setMedications(draft.medications);
                    if (draft.reportData) setReportData(draft.reportData);
                    if (draft.reportFiles) setReportFiles(draft.reportFiles);
                    if (draft.savedSections) setSavedSections(draft.savedSections);
                } else if (prefillMode && patientId) {
                    // No draft found. Fetch the full patient record from the server to fill sparse props.
                    console.log(`[usePatientForm] No draft found. Fetching full patient record for ${patientId}...`);
                    try {
                        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache" },
                            body: JSON.stringify({ action: "getPatient", patientId: patientId }),
                        });
                        const result = await response.json();
                        const data = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

                        if (data.success && data.patient) {
                            console.log("[usePatientForm] Successfully fetched full patient record.");
                            const sp = data.patient;
                            
                            // Merge fetched data into state
                            setPatientData(prev => ({
                                ...prev,
                                medicalHistory: sp.medicalHistory || prev.medicalHistory,
                                diagnosis: sp.diagnosis || prev.diagnosis,
                                prescription: sp.prescription || prev.prescription,
                                treatment: sp.treatment || prev.treatment,
                                reports: sp.reports || prev.reports,
                                advisedInvestigations: sp.advisedInvestigations || prev.advisedInvestigations,
                                existingData: sp.existingData || prev.existingData,
                            }));

                            // Hydrate clinical parameters
                            if (sp.clinicalParameters) {
                                let cParams = sp.clinicalParameters.M 
                                    ? unmarshallDynamoDBObject(sp.clinicalParameters) 
                                    : sp.clinicalParameters;
                                
                                if (typeof cParams.date === "string") cParams.date = new Date(cParams.date);
                                if (!cParams.date || isNaN(cParams.date.getTime())) cParams.date = new Date();
                                setClinicalParameters(cParams);
                            }

                            // Hydrate medications
                            if (sp.medications && Array.isArray(sp.medications)) {
                                setMedications(sp.medications);
                            }

                            // Hydrate report files
                            if (sp.reportFiles && Array.isArray(sp.reportFiles)) {
                                const mappedFiles = sp.reportFiles.map((file: any) => ({
                                    uri: file.url || file.signedUrl || "",
                                    name: file.name || file.fileName || "",
                                    type: file.type || file.fileType || "application/pdf",
                                    category: file.category || "",
                                    s3Key: file.s3Key || file.key || null,
                                    uploadedToS3: file.uploadedToS3 || !!file.s3Key || !!file.key,
                                    uploadDate: file.uploadDate || file.uploadedAt || null,
                                    fileId: file.s3Key || file.key || `pending_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                                }));
                                setReportFiles(deduplicateFiles(mappedFiles));
                            }
                        } else {
                            console.warn("[usePatientForm] API returned success=false or no patient data", data);
                        }
                    } catch (error) {
                        console.error("[usePatientForm] Error fetching patient record:", error);
                    }
                } else {
                    console.log(`[usePatientForm] No draft found for ${idToUse}`);
                }
            } else {
                // BUG FIX: Do NOT generate temp IDs. Wait for Basic Tab submission (Phase 1).
                console.log("[usePatientForm] New patient - waiting for Basic Tab submission to initialize draft");
            }
            isLoaded.current = true;
        };

        if (!isLoaded.current) {
            initializeData();
        }
    }, [patient?.patientId, permanentPatientId, prefillMode, patientId]);


    // Auto-Save Effect
    useEffect(() => {
        // Don't save if not loaded yet
        if (!isLoaded.current) return;

        // Don't save if no ID
        if (!currentDraftId.current) return;

        const saveData = async () => {
            // Don't execute if component is unmounted
            if (!isMounted.current) {
                console.log("[AutoSave] Skipping save - component unmounted");
                return;
            }

            // BUG FIX: Draft Invariant - Only save if we have a REAL patient ID
            const effectiveId = permanentPatientId || patient?.patientId;
            if (!effectiveId) {
                console.log("[AutoSave] Skipped - Basic not committed (No Patient ID)");
                return;
            }

            // Sync currentDraftId to the real ID
            currentDraftId.current = effectiveId;

            try {
                const draftPayload: Partial<DraftPatient> = {
                    patientData,
                    clinicalParameters,
                    medications,
                    reportData,
                    reportFiles,
                    savedSections,
                };

                const success = await DraftService.saveDraft(currentDraftId.current!, draftPayload);

                if (!success) {
                    console.error("[AutoSave] Failed to save draft - DraftService returned false");
                    // Silent failure - logged but doesn't interrupt user
                } else {
                    // Successful save
                    console.log(`[AutoSave] ✓ Draft saved at ${new Date().toLocaleTimeString()}`);
                }
            } catch (error) {
                console.error("[AutoSave] Error saving draft:", error);
                // Log but don't alert user to avoid spamming with every auto-save failure
            }
        };

        const timeoutId = setTimeout(saveData, 1000); // 1s debounce
        return () => clearTimeout(timeoutId);

    }, [
        patientData,
        clinicalParameters,
        medications,
        reportData,
        reportFiles,
        savedSections,
        permanentPatientId
    ]);

    // --- DRAFT SYSTEM LOGIC END ---

    // Effects
    useEffect(() => {
        console.log(`🔑 permanentPatientId changed to: ${permanentPatientId || "not set"}`);

        // If we get a real ID, switch our draft tracking to it
        if (permanentPatientId && currentDraftId.current && currentDraftId.current !== permanentPatientId) {
            const oldDraftId = currentDraftId.current;

            console.log(`[Draft Cleanup] ID transition: ${oldDraftId} → ${permanentPatientId}`);

            // Delete old temporary draft before switching to prevent orphaned drafts
            DraftService.deleteDraft(oldDraftId)
                .then(() => console.log(`✅ Deleted old draft: ${oldDraftId}`))
                .catch(err => console.error(`❌ Failed to delete old draft:`, err));

            // Switch to new permanent ID
            currentDraftId.current = permanentPatientId;

            // The auto-save effect will automatically save to the new ID
            // because permanentPatientId is in its dependency array
        }
    }, [permanentPatientId]);

    // NOTE: clinicalParameters intentionally NOT pre-filled from the patient's last visit.
    // They should start empty for each new visit and are restored from Draft if mid-visit.

    // Reset parameters on patient change
    useEffect(() => {
        if (patient?.patientId) {
            console.log(`🔄 Patient changed to ${patient.name} (ID: ${patient.patientId})`);

            // If loading a new patient prop, likely we are mounting a new screen or resetting.
            // If we are resetting in-place:

            currentDraftId.current = patient.patientId;
            // Since patient changed, we might want to reload draft? 
            // setLoaded(false)? 
            // For now assuming component unmounts/remounts for different patients in navigation stack.

            setClinicalParameters({
                date: new Date(),
                inr: "", hb: "", wbc: "", platelet: "", bilirubin: "",
                sgot: "", sgpt: "", alt: "", tprAlb: "", ureaCreat: "",
                sodium: "", fastingHBA1C: "", pp: "", tsh: "", ft4: "", others: "",
            });
            // NOTE: We intentionally do NOT restore patient.clinicalParameters here.
            // Clinical parameters belong to a specific visit and should start empty.
            // If the doctor was mid-visit, the Draft will restore them.
        }
    }, [patient?.patientId]);

    // Load clinical parameters from permanent ID
    useEffect(() => {
        const loadPatientClinicalData = async () => {
            if (permanentPatientId && !prefillMode) {
                try {
                    // PRECEDENCE CHECK: If a valid draft exists, SKIP API load
                    const existingDraft = await DraftService.getDraft(permanentPatientId);
                    if (existingDraft) {
                        console.log(`🛡️ Draft precedence: Draft found for ${permanentPatientId}, skipping API hydration to protect local changes.`);
                        return;
                    }

                    const apiUrl = API_ENDPOINTS.PATIENT_PROCESSOR;
                    const response = await fetch(apiUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache" },
                        body: JSON.stringify({ action: "getPatient", patientId: permanentPatientId }),
                    });
                    const result = await response.json();
                    const data = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

                    if (data.success && data.patient && data.patient.clinicalParameters) {
                        const apiParams = { ...data.patient.clinicalParameters };
                        if (typeof apiParams.date === "string") apiParams.date = new Date(apiParams.date);

                        setClinicalParameters(apiParams);
                        console.log("✅ Loaded clinical parameters from API");
                    }
                } catch (error) {
                    console.error("❌ Error loading clinical parameters:", error);
                }
            }
        };
        loadPatientClinicalData();
    }, [permanentPatientId, prefillMode]);

    // Update Field
    const updateField = (field: string, value: any) => {
        logStateUpdate(`Updating ${field}`, typeof value === 'string' ? value.substring(0, 30) + "..." : value);
        setPatientData((prev) => ({ ...prev, [field]: value }));
        if (errors[field as keyof typeof errors]) {
            setErrors((prev) => ({ ...prev, [field]: "" }));
        }
    };

    const updateReportField = (field: string, value: any) => {
        setReportData((prev: any) => ({ ...prev, [field]: value }));
    };

    // Validation
    const validateForm = () => {
        let isValid = true;
        const newErrors = { name: "", age: "", mobile: "" };

        if (!patientData.name.trim()) { newErrors.name = "Name is required"; isValid = false; }
        if (!patientData.age.trim()) { newErrors.age = "Age is required"; isValid = false; }
        else if (isNaN(Number(patientData.age)) || Number(patientData.age) <= 0 || Number(patientData.age) > 130) { newErrors.age = "Please enter a valid age (1-130)"; isValid = false; }

        if (!patientData.mobile.trim()) { newErrors.mobile = "Mobile number is required"; isValid = false; }
        else if (!/^[6-9]\d{9}$/.test(patientData.mobile.trim())) { newErrors.mobile = "Enter valid 10-digit mobile (starts with 6-9)"; isValid = false; }

        setErrors(newErrors);
        return isValid;
    };

    // File Handling
    const pickDocument = async (file?: any) => {
        try {
            if (file) {
                setReportFiles((prev) => [...prev, file]);
                return;
            }
            const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true });
            if (result.canceled === false && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const newFile = {
                    uri: asset.uri,
                    name: asset.name,
                    type: asset.mimeType || "application/octet-stream",
                    size: asset.size, // Size is optional/number
                    category: "General",
                };
                // Fix for strict type checking on size if needed? 
                // Assuming component uses simplified type or check logic later.
                setReportFiles((prev: any[]) => [...prev, newFile]);
            }
        } catch (error) {
            console.error("❌ Error picking document:", error);
            Alert.alert("Error", "Problem selecting document.");
        }
    };

    const removeReportFile = (index: number) => {
        Alert.alert("Remove File", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Remove", style: "destructive", onPress: () => {
                    setReportFiles((prev) => {
                        const updated = [...prev];
                        updated.splice(index, 1);
                        return updated;
                    });
                }
            }
        ]);
    };

    const uploadFilesToS3 = async (files: any[], patientId: string) => {
        console.log(`🚀 Starting S3 upload for ${files.length} files with patientId: ${patientId}`);

        // Count existing files for logging
        const existingUploadedFiles = files.filter(file => isFileAlreadyUploaded(file));
        console.log(`⏭️ Skipping ${existingUploadedFiles.length} already-uploaded files`);

        // Filter out already uploaded files and files without URIs
        const filesToUpload = files.filter(file =>
            !isFileAlreadyUploaded(file) &&
            !file.base64Data &&
            file.uri &&
            !file.uri.startsWith("http://") &&
            !file.uri.startsWith("https://")
        );

        console.log(`📤 Uploading ${filesToUpload.length} new files`);

        if (filesToUpload.length === 0) {
            console.log("✅ No files need uploading - all files already on S3");
            return files; // Return original files if no upload needed
        }

        // Convert to FileToUpload format for UploadService
        const uploadFiles: FileToUpload[] = filesToUpload.map(file => ({
            uri: file.uri,
            name: file.name,
            type: file.type,
            category: file.category || "uncategorized",
            size: file.size
        }));

        try {
            // Upload files using presigned URLs
            const { uploaded, failed } = await uploadFilesWithPresignedUrls(uploadFiles, patientId);

            if (failed.length > 0) {
                console.warn(`⚠️ Failed to upload ${failed.length} files:`, failed);
                Alert.alert("Upload Warning", `Failed to upload ${failed.length} file(s). They will be skipped.`);
            }

            // Merge uploaded files back with original files
            const processedFiles = files.map(originalFile => {
                // Check if this file was uploaded
                const uploadedFile = uploaded.find(uf =>
                    uf.name === originalFile.name &&
                    uf.category === (originalFile.category || "uncategorized")
                );

                if (uploadedFile) {
                    // Return the uploaded file metadata (S3 key only)
                    return {
                        key: uploadedFile.key,
                        s3Key: uploadedFile.key, // Add s3Key for backend compatibility
                        name: uploadedFile.name,
                        type: uploadedFile.type,
                        category: uploadedFile.category,
                        size: uploadedFile.size,
                        uploadedToS3: true,
                        uploadDate: uploadedFile.uploadDate
                    };
                } else if (isFileAlreadyUploaded(originalFile)) {
                    // Keep existing uploaded files as-is, ensure s3Key is preserved
                    return {
                        ...originalFile,
                        s3Key: originalFile.s3Key || originalFile.key, // Ensure s3Key exists
                        uploadedToS3: true
                    };
                } else if (originalFile.base64Data) {
                    // Legacy base64 file - keep as-is
                    return originalFile;
                } else {
                    // This file failed to upload, skip it
                    return null;
                }
            }).filter(file => file !== null); // Remove failed uploads

            console.log(`✅ Successfully processed ${processedFiles.length} files (${existingUploadedFiles.length} skipped, ${uploaded.length} uploaded)`);
            return processedFiles;

        } catch (error: any) {
            console.error("❌ Error uploading files to S3:", error);
            Alert.alert("Upload Error", `Failed to upload files: ${error.message}`);
            // Return original files on error to avoid data loss
            return files;
        }
    };

    // History helpers removed (Phase 3 cleanup) - newHistoryEntry in patientData handles this now.
    // saveNewHistoryEntryToStorage removed
    // includeNewHistoryEntry removed
    // checkAndIncludePendingHistory removed

    // Date Handler
    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setTempDate(selectedDate);
            setClinicalParameters(prev => ({ ...prev, date: selectedDate }));
            const formatted = selectedDate.toISOString().split("T")[0];
            updateReportField("testDate", formatted);
        }
    };

    // Immediate Patient Creation
    const createBasicPatient = async () => {
        try {
            console.log("🚀 Creating new patient from Basic Tab...");
            const payload = {
                action: "processPatientData",
                name: patientData.name,
                age: patientData.age,
                sex: patientData.sex,
                mobile: patientData.mobile,
                address: patientData.address,
                patientId: null
            };

            const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const body = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

            if (body.success && body.patientId) {
                console.log(`✅ Patient created immediately: ${body.patientId}`);

                // --- FIX: Explicit Draft Initialization (Minimal & Idempotent) ---
                // Ensure we don't overwrite if a draft somehow already exists (race condition safety)
                const existingDraft = await DraftService.getDraft(body.patientId);

                if (!existingDraft) {
                    console.log(`📝 Initializing minimal draft for ${body.patientId}`);
                    // Minimal payload: Only Basic data is guaranteed to be valid here.
                    const initialDraft: Partial<DraftPatient> = {
                        patientData: {
                            ...patientData,
                            patientId: body.patientId // Ensure ID is part of the draft data
                        },
                        // Intentionally OMITTING clinical/reports/etc to avoid freezing unstable state
                        lastUpdatedAt: Date.now(),
                        status: "DRAFT"
                    };

                    await DraftService.saveDraft(body.patientId, initialDraft);
                    currentDraftId.current = body.patientId; // Sync immediately
                } else {
                    console.log(`ℹ️ Draft already exists for ${body.patientId}, skipping initialization.`);
                    currentDraftId.current = body.patientId; // Still need to sync ref
                }
                // -----------------------------------------------------------------

                return { success: true, patientId: body.patientId };
            } else {
                throw new Error(body.error || "Failed to create patient");
            }
        } catch (error: any) {
            console.error("❌ Error in createBasicPatient:", error);
            return { success: false, error: error.message };
        }
    };


    return {
        isSubmitting, setIsSubmitting,
        activeSection, setActiveSection,
        isNormalFlow,
        savedSections, setSavedSections,
        permanentPatientId, setPermanentPatientId,
        patientId, // Export the derived patientId
        isSavingHistory, setIsSavingHistory,
        patientData, setPatientData,
        clinicalParameters, setClinicalParameters,
        medications, setMedications,
        newPrescriptionIndices, setNewPrescriptionIndices,
        expandedMedications, setExpandedMedications,
        expandedGroups, setExpandedGroups,
        showDatePicker, setShowDatePicker,
        tempDate, setTempDate,
        reportData, setReportData,
        reportFiles, setReportFiles,
        errors, setErrors,
        updateField,
        updateReportField,
        validateForm,
        pickDocument,
        removeReportFile,
        uploadFilesToS3,
        // legacy history functions removed from exports
        handleDateChange,
        currentDraftId, // Export the ref if needed
        createBasicPatient, // New export
    };
};
