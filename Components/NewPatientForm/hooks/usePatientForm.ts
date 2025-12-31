import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { API_ENDPOINTS } from "../../../Config";
import { logStateUpdate } from "../../../Utils/Logger";
import { fileToBase64, isFileAlreadyUploaded } from "../../../Utils/FileUtils";
import { DraftService, DraftPatient } from "../Services/DraftService";

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

    // Patient data state
    const [patientData, setPatientData] = useState({
        name: prefillMode && patient ? patient.name : "",
        age: prefillMode && patient ? patient.age.toString() : "",
        sex: prefillMode && patient ? patient.sex : "Male",
        mobile: prefillMode && patient ? patient.mobile : "",
        address: prefillMode && patient ? patient.address : "",
        medicalHistory: prefillMode && patient ? patient.medicalHistory || "" : "",
        diagnosis: prefillMode && patient ? patient.diagnosis || "" : "",
        prescription: prefillMode && patient ? patient.prescription : "",
        treatment: prefillMode && patient ? patient.treatment : "",
        reports: prefillMode && patient ? patient.reports : "",
        advisedInvestigations: prefillMode && patient ? patient.advisedInvestigations : "",
        existingData: prefillMode && patient ? patient.existingData || "" : "",
    });

    // Clinical parameters state
    const [clinicalParameters, setClinicalParameters] = useState({
        date: new Date(),
        inr: "", hb: "", wbc: "", platelet: "", bilirubin: "",
        sgot: "", sgpt: "", alt: "", tprAlb: "", ureaCreat: "",
        sodium: "", fastingHBA1C: "", pp: "", tsh: "", ft4: "", others: "",
    });

    // Medications state
    const [medications, setMedications] = useState(() => {
        if (prefillMode && patient && patient.medications && patient.medications.length > 0) {
            return patient.medications.map((med: any) => ({
                name: med.name || "",
                duration: med.duration || "",
                timing: med.timing || "",
                timingValues: med.timingValues || "{}",
                specialInstructions: med.specialInstructions || "",
                datePrescribed: med.datePrescribed || patient.updatedAt || patient.createdAt,
            }));
        }
        return [];
    });
    const [newPrescriptionIndices, setNewPrescriptionIndices] = useState<number[]>([]);
    const [expandedMedications, setExpandedMedications] = useState<number[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

    // Prescription generation state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tempDate, setTempDate] = useState(new Date());

    // Report data state
    const [reportData, setReportData] = useState(() => {
        if (prefillMode && patient && patient.reportData) {
            return { ...patient.reportData };
        }
        return {
            testName: "", testDate: "", testResults: "", interpretation: "", recommendations: "",
        };
    });

    // Report files state
    const [reportFiles, setReportFiles] = useState<Array<{ uri: string; name: string; type: string; category?: string; base64Data?: string }>>(() => {
        if (prefillMode && patient && patient.reportFiles && patient.reportFiles.length > 0) {
            return patient.reportFiles.map((file: any) => ({
                uri: file.url || "",
                name: file.name || "",
                type: file.type || "application/pdf",
                category: file.category || "",
            }));
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

    // Initialize Draft ID and Load Draft
    useEffect(() => {
        const initializeDraft = async () => {
            // Determine the ID to use for the draft
            let idToUse = patient?.patientId || permanentPatientId;

            // If we have an existing patient ID, we try to load THAT draft.
            // If new patient (no ID), we check if we generated a temp ID already.

            if (idToUse) {
                currentDraftId.current = idToUse;
                // Try to load existing draft
                const draft = await DraftService.getDraft(idToUse);
                if (draft) {
                    console.log(`[usePatientForm] Loaded draft for ${idToUse}`);
                    // Merge draft data into state
                    if (draft.patientData) setPatientData(prev => ({ ...prev, ...draft.patientData }));
                    if (draft.clinicalParameters) {
                        // Restore Date object with improved error handling
                        try {
                            const params = { ...draft.clinicalParameters };
                            if (typeof params.date === 'string') {
                                params.date = new Date(params.date);
                            }
                            // Fallback to current date if invalid
                            if (!params.date || isNaN(params.date.getTime())) {
                                console.warn("Invalid date in draft, using current date");
                                params.date = new Date();
                            }
                            setClinicalParameters(params);
                        } catch (e) {
                            console.error("Error restoring clinicalParameters date from draft", e);
                            // Set default parameters with current date on error
                            setClinicalParameters({ ...draft.clinicalParameters, date: new Date() });
                        }
                    }
                    if (draft.medications) setMedications(draft.medications);
                    if (draft.reportData) setReportData(draft.reportData);
                    if (draft.reportFiles) setReportFiles(draft.reportFiles);
                    if (draft.savedSections) setSavedSections(draft.savedSections);
                } else {
                    console.log(`[usePatientForm] No draft found for ${idToUse}`);
                }
            } else {
                if (!currentDraftId.current) {
                    currentDraftId.current = DraftService.generateDraftId();
                    console.log(`[usePatientForm] Generated new temp draft ID: ${currentDraftId.current}`);
                }
            }
            isLoaded.current = true;
        };

        if (!isLoaded.current) {
            initializeDraft();
        }
    }, [patient?.patientId, permanentPatientId]);


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

    useEffect(() => {
        if (prefillMode && patient && patient.clinicalParameters) {
            console.log("Loading clinical parameters from existing patient data");
            const patientParams = { ...patient.clinicalParameters };
            if (typeof patientParams.date === "string") {
                patientParams.date = new Date(patientParams.date);
            } else if (!patientParams.date) {
                patientParams.date = new Date();
            }
            setClinicalParameters(patientParams);
            setTempDate(patientParams.date);
            console.log("✅ Successfully loaded clinical parameters from patient record");
        }
    }, [prefillMode, patient]);

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

            if (patient.clinicalParameters) {
                try {
                    const patientParams = { ...patient.clinicalParameters };
                    if (typeof patientParams.date === "string") {
                        patientParams.date = new Date(patientParams.date);
                    } else if (!patientParams.date) {
                        patientParams.date = new Date();
                    }
                    setClinicalParameters(patientParams);
                    setTempDate(patientParams.date);
                } catch (error) {
                    console.error("❌ Error loading clinical parameters:", error);
                }
            }
        }
    }, [patient?.patientId]);

    // Load clinical parameters from permanent ID
    useEffect(() => {
        const loadPatientClinicalData = async () => {
            if (permanentPatientId && !prefillMode) {
                try {
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

                        // Only set if we didn't load a draft?
                        // Or merge? 
                        // draft wins if it exists. 
                        // If we are here, we might have loaded draft already. 
                        // If draft is newer, we shouldn't overwrite?
                        // But DraftService is local. API is remote.
                        // We will log for now, but let API overwrite IF it's late?
                        // Actually, this hook runs if permanentPatientId changes.
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
        else if (isNaN(Number(patientData.age)) || Number(patientData.age) <= 0) { newErrors.age = "Please enter a valid age"; isValid = false; }

        if (!patientData.mobile.trim()) { newErrors.mobile = "Mobile number is required"; isValid = false; }
        else if (!/^[0-9]{10}$/.test(patientData.mobile.trim())) { newErrors.mobile = "Please enter a valid 10-digit mobile number"; isValid = false; }

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

    const ensureFilesHaveBase64 = async (files: any[]) => {
        // ... (Logic from original file)
        // Simplified for brevity here, utilizing extracted fileToBase64
        const uniqueFileMap = new Map();
        files.forEach(file => {
            let key = file.uri || (file.name + "_" + file.category) || `unknown_${Math.random()}`;
            if (!uniqueFileMap.has(key)) uniqueFileMap.set(key, file);
        });
        const deduplicated = Array.from(uniqueFileMap.values());
        const processed = [];
        for (const file of deduplicated) {
            // Skip processing if file is already uploaded, has base64, or HAS NO URI
            if (isFileAlreadyUploaded(file) || file.base64Data || !file.uri) {
                processed.push(file); continue;
            }
            try {
                const rawBase64 = await fileToBase64(file.uri);
                processed.push({ ...file, base64Data: `data:${file.type || "application/octet-stream"};base64,${rawBase64}` });
            } catch (e) {
                processed.push(file);
            }
        }
        return processed;
    };

    // History Helpers
    const saveNewHistoryEntryToStorage = async (pId: string, text: string) => {
        if (!pId || !text?.trim()) return false;
        try {
            await AsyncStorage.setItem(`pending_history_${pId}`, text);
            return true;
        } catch (e) { return false; }
    };

    const includeNewHistoryEntry = async (pId: string, text: string) => {
        if (!pId || !text?.trim()) return false;
        try {
            const timestamp = new Date().toLocaleString();
            const current = patientData.medicalHistory || "";
            let updated = "";
            if (current.trim()) updated = `--- New Entry (${timestamp}) ---\n${text}\n\n${current}`;
            else updated = `--- Entry (${timestamp}) ---\n${text}`;

            setPatientData(prev => ({ ...prev, medicalHistory: updated }));
            setIsSavingHistory(true);
            return true;
        } catch (e) { return false; }
    };

    const checkAndIncludePendingHistory = async (pId: string) => {
        if (!pId) return false;
        try {
            const key = `pending_history_${pId}`;
            const pending = await AsyncStorage.getItem(key);
            if (pending && pending.trim()) {
                const timestamp = new Date().toLocaleString();
                let updated = "";
                if (patientData.medicalHistory && patientData.medicalHistory.trim()) {
                    if (!patientData.medicalHistory.includes(pending.substring(0, 20))) {
                        updated = `--- New Entry (${timestamp}) ---\n${pending}\n\n${patientData.medicalHistory}`;
                    } else {
                        updated = patientData.medicalHistory;
                    }
                } else {
                    updated = `--- Entry (${timestamp}) ---\n${pending}`;
                }
                setPatientData(prev => ({ ...prev, medicalHistory: updated }));
                await AsyncStorage.removeItem(key);
                return true;
            }
        } catch (e) { }
        return false;
    };

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
        ensureFilesHaveBase64,
        saveNewHistoryEntryToStorage,
        includeNewHistoryEntry,
        checkAndIncludePendingHistory,
        handleDateChange,
        currentDraftId, // Export the ref if needed
    };
};
