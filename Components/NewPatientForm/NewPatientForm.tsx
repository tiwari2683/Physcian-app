import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import BasicTab from "./basic";
import ClinicalTab from "./clinical";
import DiagnosisTab from "./diagnosis";
import PrescriptionTab from "./prescription";
import * as DocumentPicker from "expo-document-picker";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";

interface NewPatientFormProps {
  navigation: any;
  route: any;
}

// Debug function to log state changes
const logStateUpdate = (label, data) => {
  if (__DEV__) {
    console.log(
      `📊 ${label}:`,
      typeof data === "object" ? JSON.stringify(data) : data
    );
  }
};

const NewPatientForm: React.FC<NewPatientFormProps> = ({
  navigation,
  route,
}) => {
  // Extract parameters from route
  const { patient, initialTab, prefillMode, hideBasicTab } = route.params || {};

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(
    initialTab || "basic"
  );

  // Add state variable to track flow type and saved sections
  const [isNormalFlow] = useState(!prefillMode && !initialTab);
  const [savedSections, setSavedSections] = useState({
    basic: false,
    clinical: false,
    prescription: false,
    diagnosis: false,
  });

  // Add a reference to the ScrollView for scrolling to top
  const scrollViewRef = useRef(null);

  // Add state to track permanent patientId when saving sections
  const [permanentPatientId, setPermanentPatientId] = useState<string | null>(
    null
  );

  // Add state to track if we're currently saving new history
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const clinicalTabRef = useRef(null);

  // Add a ref for DiagnosisTab to access its methods
  const diagnosisTabRef = useRef(null);

  // Add useEffect to track permanentPatientId changes
  useEffect(() => {
    console.log(
      `🔑 permanentPatientId changed to: ${permanentPatientId || "not set"}`
    );
  }, [permanentPatientId]);

  // Helper function to check if a section is saved
  const isSectionSaved = (section) => {
    return savedSections[section];
  };

  // Helper function to check if navigation should be blocked
  // This allows free navigation between tabs after basic is saved
  const shouldBlockNavigation = () => {
    // Never block navigation if basic tab is hidden
    if (hideBasicTab) return false;

    return (
      isNormalFlow &&
      !isSectionSaved(activeSection) &&
      (!isSectionSaved("basic") || activeSection === "basic")
    );
  };

  // Patient data state with potential pre-filled values - MODIFIED to separate medicalHistory and diagnosis
  const [patientData, setPatientData] = useState({
    name: prefillMode && patient ? patient.name : "",
    age: prefillMode && patient ? patient.age.toString() : "",
    sex: prefillMode && patient ? patient.sex : "Male",
    mobile: prefillMode && patient ? patient.mobile : "",
    address: prefillMode && patient ? patient.address : "",

    // Medical history field for complaints and symptoms
    medicalHistory: prefillMode && patient ? patient.medicalHistory || "" : "",

    // Separate diagnosis field - initialize from patient.diagnosis if available
    diagnosis: prefillMode && patient ? patient.diagnosis || "" : "",

    // Keep the existing fields even if we're not showing them directly
    prescription: prefillMode && patient ? patient.prescription : "",
    treatment: prefillMode && patient ? patient.treatment : "",
    reports: prefillMode && patient ? patient.reports : "",
    advisedInvestigations:
      prefillMode && patient ? patient.advisedInvestigations : "",
    existingData: prefillMode && patient ? patient.existingData || "" : "",
  });

  // Add the new state variable for clinical parameters
  const [clinicalParameters, setClinicalParameters] = useState({
    date: new Date(),
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
    others: "",
  });

  // Track which medications are new prescriptions
  const [newPrescriptionIndices, setNewPrescriptionIndices] = useState<
    number[]
  >([]);

  // Initialize medications from patient data if available, now with per-medication specialInstructions
  const [medications, setMedications] = useState(() => {
    if (
      prefillMode &&
      patient &&
      patient.medications &&
      patient.medications.length > 0
    ) {
      return patient.medications.map((med) => ({
        name: med.name || "",
        duration: med.duration || "",
        timing: med.timing || "",
        timingValues: med.timingValues || "{}",
        specialInstructions: med.specialInstructions || "", // Add special instructions field
        datePrescribed:
          med.datePrescribed || patient.updatedAt || patient.createdAt,
      }));
    }
    // Return an empty array for new patients instead of a default medication
    return [];
  });

  // State to track expanded medication cards
  const [expandedMedications, setExpandedMedications] = useState<number[]>([]);

  // State to track expanded medication groups
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // State for prescription generation
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Add this useEffect to initialize clinicalParameters when opening an existing patient
  useEffect(() => {
    // Initialize clinical parameters from patient data if available
    if (prefillMode && patient && patient.clinicalParameters) {
      console.log("Loading clinical parameters from existing patient data");

      // Create a copy of the patient's clinical parameters
      const patientParams = { ...patient.clinicalParameters };

      // Ensure date is a Date object
      if (typeof patientParams.date === "string") {
        patientParams.date = new Date(patientParams.date);
      } else if (!patientParams.date) {
        patientParams.date = new Date();
      }

      // Update clinical parameters state
      setClinicalParameters(patientParams);

      // Also update tempDate for the date picker
      setTempDate(patientParams.date);

      console.log(
        "✅ Successfully loaded clinical parameters from patient record"
      );
    }
  }, [prefillMode, patient]);

  // Reset clinical parameters when patient changes
  useEffect(() => {
    // Check if patient has changed by looking at the ID
    if (patient?.patientId) {
      console.log(
        `🔄 NewPatientForm: Patient changed to ${patient.name} (ID: ${patient.patientId})`
      );

      // Reset clinical parameters to defaults first
      setClinicalParameters({
        date: new Date(),
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
        others: "",
      });

      console.log("🧹 NewPatientForm: Reset clinical parameters to defaults");

      // Then load this patient's parameters if available
      if (patient.clinicalParameters) {
        console.log(
          `📋 NewPatientForm: Loading clinical parameters for ${patient.name}`
        );

        try {
          // Create a copy of the patient's clinical parameters
          const patientParams = { ...patient.clinicalParameters };

          // Ensure date is a Date object
          if (typeof patientParams.date === "string") {
            patientParams.date = new Date(patientParams.date);
          } else if (!patientParams.date) {
            patientParams.date = new Date();
          }

          // Update clinical parameters state
          setClinicalParameters(patientParams);

          // Also update tempDate for the date picker
          setTempDate(patientParams.date);

          console.log(
            "✅ NewPatientForm: Successfully loaded clinical parameters"
          );
        } catch (error) {
          console.error(
            "❌ NewPatientForm: Error loading clinical parameters:",
            error
          );
        }
      }
    }
  }, [patient?.patientId]); // Only re-run if the patient ID changes

  // If the component is using permanentPatientId for patients,
  // add this useEffect to load clinical parameters when permanentPatientId changes
  useEffect(() => {
    // If we have a permanentPatientId, try to load the clinical parameters
    const loadPatientClinicalData = async () => {
      if (permanentPatientId && !prefillMode) {
        console.log(
          `🔄 Attempting to load clinical parameters for patient: ${permanentPatientId}`
        );

        try {
          // Try fetching from API directly
          const apiUrl =
            "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction";

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify({
              action: "getPatient",
              patientId: permanentPatientId,
            }),
          });

          const result = await response.json();

          // Parse nested response if needed
          const data = result.body
            ? typeof result.body === "string"
              ? JSON.parse(result.body)
              : result.body
            : result;

          if (data.success && data.patient && data.patient.clinicalParameters) {
            console.log("Found clinical parameters in API response");

            const apiParams = { ...data.patient.clinicalParameters };

            // Ensure date is a Date object
            if (typeof apiParams.date === "string") {
              apiParams.date = new Date(apiParams.date);
            }

            setClinicalParameters(apiParams);
            console.log("✅ Loaded clinical parameters from API");
          }
        } catch (error) {
          console.error("❌ Error loading clinical parameters:", error);
        }
      }
    };

    loadPatientClinicalData();
  }, [permanentPatientId]);

  // Effect to set initial expanded/collapsed state for medications
  useEffect(() => {
    if (initialTab === "prescription" && !prefillMode) {
      // If adding a new patient and going directly to prescription tab
      // We don't need to expand any medications since we now start with an empty array
      setExpandedMedications([]);
    } else if (prefillMode && initialTab === "prescription") {
      // If coming from "Prescribe" button, start with all compressed
      setExpandedMedications([]);

      // If any medication doesn't have a name, expand it to prompt the user to select one
      const incompleteIndices = medications.reduce((acc, med, index) => {
        if (!med.name) acc.push(index);
        return acc;
      }, []);

      if (incompleteIndices.length > 0) {
        // Expand only the first incomplete medication
        setExpandedMedications([incompleteIndices[0]]);
      }
    }
  }, [initialTab, prefillMode, medications.length]);

  // useFocusEffect to set active tab when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (initialTab && activeSection !== initialTab) {
        setActiveSection(initialTab);
      }
    }, [initialTab])
  );

  // Function to check if a file has already been uploaded to S3
  const isFileAlreadyUploaded = (file) => {
    if (!file.uri) return false;

    return (
      file.uri.includes("s3.amazonaws.com") ||
      file.uri.includes("amazonaws.com") ||
      file.uri.startsWith("https://")
    );
  };

  // Function to pick document from device storage or handle file from child components
  const pickDocument = async (file?: any) => {
    try {
      // If file is provided, use it directly (called from child component)
      if (file) {
        console.log("📄 Adding provided file:", file);
        setReportFiles((prevFiles) => [...prevFiles, file]);
        console.log(`✅ File added: ${file.name || "unnamed file"}`);
        return;
      }

      // Otherwise, pick a document (internal call)
      console.log("📄 Picking document...");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });

      console.log("📄 Document picker result:", result);

      if (result.type === "success") {
        // Add the picked document to reportFiles
        const newFile = {
          uri: result.uri,
          name: result.name,
          type: result.mimeType || "application/octet-stream",
          size: result.size,
          category: "General", // Default category
        };

        setReportFiles((prevFiles) => [...prevFiles, newFile]);
        console.log(`✅ Document added: ${result.name}`);
      } else {
        console.log("❌ Document picking cancelled");
      }
    } catch (error) {
      console.error("❌ Error picking document:", error);
      Alert.alert(
        "Error",
        "There was a problem selecting the document. Please try again."
      );
    }
  };

  // Function to remove a report file from the array by index
  const removeReportFile = (index) => {
    console.log(`🗑️ Removing file at index ${index}`);

    // Ask for confirmation before removing
    Alert.alert("Remove File", "Are you sure you want to remove this file?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setReportFiles((prevFiles) => {
            const updatedFiles = [...prevFiles];
            updatedFiles.splice(index, 1);
            console.log(
              `✅ File removed. ${updatedFiles.length} files remaining.`
            );
            return updatedFiles;
          });
        },
      },
    ]);
  };

  // Function to handle date selection from calendar
  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);

    if (selectedDate) {
      setTempDate(selectedDate);
      setClinicalParameters((prev) => ({ ...prev, date: selectedDate })); // Update the clinical parameters state
      const formattedDate = selectedDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
      updateReportField("testDate", formattedDate);
    }
  };

  // Report data state - initialize from patient if available
  const [reportData, setReportData] = useState(() => {
    if (prefillMode && patient && patient.reportData) {
      return { ...patient.reportData };
    }
    return {
      testName: "",
      testDate: "",
      testResults: "",
      interpretation: "",
      recommendations: "",
    };
  });

  // Set up initial files from patient if available
  const [reportFiles, setReportFiles] = useState<
    Array<{ uri: string; name: string; type: string; category?: string }>
  >(() => {
    if (
      prefillMode &&
      patient &&
      patient.reportFiles &&
      patient.reportFiles.length > 0
    ) {
      // Convert reportFiles from patient to the format expected by the form
      return patient.reportFiles.map((file) => ({
        uri: file.url || "",
        name: file.name || "",
        type: file.type || "application/pdf",
        category: file.category || "", // Include category if it exists
      }));
    }
    return [];
  });

  // Error state - updated to include mobile
  const [errors, setErrors] = useState({ name: "", age: "", mobile: "" });

  // Function to save new history entry to AsyncStorage for later retrieval
  const saveNewHistoryEntryToStorage = async (patientId, newHistoryText) => {
    if (!patientId || !newHistoryText || newHistoryText.trim() === "") {
      console.log("No valid patient ID or history text to save");
      return false;
    }

    try {
      console.log(
        `Saving new history entry to AsyncStorage for patient: ${patientId}`
      );
      console.log(
        `History text (first 30 chars): ${newHistoryText.substring(0, 30)}...`
      );

      const key = `pending_history_${patientId}`;
      await AsyncStorage.setItem(key, newHistoryText);
      console.log(`✅ Saved new history entry to AsyncStorage key: ${key}`);
      return true;
    } catch (error) {
      console.error(
        "❌ Error saving new history entry to AsyncStorage:",
        error
      );
      return false;
    }
  };

  // Function to verify field values before submission - with enhanced logging
  const verifyFieldsBeforeSubmit = (section) => {
    switch (section) {
      case "basic":
        console.log("🔍 DETAILED BASIC FIELDS:");
        console.log(
          `   Name: "${patientData.name}" (length: ${patientData.name?.length})`
        );
        console.log(
          `   Age: "${patientData.age}" (length: ${patientData.age?.length})`
        );
        console.log(`   Sex: "${patientData.sex}"`);
        console.log(
          `   Mobile: "${patientData.mobile}" (length: ${patientData.mobile?.length})`
        );
        console.log(
          `   Address: "${patientData.address}" (length: ${patientData.address?.length})`
        );
        logStateUpdate("Basic Fields", {
          name: patientData.name,
          age: patientData.age,
          sex: patientData.sex,
          mobile: patientData.mobile,
          address: patientData.address,
        });
        break;
      case "clinical":
        logStateUpdate("Clinical Fields", {
          medicalHistory: patientData.medicalHistory?.substring(0, 50) + "...", // Use the medicalHistory field
          diagnosis: patientData.diagnosis?.substring(0, 50) + "...", // Use the separate diagnosis field
          prescription: patientData.prescription?.substring(0, 50) + "...",
          treatment: patientData.treatment?.substring(0, 50) + "...",
          reports: patientData.reports?.substring(0, 50) + "...",
          advisedInvestigations:
            patientData.advisedInvestigations?.substring(0, 50) + "...",
        });
        // Log clinical parameters state
        logStateUpdate("Clinical Parameters", clinicalParameters);
        break;
      case "prescription":
        logStateUpdate("Medications Count", medications.length);
        if (medications.length > 0) {
          logStateUpdate("First Medication", medications[0]);
        }
        break;
      case "diagnosis":
        logStateUpdate("Report Data", reportData);
        logStateUpdate("Report Files", reportFiles.length);
        break;
    }
  };

  // Utility: convert file to base64 - UPDATED VERSION
  const fileToBase64 = async (fileUri: string): Promise<string> => {
    console.log(`🔍 FILE_TO_BASE64: Starting conversion for: ${fileUri}`);

    try {
      // Validate the URI first - don't attempt to process remote URLs
      if (fileUri.startsWith("http://") || fileUri.startsWith("https://")) {
        console.error(
          "❌ FILE_TO_BASE64: Cannot convert remote URLs to base64"
        );
        throw new Error(
          "Cannot convert remote URLs to base64 directly. Use local files only."
        );
      }

      console.log(`📄 FILE_TO_BASE64: Reading local file: ${fileUri}`);

      // Check if the file exists first with improved error details
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) {
          console.error(
            `❌ FILE_TO_BASE64: File does not exist at path: ${fileUri}`
          );
          throw new Error(`File does not exist at path: ${fileUri}`);
        }
        console.log(
          `✅ FILE_TO_BASE64: File exists: Size=${fileInfo.size} bytes, URI=${fileUri}`
        );

        // Check file size and warn about potentially large files
        if (fileInfo.size > 5000000) {
          // 5MB
          console.warn(
            `⚠️ FILE_TO_BASE64: Large file detected (${(
              fileInfo.size /
              1024 /
              1024
            ).toFixed(2)}MB). This may cause issues with the API.`
          );
        }
      } catch (fileCheckError) {
        console.error(
          `❌ FILE_TO_BASE64: Error checking file existence: ${fileCheckError.message}`
        );
        throw new Error(`Failed to verify file: ${fileCheckError.message}`);
      }

      // Only proceed with reading if file exists - with retry logic
      let base64Data = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && !base64Data) {
        attempts++;
        try {
          console.log(
            `📤 FILE_TO_BASE64: Reading file attempt ${attempts}/${maxAttempts}`
          );

          base64Data = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Verify we got valid data
          if (!base64Data || base64Data.length === 0) {
            console.error("❌ FILE_TO_BASE64: Empty base64 data returned");
            throw new Error("Empty base64 data returned from FileSystem");
          }

          console.log(
            `✅ FILE_TO_BASE64: Base64 read successful. Data length: ${base64Data.length} characters`
          );
          console.log(
            `🔍 FILE_TO_BASE64: First 20 chars: ${base64Data.substring(
              0,
              20
            )}...`
          );
          console.log(
            `🔍 FILE_TO_BASE64: Last 20 chars: ${base64Data.substring(
              base64Data.length - 20
            )}...`
          );
        } catch (readError) {
          console.error(
            `❌ FILE_TO_BASE64: Read attempt ${attempts} failed: ${readError.message}`
          );

          if (attempts < maxAttempts) {
            // Wait before retrying
            console.log(`⏳ FILE_TO_BASE64: Waiting before retry...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } else {
            throw new Error(
              `Failed to read file after ${maxAttempts} attempts: ${readError.message}`
            );
          }
        }
      }

      return base64Data;
    } catch (error) {
      console.error(`❌ FILE_TO_BASE64: Fatal error for ${fileUri}:`, error);
      throw error;
    }
  };

  // Enhanced version of updateField to better track changes
  const updateField = (field, value) => {
    // Add more detailed logging
    console.log(`🔄 Updating field "${field}"`);
    console.log(`   Current value: "${patientData[field]}"`);
    console.log(`   New value: "${value}"`);
    console.log(
      `   Current length: ${patientData[field]?.length}, New length: ${value?.length}`
    );

    logStateUpdate(`Updating ${field}`, value?.substring?.(0, 30) + "...");

    setPatientData((prev) => {
      const updated = { ...prev, [field]: value };
      // Log after state update
      console.log(`   Updated state for ${field}: "${updated[field]}"`);
      return updated;
    });

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  // Update report data state with improved logging
  const updateReportField = (field, value) => {
    console.log(`🔄 Updating report field: "${field}"`);
    console.log(`   Current value: "${reportData[field]}"`);
    console.log(`   New value: "${value}"`);
    console.log(
      `   Current length: ${reportData[field]?.length}, New length: ${value?.length}`
    );

    setReportData((prev) => {
      const updatedData = { ...prev, [field]: value };
      console.log(
        `   Updated reportData state for ${field}: "${updatedData[field]}"`
      );
      return updatedData;
    });
  };

  // Update the ensureFilesHaveBase64 function to better handle duplicates
  const ensureFilesHaveBase64 = async (files) => {
    console.log(`🔄 Ensuring ${files.length} files have base64 data`);

    // First deduplicate files using more robust criteria
    const uniqueFileMap = new Map();
    files.forEach((file) => {
      // Create a unique key based on name, URI, or content
      let key;
      if (file.uri) {
        key = file.uri;
      } else if (file.name) {
        key = file.name + "_" + (file.category || "uncategorized");
      } else if (file.base64Data) {
        // Use first 100 chars of base64 as a fingerprint
        key = file.base64Data.substring(0, 100);
      } else {
        key = `unknown_${Date.now()}_${Math.random()}`;
      }

      // Only keep if not already in map
      if (!uniqueFileMap.has(key)) {
        uniqueFileMap.set(key, file);
      } else {
        console.log(`Skipping duplicate file: ${file.name || "unnamed file"}`);
      }
    });

    const deduplicatedFiles = Array.from(uniqueFileMap.values());
    console.log(
      `After deduplication: ${deduplicatedFiles.length} files (from ${files.length})`
    );

    const processedFiles = [];

    for (let i = 0; i < deduplicatedFiles.length; i++) {
      const file = deduplicatedFiles[i];
      console.log(
        `Processing file ${i + 1}/${deduplicatedFiles.length}: ${file.name}`
      );

      // Skip files that are already remote URLs
      if (isFileAlreadyUploaded(file)) {
        console.log(
          `File ${file.name} is a remote URL, skipping base64 conversion`
        );
        processedFiles.push(file);
        continue;
      }

      // If file already has base64 data, use it
      if (file.base64Data) {
        console.log(`File ${file.name} already has base64 data`);
        processedFiles.push(file);
        continue;
      }

      // Otherwise, try to convert
      try {
        console.log(`Converting ${file.name} to base64`);
        const rawBase64 = await fileToBase64(file.uri);
        const contentType = file.type || "application/octet-stream";
        const base64Data = `data:${contentType};base64,${rawBase64}`;

        processedFiles.push({
          ...file,
          base64Data: base64Data,
        });

        console.log(`Converted ${file.name} to base64 successfully`);
      } catch (error) {
        console.error(
          `Failed to convert ${file.name} to base64: ${error.message}`
        );
        // Add the file without base64 data - the server will handle this case
        processedFiles.push(file);
      }
    }

    return processedFiles;
  };

  // Validate fields - Updated to include mobile validation
  const validateForm = () => {
    let isValid = true;
    const newErrors = { name: "", age: "", mobile: "" };

    if (!patientData.name.trim()) {
      newErrors.name = "Name is required";
      isValid = false;
    }

    if (!patientData.age.trim()) {
      newErrors.age = "Age is required";
      isValid = false;
    } else if (isNaN(Number(patientData.age)) || Number(patientData.age) <= 0) {
      newErrors.age = "Please enter a valid age";
      isValid = false;
    }

    // Add validation for mobile number
    if (!patientData.mobile.trim()) {
      newErrors.mobile = "Mobile number is required";
      isValid = false;
    } else if (!/^[0-9]{10}$/.test(patientData.mobile.trim())) {
      newErrors.mobile = "Please enter a valid 10-digit mobile number";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // UPDATED: getSubmitButtonText function to show "Save" instead of "Next" in normal flow
  const getSubmitButtonText = () => {
    if (prefillMode) {
      if (activeSection === "prescription") {
        return "Update Report";
      } else {
        return "Update & Next";
      }
    } else {
      // In normal flow, always show "Save" instead of "Next"
      return "Save";
    }
  };

  // UPDATED: Modified proceedToNextSection function to log permanentPatientId
  const proceedToNextSection = () => {
    console.log("\n🔄 PROCEEDING TO NEXT SECTION");
    console.log("-----------------------------------------------------------");
    console.log(`🔍 Current section: ${activeSection}`);
    console.log(
      `🔍 Current permanentPatientId: ${permanentPatientId || "not set"}`
    );

    const sections = ["basic", "clinical", "diagnosis", "prescription"];
    const currentIndex = sections.indexOf(activeSection);

    console.log(
      `🔢 Current index: ${currentIndex}, Total sections: ${sections.length}`
    );
    if (currentIndex < sections.length - 1) {
      const nextSection = sections[currentIndex + 1];
      console.log(`⏭️ Moving to next section: ${nextSection}`);
      console.log(
        `🔍 Carrying permanentPatientId: ${permanentPatientId || "not set"}`
      );
      setActiveSection(nextSection);

      // Scroll to top of next section for better UX
      if (scrollViewRef && scrollViewRef.current) {
        console.log("📜 Scrolling to top of new section");
        scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: true });
      }

      console.log(`✅ Navigation to ${nextSection} section complete`);
    } else {
      // If on the last section, go back
      console.log("🏁 On last section, navigating back");
      navigation.goBack();
    }

    console.log("-----------------------------------------------------------");
  };

  // UPDATED: switchSection function to only block navigation if basic isn't saved
  const switchSection = (section: string) => {
    // Only block navigation if basic section isn't saved and we're in normal flow
    // OR if we're currently on the basic section and trying to navigate away without saving
    if (shouldBlockNavigation() && activeSection !== section) {
      Alert.alert(
        "Unsaved Changes",
        "Please save your basic information before proceeding to other sections.",
        [{ text: "OK" }]
      );
      return;
    }

    setActiveSection(section);
  };

  // Enhanced function to check and include pending history from AsyncStorage
  // with additional checks and better timestamp formatting
  const checkAndIncludePendingHistory = async (patientId) => {
    if (!patientId) {
      console.log(
        "⚠️ No patientId available, cannot check for pending history"
      );
      return false;
    }

    try {
      const key = `pending_history_${patientId}`;
      const pendingHistory = await AsyncStorage.getItem(key);

      if (pendingHistory && pendingHistory.trim()) {
        console.log(
          `🔍 Found pending history text in AsyncStorage (length: ${
            pendingHistory.length
          }): ${pendingHistory.substring(0, 30)}...`
        );

        // Format the pending history with timestamp
        const timestamp = new Date().toLocaleString();
        let updatedHistory = "";

        if (patientData.medicalHistory && patientData.medicalHistory.trim()) {
          // Check if the existing medical history already has this pending entry
          // to avoid duplicate entries
          if (
            !patientData.medicalHistory.includes(
              pendingHistory.substring(0, 20)
            )
          ) {
            updatedHistory = `--- New Entry (${timestamp}) ---\n${pendingHistory}\n\n${patientData.medicalHistory}`;
            console.log("Adding new entry on top of existing medical history");
          } else {
            console.log(
              "Pending history appears to already be in medical history, keeping existing data"
            );
            updatedHistory = patientData.medicalHistory;
          }
        } else {
          updatedHistory = `--- Entry (${timestamp}) ---\n${pendingHistory}`;
          console.log(
            "Creating initial medical history entry from pending history"
          );
        }

        // Update the patient data with the combined history
        console.log("📝 Including pending history in submission");

        // Update patient data state directly
        setPatientData((prev) => ({
          ...prev,
          medicalHistory: updatedHistory,
        }));

        // Clear the pending history from AsyncStorage
        await AsyncStorage.removeItem(key);
        console.log(`✅ Cleared pending history from AsyncStorage key: ${key}`);

        return true;
      } else {
        console.log("📋 No pending history found in AsyncStorage");
        return false;
      }
    } catch (error) {
      console.error("❌ Error checking for pending history:", error);
      return false;
    }
  };

  // Function to directly add new history entry with improved error handling and validation
  const includeNewHistoryEntry = async (patientId, newHistoryText) => {
    if (!patientId) {
      console.error("❌ Missing patientId in includeNewHistoryEntry");
      return false;
    }

    if (!newHistoryText || newHistoryText.trim() === "") {
      console.log("⚠️ No history text to include (empty text)");
      return false;
    }

    try {
      console.log(`📝 INCLUDING HISTORY: Starting for patient: ${patientId}`);
      console.log(`Text length: ${newHistoryText.length} chars`);
      console.log(`Preview: "${newHistoryText.substring(0, 50)}..."`);

      // Format the new history with timestamp
      const timestamp = new Date().toLocaleString();
      let updatedHistory = "";

      // Get current medical history
      const currentHistory = patientData.medicalHistory || "";
      console.log(
        `Current medical history length: ${currentHistory.length} chars`
      );

      // Check if this history text might already be included
      if (currentHistory.includes(newHistoryText.substring(0, 30))) {
        console.log(
          "⚠️ This history text may already be included in medical history"
        );
        console.log("Will continue anyway and force the update");
      }

      // Format with different prefix based on whether this is first entry
      if (currentHistory.trim()) {
        updatedHistory = `--- New Entry (${timestamp}) ---\n${newHistoryText}\n\n${currentHistory}`;
        console.log("Adding new entry on top of existing medical history");
      } else {
        updatedHistory = `--- Entry (${timestamp}) ---\n${newHistoryText}`;
        console.log("Creating initial medical history entry");
      }

      // Update patient data state with the combined history
      console.log(
        `Setting new medical history (${updatedHistory.length} chars)`
      );

      // Update the state directly and verify it was changed
      setPatientData((prev) => {
        const updated = {
          ...prev,
          medicalHistory: updatedHistory,
        };
        console.log(
          `Updated state, new length: ${updated.medicalHistory.length} chars`
        );
        return updated;
      });

      // Set flag to force history update in API call
      setIsSavingHistory(true);
      console.log("✅ Set isSavingHistory flag to true");

      // Log success
      console.log(`✅ Successfully added history to medicalHistory field`);
      return true;
    } catch (error) {
      console.error("❌ Error in includeNewHistoryEntry:", error);
      console.error("Stack:", error.stack);
      return false;
    }
  };

  // Add this in useEffect when component mounts (for tracing/debugging)
  useEffect(() => {
    console.log("📋 Setting up diagnosis clearing mechanism");

    // Create a function to clear diagnosis after save
    const clearDiagnosisAfterSaveCompletion = async () => {
      try {
        // Set a flag in AsyncStorage to indicate diagnosis should be cleared
        await AsyncStorage.setItem("clearDiagnosisFlag", "true");
        console.log("🚩 Set clearDiagnosisFlag in AsyncStorage");

        // Check if DiagnosisTab ref is available and call its method
        if (
          diagnosisTabRef &&
          diagnosisTabRef.current &&
          diagnosisTabRef.current.clearDiagnosisAfterSave
        ) {
          console.log(
            "🧹 Directly calling clearDiagnosisAfterSave from useEffect"
          );
          diagnosisTabRef.current.clearDiagnosisAfterSave();
        }
      } catch (error) {
        console.error("❌ Error in clearDiagnosisAfterSaveCompletion:", error);
      }
    };

    // Add a listener for save completion (this is a simplified example)
    // In a real app, you would hook this up to your actual save completion event
    return () => {
      // Clean up when component unmounts
      AsyncStorage.removeItem("clearDiagnosisFlag")
        .then(() => console.log("🧹 Cleaned up clearDiagnosisFlag on unmount"))
        .catch((error) =>
          console.error("❌ Error clearing diagnosis flag:", error)
        );
    };
  }, []);

  const handleSubmit = async () => {
    console.log(
      "\n==========================================================="
    );
    console.log(`📱 HANDLE SUBMIT STARTED | ${new Date().toISOString()}`);
    console.log("===========================================================");
    console.log(`🔍 Current Section: ${activeSection}`);

    // Get patient ID for existing patients
    const patId = patient?.patientId || permanentPatientId;
    // Get current session ID for tracking save completion
    const currentSessionId = patId || "temp_" + Date.now();

    // If in clinical section and we have an entry in the "Enter new history entry..." field
    if (
      activeSection === "clinical" &&
      clinicalTabRef &&
      clinicalTabRef.current
    ) {
      try {
        console.log(
          "🔄 Attempting to visibly transfer history text before submission"
        );

        // Try to access the directHistoryText value
        if (
          clinicalTabRef.current.directHistoryText &&
          clinicalTabRef.current.directHistoryText.trim()
        ) {
          const historyText = clinicalTabRef.current.directHistoryText;
          console.log(
            `📝 Found history text to transfer: "${historyText.substring(
              0,
              30
            )}..."`
          );

          // Create a timestamp and format the history entry
          const timestamp = new Date().toLocaleString();
          let updatedHistory = "";

          if (patientData.medicalHistory && patientData.medicalHistory.trim()) {
            updatedHistory = `--- New Entry (${timestamp}) ---\n${historyText}\n\n${patientData.medicalHistory}`;
          } else {
            updatedHistory = `--- Entry (${timestamp}) ---\n${historyText}`;
          }

          // THIS IS THE CRITICAL LINE: Update both the patientData state AND
          // call updateField to ensure it's synchronized before API submission
          updateField("medicalHistory", updatedHistory);
          console.log(
            `✅ Updated medicalHistory field in patientData, new length: ${updatedHistory.length}`
          );

          // Clear the input text from ClinicalTab component
          if (clinicalTabRef.current.setDirectHistoryText) {
            clinicalTabRef.current.setDirectHistoryText("");
          }

          // Flag that we're including new history
          setIsSavingHistory(true);

          // Give the UI a moment to update
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (visualTransferError) {
        console.error(
          "❌ Error during visual history transfer:",
          visualTransferError
        );
      }
    }

    // If in clinical section, ensure we always capture history text
    if (activeSection === "clinical" && patId) {
      console.log(
        `\n🔎 CLINICAL HISTORY CHECK: Processing history for patient: ${patId}`
      );
      let historySaved = false;

      // STEP 1: First try to use the ref to directly save any unsaved history text
      if (clinicalTabRef && clinicalTabRef.current) {
        try {
          console.log(
            "🔍 STEP 1: Attempting to save history directly via ClinicalTab ref"
          );
          historySaved =
            await clinicalTabRef.current.saveDirectHistoryToMedicalHistory();

          if (historySaved) {
            console.log(
              "✅ Successfully saved direct history text via ref method"
            );
            setIsSavingHistory(true);
          } else {
            console.log(
              "ℹ️ No history text was available in the input field via ref"
            );
          }
        } catch (refError) {
          console.error(
            "❌ Error using clinicalTabRef to save history:",
            refError
          );
          console.log("⚠️ Will try AsyncStorage method as fallback");
        }
      } else {
        console.log("ℹ️ No clinicalTabRef available, skipping ref method");
      }

      // STEP 2: If ref method didn't work or wasn't available, check AsyncStorage directly
      if (!historySaved) {
        console.log("🔍 STEP 2: Checking AsyncStorage for history text");
        await new Promise((resolve) => setTimeout(resolve, 300));

        try {
          // Check both possible key formats for maximum compatibility
          const newHistoryKey = `new_history_input_${patId}`;
          const pendingHistoryKey = `pending_history_${patId}`;

          console.log(
            `Checking AsyncStorage keys: "${newHistoryKey}" and "${pendingHistoryKey}"`
          );

          // Try to get history from either key
          const newHistoryText = await AsyncStorage.getItem(newHistoryKey);
          const pendingHistoryText = await AsyncStorage.getItem(
            pendingHistoryKey
          );

          let historyTextToUse = null;

          // Determine which history text to use, preferring new_history_input first
          if (newHistoryText && newHistoryText.trim() !== "") {
            console.log(
              `🔍 Found text in new_history_input key (${newHistoryText.length} chars)`
            );
            console.log(`Preview: "${newHistoryText.substring(0, 30)}..."`);
            historyTextToUse = newHistoryText;
          } else if (pendingHistoryText && pendingHistoryText.trim() !== "") {
            console.log(
              `🔍 Found text in pending_history key (${pendingHistoryText.length} chars)`
            );
            console.log(`Preview: "${pendingHistoryText.substring(0, 30)}..."`);
            historyTextToUse = pendingHistoryText;
          }

          if (historyTextToUse) {
            // Include this text directly in the medical history with a timestamp
            console.log(
              `🔄 Including history text from AsyncStorage (${historyTextToUse.length} chars)`
            );
            const success = await includeNewHistoryEntry(
              patId,
              historyTextToUse
            );

            if (success) {
              historySaved = true;

              // Clear both possible history entry AsyncStorage keys
              await AsyncStorage.removeItem(newHistoryKey);
              await AsyncStorage.removeItem(pendingHistoryKey);
              console.log(`✅ Cleared history entry fields from AsyncStorage`);
            }
          } else {
            console.log(
              "📋 No text found in any history entry fields in AsyncStorage"
            );
          }
        } catch (error) {
          console.error(
            "❌ Error checking for history entry in AsyncStorage:",
            error
          );
        }
      }

      // STEP 3: Final check for backward compatibility
      if (!historySaved) {
        console.log("🔍 STEP 3: Checking for legacy pending history format");
        const historyIncluded = await checkAndIncludePendingHistory(patId);

        if (historyIncluded) {
          console.log("📋 Legacy pending history was found and included");
          console.log(
            `Updated medicalHistory length: ${
              patientData.medicalHistory?.length || 0
            } chars`
          );
          historySaved = true;
        } else {
          console.log("📋 No legacy pending history found");
        }
      }

      // STEP 4: Set the flag regardless if ANY method worked
      if (historySaved) {
        console.log(
          "🚩 Setting isSavingHistory flag to ensure backend processes the history"
        );
        setIsSavingHistory(true);
      } else {
        console.log("ℹ️ No history text found to save through any method");
      }

      console.log("🔎 CLINICAL HISTORY CHECK COMPLETE\n");
    }

    // Print the current state of all patient data to debug
    console.log("🔍 CURRENT PATIENT DATA STATE:");
    Object.keys(patientData).forEach((key) => {
      const value = patientData[key];
      console.log(
        `   ${key}: ${
          typeof value === "string" ? `"${value}"` : value
        } (${typeof value})`
      );
    });

    // Log status of permanentPatientId and other tracking variables
    console.log("🔍 SESSION TRACKING:");
    console.log(`   permanentPatientId: ${permanentPatientId || "not set"}`);
    console.log(`   savedSections:`, JSON.stringify(savedSections));

    // Verify field values before submission
    verifyFieldsBeforeSubmit(activeSection);

    // Check internet connection before making API calls
    const checkConnection = async () => {
      try {
        console.log("🔄 Checking internet connection...");
        // Try to fetch a small resource to check connectivity
        const testResponse = await fetch("https://www.google.com", {
          method: "HEAD",
          // Set a short timeout for the test
          timeout: 5000,
          // Use cache-control to avoid cached responses
          headers: { "Cache-Control": "no-cache" },
        });

        console.log(`✅ Connection test result: ${testResponse.status}`);
        return true;
      } catch (error) {
        console.error("❌ Connection test failed:", error);
        // Return false but don't throw, let the main flow handle it
        return false;
      }
    };

    // Handle normal flow behavior with direct API calls for each section
    if (!prefillMode) {
      if (activeSection === "basic") {
        console.log("\n🔄 BASIC SECTION VALIDATION");
        if (validateForm()) {
          setIsSubmitting(true);
          try {
            // Check connection before proceeding
            const isConnected = await checkConnection();
            if (!isConnected) {
              console.error("❌ No internet connection detected");
              throw new Error(
                "No internet connection. Please check your network and try again."
              );
            }

            console.log("🌐 Preparing API call for basic section");
            // Create the API request payload - ONLY INCLUDE BASIC SECTION DATA
            const basicData = {
              name: patientData.name || "",
              age: patientData.age || "0",
              sex: patientData.sex || "Male",
              mobile: patientData.mobile || "",
              address: patientData.address || "",
              saveSection: "basic",
              isPartialSave: true,
              // If we already have a permanentPatientId from a previous save, include it
              ...(permanentPatientId
                ? {
                    patientId: permanentPatientId,
                  }
                : {}),
            };

            console.log("🔍 CHECKING permanentPatientId inclusion:");
            console.log(
              `   State permanentPatientId: ${permanentPatientId || "not set"}`
            );
            console.log(`   Is included in request: ${!!basicData.patientId}`);
            console.log(
              `   Value being sent: ${basicData.patientId || "none"}`
            );

            console.log(
              "📝 Basic data payload:",
              JSON.stringify(basicData, null, 2)
            );

            // Define the API endpoint URL and verify it
            const apiUrl =
              "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction";
            console.log(`📡 API Endpoint: ${apiUrl}`);

            // Make the actual API call with timeout and retry logic
            console.log("📡 Sending request to API endpoint...");

            // Implement retry logic
            let response;
            let retryCount = 0;
            const maxRetries = 3;
            const timeout = 10000; // 10 second timeout

            while (retryCount <= maxRetries) {
              try {
                console.log(
                  `🔄 API attempt ${retryCount + 1}/${maxRetries + 1}`
                );

                // Use AbortController for timeout if supported
                const controller =
                  typeof AbortController !== "undefined"
                    ? new AbortController()
                    : null;
                const timeoutId = controller
                  ? setTimeout(() => controller.abort(), timeout)
                  : null;

                response = await fetch(apiUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "Cache-Control": "no-cache",
                  },
                  body: JSON.stringify(basicData),
                  // Add timeout controls if available
                  ...(controller ? { signal: controller.signal } : {}),
                });

                // Clear timeout if it was set
                if (timeoutId) clearTimeout(timeoutId);

                // If we got here, the request was successful
                console.log(
                  `✅ Network request successful, status: ${response.status}`
                );
                break;
              } catch (networkError) {
                console.error(
                  `❌ Network error (attempt ${retryCount + 1}/${
                    maxRetries + 1
                  }):`,
                  networkError
                );

                // Additional diagnostic info
                console.log(`🔍 Network error details:`, {
                  message: networkError.message || "Unknown error",
                  type: networkError.constructor.name,
                  stack: networkError.stack
                    ? networkError.stack.split("\n")[0]
                    : "No stack trace",
                });

                // Check if we should retry
                if (retryCount === maxRetries) {
                  console.log("❌ Maximum retry attempts reached");
                  throw new Error(
                    `Network request failed after ${maxRetries + 1} attempts: ${
                      networkError.message || "Unknown error"
                    }. Check your internet connection and try again.`
                  );
                }

                // Wait before retrying (exponential backoff)
                const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, etc.
                console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                retryCount++;
              }
            }

            // At this point, we have a valid response
            console.log(`⏱️ Response received at: ${new Date().toISOString()}`);
            console.log(`📊 HTTP Status code: ${response.status}`);

            // Parse response
            const responseText = await response.text();
            console.log(
              `📄 Raw response: ${responseText.substring(0, 200)}...`
            );

            let result;
            try {
              result = JSON.parse(responseText);
              console.log(
                "📋 Parsed response:",
                JSON.stringify(result, null, 2)
              );
            } catch (parseError) {
              console.error("❌ Error parsing response:", parseError);
              throw new Error(
                `Invalid response from server: ${parseError.message}`
              );
            }

            // Check for nested response
            if (result.body && typeof result.body === "string") {
              try {
                const parsedBody = JSON.parse(result.body);
                console.log(
                  "📦 Parsed nested body:",
                  JSON.stringify(parsedBody, null, 2)
                );
                result = parsedBody;
              } catch (e) {
                console.log("Inner body is not valid JSON, using as-is");
              }
            }

            // Check if save was successful
            const isSuccess =
              result.success === true ||
              (result.statusCode &&
                result.statusCode >= 200 &&
                result.statusCode < 300) ||
              (result.body &&
                typeof result.body === "string" &&
                result.body.includes('"success":true'));

            if (!isSuccess) {
              let errorMessage = "Unknown error occurred";
              if (result.error) {
                errorMessage = result.error;
              } else if (result.message && result.success === false) {
                errorMessage = result.message;
              }
              console.error("❌ API call failed:", errorMessage);
              throw new Error(errorMessage);
            }

            console.log("✅ Basic information saved successfully");

            // UPDATED: Store the permanent patientId from the API response
            if (result.patientId) {
              console.log(`🔑 Setting permanentPatientId: ${result.patientId}`);
              setPermanentPatientId(result.patientId);
            } else if (
              result.body &&
              typeof result.body === "string" &&
              result.body.includes("patientId")
            ) {
              try {
                // Try to extract from nested body if it exists
                const bodyObj = JSON.parse(result.body);
                if (bodyObj.patientId) {
                  console.log(
                    `🔑 Setting permanentPatientId from nested body: ${bodyObj.patientId}`
                  );
                  setPermanentPatientId(bodyObj.patientId);
                }
              } catch (e) {
                console.error("Failed to parse nested body for patientId:", e);
              }
            }

            // Mark the section as saved
            setSavedSections((prev) => {
              console.log("🔒 Marking basic section as saved");
              return { ...prev, basic: true };
            });

            // Show success alert and navigate to next section on confirmation
            Alert.alert("Success", "Basic information saved successfully!", [
              {
                text: "OK",
                onPress: () => {
                  console.log("👉 Proceeding to next section after basic save");
                  proceedToNextSection();
                },
              },
            ]);
          } catch (error) {
            console.error("❌ Error saving basic information:", error);

            // Create a more user-friendly error message based on error type
            let errorMessage = error.message || "Please try again.";

            // Check for specific network errors and improve messages
            if (
              error.message &&
              error.message.includes("Network request failed")
            ) {
              errorMessage =
                "Unable to connect to server. Please check your internet connection and try again.";
            } else if (error.message && error.message.includes("timeout")) {
              errorMessage =
                "Request timed out. The server took too long to respond. Please try again later.";
            } else if (error.message && error.message.includes("abort")) {
              errorMessage = "Request was cancelled. Please try again.";
            }

            Alert.alert(
              "Error",
              `Failed to save basic information: ${errorMessage}`
            );
          } finally {
            setIsSubmitting(false);
            console.log("🏁 Basic section submission completed");
          }
        } else {
          console.log("❌ Basic section validation failed");
        }
        return;
      }

      if (activeSection === "clinical") {
        console.log("\n🔄 CLINICAL SECTION VALIDATION");
        setIsSubmitting(true);
        try {
          // Check connection before proceeding
          const isConnected = await checkConnection();
          if (!isConnected) {
            console.error("❌ No internet connection detected");
            throw new Error(
              "No internet connection. Please check your network and try again."
            );
          }

          // Process files to ensure they all have base64 data
          let processedReportFiles = [];
          if (reportFiles.length > 0) {
            console.log(`📁 Processing ${reportFiles.length} files for upload`);

            // Show processing message to user
            Alert.alert(
              "Processing Files",
              `Preparing ${reportFiles.length} file(s) for upload. This may take a moment...`,
              [{ text: "OK" }]
            );

            processedReportFiles = await ensureFilesHaveBase64(reportFiles);
            console.log(
              `✅ Processed ${processedReportFiles.length} files for upload`
            );

            // Log file sizes to help with debugging
            processedReportFiles.forEach((file, index) => {
              const base64Length = file.base64Data
                ? file.base64Data.length
                : "N/A";
              console.log(
                `📊 File ${index + 1}: ${
                  file.name
                }, Base64 length: ${base64Length}`
              );
            });
          }

          console.log("🌐 Preparing API call for clinical section");

          // Create the API request payload with improved history handling flags
          console.log(
            `Building clinical data payload with medicalHistory (${
              patientData.medicalHistory?.length || 0
            } chars)`
          );
          console.log(`isSavingHistory flag is: ${isSavingHistory}`);

          // In handleSubmit function when processing clinical section:
          const clinicalData = {
            // Get the LATEST medicalHistory directly from the state or ref
            medicalHistory: clinicalTabRef.current
              ? clinicalTabRef.current.getLatestMedicalHistory() ||
                patientData.medicalHistory
              : patientData.medicalHistory,
            diagnosis: patientData.diagnosis || "",
            prescription: patientData.prescription || "",
            treatment: patientData.treatment || "",
            reports: patientData.reports || "",
            advisedInvestigations: patientData.advisedInvestigations || "",
            clinicalParameters: {
              ...clinicalParameters,
              // Ensure unique timestamp for history tracking
              date: new Date().toISOString(),
            },
            saveSection: "clinical",
            isPartialSave: true,
            // Always force these flags to true when saving
            createParameterHistory: true,
            pendingHistoryIncluded: true,
            forceHistoryUpdate: true,
            // Include reportFiles if they exist
            ...(processedReportFiles.length > 0
              ? { reportFiles: processedReportFiles }
              : {}),
            // IMPORTANT: Always include permanentPatientId if it exists
            ...(permanentPatientId ? { patientId: permanentPatientId } : {}),
          };

          // Log the key parts for debugging
          console.log(`📝 Final clinicalData payload:`);
          console.log(
            `⚠️ medicalHistory length: ${
              clinicalData.medicalHistory?.length || 0
            } chars`
          );
          console.log(
            `⚠️ pendingHistoryIncluded: ${clinicalData.pendingHistoryIncluded}`
          );
          console.log(
            `⚠️ forceHistoryUpdate: ${clinicalData.forceHistoryUpdate}`
          );

          // Log key flags for debugging
          console.log(`Final payload flags:
          - pendingHistoryIncluded: ${clinicalData.pendingHistoryIncluded}
          - forceHistoryUpdate: ${clinicalData.forceHistoryUpdate}
          - createMedicalHistoryEntry: ${clinicalData.createMedicalHistoryEntry}
          - medicalHistory length: ${
            clinicalData.medicalHistory?.length || 0
          } chars
          - patientId included: ${!!clinicalData.patientId}`);

          // Log that we're including the latest history
          console.log(
            "📋 Including updated medical history in clinical update"
          );
          console.log(
            `   Medical history length: ${
              patientData.medicalHistory?.length || 0
            } characters`
          );

          // Add debugging to verify permanentPatientId inclusion
          console.log("🔍 CHECKING permanentPatientId in clinical request:");
          console.log(
            `   Current permanentPatientId: ${permanentPatientId || "not set"}`
          );
          console.log(`   Is included in request: ${!!clinicalData.patientId}`);
          console.log(
            `   Value being sent: ${clinicalData.patientId || "none"}`
          );

          // Log information about files being sent (if any)
          if (processedReportFiles.length > 0) {
            console.log(
              `📊 Sending ${processedReportFiles.length} report files to API from clinical section`
            );
            processedReportFiles.forEach((file, i) => {
              console.log(
                `📄 File ${i + 1}: ${file.name}, URI: ${file.uri?.substring(
                  0,
                  30
                )}...`
              );
            });
          }

          console.log(
            "📝 Clinical data payload:",
            JSON.stringify(clinicalData, null, 2)
          );

          // Define the API endpoint URL and verify it
          const apiUrl =
            "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction";
          console.log(`📡 API Endpoint: ${apiUrl}`);

          // Make the actual API call with timeout and retry logic
          console.log("📡 Sending request to API endpoint...");

          // Implement retry logic
          let response;
          let retryCount = 0;
          const maxRetries = 3;
          const timeout = 10000; // 10 second timeout

          while (retryCount <= maxRetries) {
            try {
              console.log(`🔄 API attempt ${retryCount + 1}/${maxRetries + 1}`);

              // Use AbortController for timeout if supported
              const controller =
                typeof AbortController !== "undefined"
                  ? new AbortController()
                  : null;
              const timeoutId = controller
                ? setTimeout(() => controller.abort(), timeout)
                : null;

              response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  "Cache-Control": "no-cache",
                },
                body: JSON.stringify(clinicalData),
                // Add timeout controls if available
                ...(controller ? { signal: controller.signal } : {}),
              });

              // Clear timeout if it was set
              if (timeoutId) clearTimeout(timeoutId);

              // If we got here, the request was successful
              console.log(
                `✅ Network request successful, status: ${response.status}`
              );
              break;
            } catch (networkError) {
              console.error(
                `❌ Network error (attempt ${retryCount + 1}/${
                  maxRetries + 1
                }):`,
                networkError
              );

              // Additional diagnostic info
              console.log(`🔍 Network error details:`, {
                message: networkError.message || "Unknown error",
                type: networkError.constructor.name,
                stack: networkError.stack
                  ? networkError.stack.split("\n")[0]
                  : "No stack trace",
              });

              // Check if we should retry
              if (retryCount === maxRetries) {
                console.log("❌ Maximum retry attempts reached");
                throw new Error(
                  `Network request failed after ${maxRetries + 1} attempts: ${
                    networkError.message || "Unknown error"
                  }. Check your internet connection and try again.`
                );
              }

              // Wait before retrying (exponential backoff)
              const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, etc.
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              retryCount++;
            }
          }

          console.log(`⏱️ Response received at: ${new Date().toISOString()}`);
          console.log(`📊 HTTP Status code: ${response.status}`);

          // Parse response
          const responseText = await response.text();
          console.log(`📄 Raw response: ${responseText.substring(0, 200)}...`);

          let result;
          try {
            result = JSON.parse(responseText);
            console.log("📋 Parsed response:", JSON.stringify(result, null, 2));
          } catch (parseError) {
            console.error("❌ Error parsing response:", parseError);
            throw new Error(
              `Invalid response from server: ${parseError.message}`
            );
          }

          // Check for nested response
          if (result.body && typeof result.body === "string") {
            try {
              const parsedBody = JSON.parse(result.body);
              console.log(
                "📦 Parsed nested body:",
                JSON.stringify(parsedBody, null, 2)
              );
              result = parsedBody;
            } catch (e) {
              console.log("Inner body is not valid JSON, using as-is");
            }
          }

          // Check if save was successful
          const isSuccess =
            result.success === true ||
            (result.statusCode &&
              result.statusCode >= 200 &&
              result.statusCode < 300) ||
            (result.body &&
              typeof result.body === "string" &&
              result.body.includes('"success":true'));

          if (!isSuccess) {
            let errorMessage = "Unknown error occurred";
            if (result.error) {
              errorMessage = result.error;
            } else if (result.message && result.success === false) {
              errorMessage = result.message;
            }
            console.error("❌ API call failed:", errorMessage);
            throw new Error(errorMessage);
          }

          console.log("✅ Clinical information saved successfully");

          // Check for file processing results
          if (result.fileDetails) {
            console.log(
              "📁 File processing results:",
              JSON.stringify(result.fileDetails, null, 2)
            );
          }

          // UPDATED: Update or store the permanentPatientId from the response if it exists
          if (result.patientId) {
            console.log(
              `🔑 Setting/updating permanentPatientId: ${result.patientId}`
            );
            setPermanentPatientId(result.patientId);
          }

          // Reset the flag after successful save
          setIsSavingHistory(false);

          // Clear any remaining pending history fields from AsyncStorage
          if (patId) {
            try {
              await AsyncStorage.removeItem(`new_history_input_${patId}`);
              await AsyncStorage.removeItem(`pending_history_${patId}`);
              console.log("✅ Cleared all pending history storage keys");
            } catch (error) {
              console.error(
                "❌ Error clearing pending history storage:",
                error
              );
            }
          }

          // Mark the section as saved
          setSavedSections((prev) => {
            console.log("🔒 Marking clinical section as saved");
            return { ...prev, clinical: true };
          });

          // Show success alert and navigate to next section on confirmation
          Alert.alert("Success", "Clinical information saved successfully!", [
            {
              text: "OK",
              onPress: () => {
                console.log(
                  "👉 Proceeding to next section after clinical save"
                );
                proceedToNextSection();
              },
            },
          ]);
        } catch (error) {
          console.error("❌ Error saving clinical information:", error);

          // Create a more user-friendly error message based on error type
          let errorMessage = error.message || "Please try again.";

          // Check for specific network errors and improve messages
          if (
            error.message &&
            error.message.includes("Network request failed")
          ) {
            errorMessage =
              "Unable to connect to server. Please check your internet connection and try again.";
          } else if (error.message && error.message.includes("timeout")) {
            errorMessage =
              "Request timed out. The server took too long to respond. Please try again later.";
          } else if (error.message && error.message.includes("abort")) {
            errorMessage = "Request was cancelled. Please try again.";
          }

          Alert.alert(
            "Error",
            `Failed to save clinical information: ${errorMessage}`
          );
        } finally {
          setIsSubmitting(false);
          setIsSavingHistory(false); // Reset flag in case of error
          console.log("🏁 Clinical section submission completed");
        }
        return;
      }

      if (activeSection === "prescription") {
        console.log("\n🔄 PRESCRIPTION SECTION VALIDATION");
        setIsSubmitting(true);
        try {
          // Check connection before proceeding
          const isConnected = await checkConnection();
          if (!isConnected) {
            console.error("❌ No internet connection detected");
            throw new Error(
              "No internet connection. Please check your network and try again."
            );
          }

          console.log("🌐 Preparing API call for prescription section");

          // Process medications to remove any undefined values
          const processedMedications = medications.map((med) => ({
            name: med.name || "",
            duration: med.duration || "",
            timing: med.timing || "",
            timingValues: med.timingValues || "{}",
            specialInstructions: med.specialInstructions || "",
            datePrescribed: med.datePrescribed || new Date().toISOString(),
          }));

          // Create the API request payload with ONLY prescription data
          // Include basic patient info
          const prescriptionData = {
            medications: processedMedications,
            saveSection: "prescription",
            isPartialSave: true,
            // Always include basic patient info to prevent errors
            name: patientData.name,
            mobile: patientData.mobile,
            age: patientData.age,
            sex: patientData.sex,
            // Include permanentPatientId for session continuity if available
            ...(permanentPatientId ? { patientId: permanentPatientId } : {}),
          };

          // Add debugging to verify permanentPatientId inclusion
          console.log(
            "🔍 CHECKING permanentPatientId in prescription request:"
          );
          console.log(
            `   Current permanentPatientId: ${permanentPatientId || "not set"}`
          );
          console.log(
            `   Is included in request: ${!!prescriptionData.patientId}`
          );
          console.log(
            `   Value being sent: ${prescriptionData.patientId || "none"}`
          );

          console.log(
            `📝 Prescription data with ${processedMedications.length} medications`
          );

          // Define the API endpoint URL and verify it
          const apiUrl =
            "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction";
          console.log(`📡 API Endpoint: ${apiUrl}`);

          // Make the actual API call with timeout and retry logic
          console.log("📡 Sending request to API endpoint...");

          // Implement retry logic
          let response;
          let retryCount = 0;
          const maxRetries = 3;
          const timeout = 10000; // 10 second timeout

          while (retryCount <= maxRetries) {
            try {
              console.log(`🔄 API attempt ${retryCount + 1}/${maxRetries + 1}`);

              // Use AbortController for timeout if supported
              const controller =
                typeof AbortController !== "undefined"
                  ? new AbortController()
                  : null;
              const timeoutId = controller
                ? setTimeout(() => controller.abort(), timeout)
                : null;

              response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  "Cache-Control": "no-cache",
                },
                body: JSON.stringify(prescriptionData),
                // Add timeout controls if available
                ...(controller ? { signal: controller.signal } : {}),
              });

              // Clear timeout if it was set
              if (timeoutId) clearTimeout(timeoutId);

              // If we got here, the request was successful
              console.log(
                `✅ Network request successful, status: ${response.status}`
              );
              break;
            } catch (networkError) {
              console.error(
                `❌ Network error (attempt ${retryCount + 1}/${
                  maxRetries + 1
                }):`,
                networkError
              );

              // Additional diagnostic info
              console.log(`🔍 Network error details:`, {
                message: networkError.message || "Unknown error",
                type: networkError.constructor.name,
                stack: networkError.stack
                  ? networkError.stack.split("\n")[0]
                  : "No stack trace",
              });

              // Check if we should retry
              if (retryCount === maxRetries) {
                console.log("❌ Maximum retry attempts reached");
                throw new Error(
                  `Network request failed after ${maxRetries + 1} attempts: ${
                    networkError.message || "Unknown error"
                  }. Check your internet connection and try again.`
                );
              }

              // Wait before retrying (exponential backoff)
              const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, etc.
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              retryCount++;
            }
          }

          console.log(`⏱️ Response received at: ${new Date().toISOString()}`);
          console.log(`📊 HTTP Status code: ${response.status}`);

          // Parse response
          const responseText = await response.text();
          console.log(`📄 Raw response: ${responseText.substring(0, 200)}...`);

          let result;
          try {
            result = JSON.parse(responseText);
            console.log("📋 Parsed response:", JSON.stringify(result, null, 2));
          } catch (parseError) {
            console.error("❌ Error parsing response:", parseError);
            throw new Error(
              `Invalid response from server: ${parseError.message}`
            );
          }

          // Check for nested response
          if (result.body && typeof result.body === "string") {
            try {
              const parsedBody = JSON.parse(result.body);
              console.log(
                "📦 Parsed nested body:",
                JSON.stringify(parsedBody, null, 2)
              );
              result = parsedBody;
            } catch (e) {
              console.log("Inner body is not valid JSON, using as-is");
            }
          }

          // Check if save was successful
          const isSuccess =
            result.success === true ||
            (result.statusCode &&
              result.statusCode >= 200 &&
              result.statusCode < 300) ||
            (result.body &&
              typeof result.body === "string" &&
              result.body.includes('"success":true'));

          if (!isSuccess) {
            let errorMessage = "Unknown error occurred";
            if (result.error) {
              errorMessage = result.error;
            } else if (result.message && result.success === false) {
              errorMessage = result.message;
            }
            console.error("❌ API call failed:", errorMessage);
            throw new Error(errorMessage);
          }

          console.log("✅ Prescription information saved successfully");

          // UPDATED: Update or store the permanentPatientId from the response if it exists
          if (result.patientId) {
            console.log(
              `🔑 Setting/updating permanentPatientId: ${result.patientId}`
            );
            setPermanentPatientId(result.patientId);
          }

          // Mark the section as saved
          setSavedSections((prev) => {
            console.log("🔒 Marking prescription section as saved");
            return { ...prev, prescription: true };
          });

          // Show success alert and navigate to next section on confirmation
          Alert.alert(
            "Success",
            "Prescription information saved successfully!",
            [
              {
                text: "OK",
                onPress: () => {
                  console.log(
                    "👉 Proceeding to next section after prescription save"
                  );
                  proceedToNextSection();
                },
              },
            ]
          );
        } catch (error) {
          console.error("❌ Error saving prescription information:", error);

          // Create a more user-friendly error message based on error type
          let errorMessage = error.message || "Please try again.";

          // Check for specific network errors and improve messages
          if (
            error.message &&
            error.message.includes("Network request failed")
          ) {
            errorMessage =
              "Unable to connect to server. Please check your internet connection and try again.";
          } else if (error.message && error.message.includes("timeout")) {
            errorMessage =
              "Request timed out. The server took too long to respond. Please try again later.";
          } else if (error.message && error.message.includes("abort")) {
            errorMessage = "Request was cancelled. Please try again.";
          }

          Alert.alert(
            "Error",
            `Failed to save prescription information: ${errorMessage}`
          );
        } finally {
          setIsSubmitting(false);
          console.log("🏁 Prescription section submission completed");
        }
        return;
      }

      // If on the diagnosis section, handle it
      if (activeSection === "diagnosis") {
        console.log("\n🔄 DIAGNOSIS SECTION VALIDATION & FULL SUBMISSION");
        console.log(
          "-----------------------------------------------------------"
        );
        setIsSubmitting(true);

        try {
          // Check connection before proceeding
          const isConnected = await checkConnection();
          if (!isConnected) {
            console.error("❌ No internet connection detected");
            throw new Error(
              "No internet connection. Please check your network and try again."
            );
          }

          // Process report files with base64 data
          let processedReportFiles = [];
          if (reportFiles.length > 0) {
            console.log(`📁 Processing ${reportFiles.length} files for upload`);

            // Filter out files that have already been uploaded to S3 or already have a URL
            const newFilesToProcess = reportFiles.filter((file) => {
              // Check if this file is new or already uploaded
              const isAlreadyUploaded =
                file.uri &&
                (file.uri.includes("s3.amazonaws.com") ||
                  file.uri.includes("amazonaws.com") ||
                  file.uri.startsWith("https://"));

              if (isAlreadyUploaded) {
                console.log(`Skipping already uploaded file: ${file.name}`);
                // Add already uploaded files directly to processedReportFiles
                processedReportFiles.push({
                  name: file.name,
                  uri: file.uri,
                  url: file.uri,
                  type: file.type || "application/pdf",
                  category: file.category || "uncategorized",
                  alreadyUploaded: true,
                });
                return false; // Skip this file for processing
              }
              return true; // Keep this file for processing
            });

            console.log(
              `After filtering, ${newFilesToProcess.length} new files need processing`
            );

            // Only show alert and process if there are new files
            if (newFilesToProcess.length > 0) {
              // Show processing message to user
              Alert.alert(
                "Processing Files",
                `Preparing ${newFilesToProcess.length} file(s) for upload. This may take a moment...`,
                [{ text: "OK" }]
              );

              const newlyProcessedFiles = await ensureFilesHaveBase64(
                newFilesToProcess
              );
              // Combine newly processed files with already uploaded files
              processedReportFiles = [
                ...processedReportFiles,
                ...newlyProcessedFiles,
              ];
            }

            console.log(
              `✅ Total files in request: ${processedReportFiles.length}`
            );
          }

          // Create diagnosis-specific data payload for the API
          const diagnosisData = {
            diagnosis: patientData.diagnosis || "",
            advisedInvestigations: patientData.advisedInvestigations || "",
            reportData: reportData,
            // Always include basic patient info
            name: patientData.name,
            mobile: patientData.mobile,
            age: patientData.age,
            sex: patientData.sex,
            // Only include reportFiles if there are actually files to process
            ...(processedReportFiles.length > 0
              ? { reportFiles: processedReportFiles }
              : {}),
            saveSection: "diagnosis",
            isPartialSave: true,
            // These flags ensure diagnosis is added to history with EACH edit
            createDiagnosisHistory: true,
            diagnosisTimestamp: new Date().toISOString(),
            forceHistoryUpdate: true,
            ...(permanentPatientId ? { patientId: permanentPatientId } : {}),
          };

          // Add debugging to verify permanentPatientId inclusion
          console.log("🔍 CHECKING permanentPatientId in diagnosis request:");
          console.log(
            `   Current permanentPatientId: ${permanentPatientId || "not set"}`
          );
          console.log(
            `   Is included in request: ${!!diagnosisData.patientId}`
          );
          console.log(
            `   Value being sent: ${diagnosisData.patientId || "none"}`
          );

          console.log("🌐 SENDING API REQUEST FOR DIAGNOSIS SECTION");
          console.log(
            "-----------------------------------------------------------"
          );
          console.log(
            `📡 Endpoint: https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction`
          );
          console.log(`⏱️ Request started at: ${new Date().toISOString()}`);

          // Convert to JSON with proper error handling and undefined value handling
          let jsonBody;
          try {
            jsonBody = JSON.stringify(diagnosisData, (key, value) =>
              value === undefined ? null : value
            );
            console.log(`📊 Request body size: ${jsonBody.length} characters`);

            // Check if the request might be too large for API Gateway (10MB limit)
            if (jsonBody.length > 5000000) {
              // 5MB as a safety margin
              console.warn(
                "⚠️ WARNING: Request body is very large and may exceed API Gateway limits"
              );

              // New approach: ask the user if they want to continue with a large request
              const userChoice = await new Promise((resolve) => {
                Alert.alert(
                  "Warning",
                  "The files you're uploading are very large and may cause the submission to fail. Would you like to continue?",
                  [
                    {
                      text: "Continue Anyway",
                      onPress: () => resolve("continue"),
                    },
                    {
                      text: "Cancel",
                      onPress: () => resolve("cancel"),
                      style: "cancel",
                    },
                  ],
                  { cancelable: false }
                );
              });

              if (userChoice === "cancel") {
                throw new Error(
                  "Submission cancelled by user due to large file size"
                );
              }
            }
          } catch (jsonError) {
            console.error("❌ Error stringifying request body:", jsonError);
            throw new Error(`Failed to prepare request: ${jsonError.message}`);
          }

          // Make the API request
          let response;
          let retryCount = 0;
          const maxRetries = 3;
          const timeout = 30000; // 30 second timeout for large request

          while (retryCount <= maxRetries) {
            try {
              console.log(`🔄 API attempt ${retryCount + 1}/${maxRetries + 1}`);

              // Use AbortController for timeout if supported
              const controller =
                typeof AbortController !== "undefined"
                  ? new AbortController()
                  : null;
              const timeoutId = controller
                ? setTimeout(() => controller.abort(), timeout)
                : null;

              response = await fetch(
                "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "Cache-Control": "no-cache",
                  },
                  body: jsonBody,
                  // Add timeout controls if available
                  ...(controller ? { signal: controller.signal } : {}),
                }
              );

              // Clear timeout if it was set
              if (timeoutId) clearTimeout(timeoutId);

              // If we got here, the request was successful
              console.log(
                `✅ Network request successful, status: ${response.status}`
              );
              break;
            } catch (networkError) {
              console.error(
                `❌ Network error (attempt ${retryCount + 1}/${
                  maxRetries + 1
                }):`,
                networkError
              );

              // Additional diagnostic info
              console.log(`🔍 Network error details:`, {
                message: networkError.message || "Unknown error",
                type: networkError.constructor.name,
                stack: networkError.stack
                  ? networkError.stack.split("\n")[0]
                  : "No stack trace",
              });

              // Check if we should retry
              if (retryCount === maxRetries) {
                console.log("❌ Maximum retry attempts reached");
                throw new Error(
                  `Network request failed after ${maxRetries + 1} attempts: ${
                    networkError.message || "Unknown error"
                  }. Check your internet connection and try again.`
                );
              }

              // Wait before retrying (exponential backoff)
              const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s...
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              retryCount++;
            }
          }

          console.log(`⏱️ Response received at: ${new Date().toISOString()}`);
          console.log(`📊 HTTP Status code: ${response.status}`);

          // Parse the response
          const responseText = await response.text();
          let result;

          try {
            result = JSON.parse(responseText);
            console.log("📋 Parsed response:", JSON.stringify(result, null, 2));
          } catch (parseError) {
            console.error("❌ Error parsing response:", parseError);
            console.log("Raw response text:", responseText);
            throw new Error(
              `Invalid response from server: ${parseError.message}`
            );
          }

          // Check for nested response structures
          if (result.body && typeof result.body === "string") {
            try {
              console.log(
                "Detected nested response body, parsing inner content"
              );
              result = JSON.parse(result.body);
              console.log(
                "📦 Parsed nested body:",
                JSON.stringify(result, null, 2)
              );
            } catch (e) {
              console.log("Inner body is not valid JSON, using as-is");
            }
          }

          // Check if the operation was successful, handling different response formats
          const isSuccess =
            result.success === true ||
            (result.statusCode &&
              result.statusCode >= 200 &&
              result.statusCode < 300) ||
            (result.body &&
              typeof result.body === "string" &&
              result.body.includes('"success":true'));

          if (!isSuccess) {
            // Get error details from response
            let errorMessage = "Unknown error occurred";

            if (result.error) {
              errorMessage = result.error;
            } else if (result.message && result.success === false) {
              errorMessage = result.message;
            } else if (result.body && typeof result.body === "string") {
              try {
                const bodyObj = JSON.parse(result.body);
                errorMessage = bodyObj.error || bodyObj.message || errorMessage;
              } catch (e) {
                // If we can't parse the body, use it as-is if it's a string
                errorMessage =
                  typeof result.body === "string" ? result.body : errorMessage;
              }
            }

            // Special handling for S3 permission errors
            if (
              errorMessage.includes(
                "not authorized to perform: s3:PutObject"
              ) ||
              errorMessage.includes("Failed to upload") ||
              errorMessage.includes("Access Denied")
            ) {
              // Check if the S3 error actually includes details
              console.error("❌ S3 permission error details:", errorMessage);

              // Ask user if they want to continue without file uploads
              const userChoice = await new Promise((resolve) => {
                Alert.alert(
                  "File Upload Error",
                  "Unable to upload files to the server due to permission issues. Files may be uploaded in the background later. Would you like to save the patient data anyway?",
                  [
                    {
                      text: "Save Patient Data",
                      onPress: () => resolve("continue"),
                    },
                    {
                      text: "Cancel",
                      onPress: () => resolve("cancel"),
                      style: "cancel",
                    },
                  ],
                  { cancelable: false }
                );
              });

              if (userChoice === "cancel") {
                throw new Error(
                  "Submission cancelled by user due to file upload permission error"
                );
              }

              // The files might be processed asynchronously by the Lambda, so we accept the partial success
              console.log(
                "⚠️ Continuing with potential file upload limitations"
              );

              // Mark diagnosis section as saved
              setSavedSections((prev) => {
                console.log("🔒 Marking diagnosis section as saved");
                return { ...prev, diagnosis: true };
              });

              // Show success message with warning - Changed to proceedToNextSection()
              Alert.alert(
                "Success with Limitations",
                "Patient data saved successfully. File uploads may complete in the background or might have limited availability.",
                [
                  {
                    text: "OK",
                    onPress: () => {
                      console.log("👆 Limited success alert OK button pressed");
                      console.log("👉 Proceeding to next section");
                      proceedToNextSection();
                    },
                  },
                ]
              );
              return;
            }

            // If we get here, it's a general error not related to S3 permissions
            throw new Error(errorMessage);
          }

          // If we got here, the operation was successful
          console.log("\n✅ SUBMISSION SUCCESSFUL");
          console.log(
            "-----------------------------------------------------------"
          );
          console.log("🎉 Patient added successfully!");

          // ENHANCED: Store the patient ID for future use
          let finalPatientId = permanentPatientId || result.patientId;
          if (result.patientId && result.patientId !== permanentPatientId) {
            console.log(
              `🔑 Updating patient ID from ${permanentPatientId} to ${result.patientId}`
            );
            setPermanentPatientId(result.patientId);
            finalPatientId = result.patientId;
          }

          // Mark the diagnosis section as saved
          setSavedSections((prev) => {
            console.log("🔒 Marking diagnosis section as saved");
            return { ...prev, diagnosis: true };
          });

          // Log file details from response if available
          if (result.fileDetails) {
            console.log(
              "📄 File details from server:",
              JSON.stringify(result.fileDetails, null, 2)
            );

            // Show additional info if some files are pending upload
            const hasLocalFiles = result.fileDetails.filesStoredLocally > 0;

            if (hasLocalFiles) {
              console.log("⚠️ Some files may be uploaded in the background");
            }
          }

          // Show success message and proceed to next section (which should be prescription)
          Alert.alert(
            "Success",
            result.fileDetails && result.fileDetails.filesStoredLocally > 0
              ? "Diagnosis information saved successfully! Some files may still be uploading in the background."
              : "Diagnosis information saved successfully!",
            [
              {
                text: "OK",
                onPress: async () => {
                  console.log("👆 Success alert OK button pressed");

                  // ENHANCED: Ensure diagnosis clearing has the correct patient ID
                  try {
                    // Store the final patient ID in AsyncStorage for the DiagnosisTab to use
                    if (finalPatientId) {
                      await AsyncStorage.setItem(
                        "current_patient_id",
                        finalPatientId
                      );
                      await AsyncStorage.setItem(
                        "lastSavedSessionId",
                        finalPatientId
                      );
                      console.log(
                        `🚩 Set current_patient_id to ${finalPatientId}`
                      );
                    }
                  } catch (error) {
                    console.error("❌ Error setting patient ID flags:", error);
                  }

                  // Call the diagnosis clearing function with enhanced patient ID handling
                  if (
                    diagnosisTabRef &&
                    diagnosisTabRef.current &&
                    diagnosisTabRef.current.handleSaveCompletion
                  ) {
                    console.log(
                      "🧹 Calling handleSaveCompletion on diagnosis tab"
                    );
                    const cleared =
                      diagnosisTabRef.current.handleSaveCompletion();
                    console.log(
                      `Diagnosis clearing result: ${
                        cleared ? "success" : "no action needed"
                      }`
                    );
                  } else if (
                    diagnosisTabRef &&
                    diagnosisTabRef.current &&
                    diagnosisTabRef.current.clearDiagnosisAfterSave
                  ) {
                    console.log(
                      "🧹 Calling clearDiagnosisAfterSave on diagnosis tab"
                    );
                    diagnosisTabRef.current.clearDiagnosisAfterSave();
                  } else {
                    console.warn(
                      "⚠️ diagnosisTabRef not available for clearing diagnosis"
                    );

                    // Fallback: update the patientData state directly and save to AsyncStorage
                    console.log(
                      "🧹 Directly clearing diagnosis through updateField"
                    );

                    // Save current diagnosis to history before clearing
                    if (patientData.diagnosis && finalPatientId) {
                      const timestamp = new Date().toISOString();
                      const historyItem = {
                        diagnosis: patientData.diagnosis,
                        date: timestamp,
                        formattedDate: formatDate(timestamp),
                        formattedTime: formatTime(timestamp),
                      };

                      try {
                        // Save to multiple AsyncStorage keys for better retrieval
                        await Promise.all([
                          AsyncStorage.setItem(
                            `diagnosis_last_saved_${finalPatientId}`,
                            JSON.stringify(historyItem)
                          ),
                          AsyncStorage.setItem(
                            `diagnosis_backup_${finalPatientId}_${Date.now()}`,
                            JSON.stringify(historyItem)
                          ),
                          AsyncStorage.setItem(
                            `diagnosis_cleared_at_${finalPatientId}`,
                            timestamp
                          ),
                        ]);
                        console.log(
                          "📝 Saved diagnosis history to AsyncStorage"
                        );
                      } catch (error) {
                        console.error(
                          "❌ Error saving diagnosis history:",
                          error
                        );
                      }
                    }

                    updateField("diagnosis", "");

                    // Set blocking flags
                    try {
                      const timestamp = Date.now().toString();
                      await Promise.all([
                        AsyncStorage.setItem(
                          "diagnosis_cleared_timestamp",
                          timestamp
                        ),
                        AsyncStorage.setItem("block_diagnosis_refetch", "true"),
                        AsyncStorage.setItem("clearDiagnosisFlag", "true"),
                      ]);
                      console.log(
                        "🚩 Set all diagnosis blocking flags in AsyncStorage"
                      );

                      // Clear flags after delay
                      setTimeout(async () => {
                        try {
                          await AsyncStorage.removeItem(
                            "block_diagnosis_refetch"
                          );
                          console.log(
                            "Removed blockDiagnosisRefetch flag after timeout"
                          );
                        } catch (error) {
                          console.error("Error removing block flag:", error);
                        }
                      }, 10000);
                    } catch (error) {
                      console.error(
                        "❌ Error setting diagnosis blocking flags:",
                        error
                      );
                    }
                  }

                  // Mark the section as saved after clearing
                  setSavedSections((prev) => {
                    if (!prev.diagnosis) {
                      console.log("🔒 Marking diagnosis section as saved");
                      return { ...prev, diagnosis: true };
                    }
                    return prev;
                  });

                  // Then proceed to next section
                  console.log("👉 Proceeding to next section");
                  proceedToNextSection();
                },
              },
            ]
          );
        } catch (error) {
          console.log("\n❌ SUBMISSION ERROR");
          console.log(
            "-----------------------------------------------------------"
          );
          console.error("💥 Error details:", error);
          console.error(
            "💬 Error message:",
            error instanceof Error ? error.message : "Unknown error"
          );
          console.error(
            "📚 Error stack:",
            error instanceof Error ? error.stack : "Stack unavailable"
          );

          // Create a more user-friendly error message based on error type
          let errorMessage =
            error instanceof Error ? error.message : "Please try again.";

          // Check for specific network errors and improve messages
          if (errorMessage.includes("Network request failed")) {
            errorMessage =
              "Unable to connect to server. Please check your internet connection and try again.";
          } else if (errorMessage.includes("timeout")) {
            errorMessage =
              "Request timed out. The server took too long to respond. Please try again later.";
          } else if (errorMessage.includes("abort")) {
            errorMessage = "Request was cancelled. Please try again.";
          }

          Alert.alert(
            "Error",
            `Failed to save diagnosis information. ${errorMessage}`
          );
        } finally {
          console.log("\n🏁 SUBMISSION PROCESS COMPLETED");
          console.log(`⏱️ Completed at: ${new Date().toISOString()}`);
          console.log(
            "===========================================================\n"
          );
          setIsSubmitting(false);
        }
        return;
      }
    } else {
      // The prefillMode logic - for updating existing patients
      setIsSubmitting(true);

      try {
        console.log("🔄 Operating in prefill mode");
        // Check connection before proceeding
        const isConnected = await checkConnection();
        if (!isConnected) {
          console.error("❌ No internet connection detected in prefill mode");
          throw new Error(
            "No internet connection. Please check your network and try again."
          );
        }

        // Create an update object based on the current tab with enhanced update flags
        let updateData = {
          patientId: patient.patientId,
          updateMode: true, // This is a boolean true
          updateSection: activeSection,
          isUpdate: "true", // Add a redundant string version to handle potential type conversion issues
        };

        console.log(
          `🔄 Updating ${activeSection} section for patient: ${patient.patientId}`
        );
        console.log(`🔍 UpdateMode type: ${typeof updateData.updateMode}`); // Debug log to verify type
        console.log(`🔍 IsUpdate value: ${updateData.isUpdate}`); // Debug log for redundant flag

        // Add section-specific data to the update
        switch (activeSection) {
          case "basic":
            updateData = {
              ...updateData,
              name: patientData.name || "", // Prevent undefined values
              age: patientData.age || "0", // Prevent undefined values
              sex: patientData.sex || "Male", // Provide default
              mobile: patientData.mobile || "", // Add mobile
              address: patientData.address || "", // Add address
            };
            console.log("📝 Basic info update data prepared:", updateData);
            break;

          case "clinical":
            // Check for any text in the new history entry field via AsyncStorage
            if (patient?.patientId) {
              try {
                const newHistoryKey = `new_history_input_${patient.patientId}`;
                const newHistoryText = await AsyncStorage.getItem(
                  newHistoryKey
                );

                if (newHistoryText && newHistoryText.trim() !== "") {
                  console.log(
                    `🔍 Found text in new history entry field: "${newHistoryText.substring(
                      0,
                      30
                    )}..."`
                  );

                  // Include this text directly in the medical history with a timestamp
                  await includeNewHistoryEntry(
                    patient.patientId,
                    newHistoryText
                  );

                  // Set flag that we're including new history
                  setIsSavingHistory(true);

                  // Clear the new history entry AsyncStorage
                  await AsyncStorage.removeItem(newHistoryKey);
                  console.log(
                    `✅ Cleared new history entry field from AsyncStorage: ${newHistoryKey}`
                  );
                } else {
                  console.log("📋 No text found in new history entry field");
                }
              } catch (error) {
                console.error(
                  "❌ Error checking for new history entry field text:",
                  error
                );
              }
            }

            // Check for pending history before submission
            if (patient?.patientId) {
              const historyIncluded = await checkAndIncludePendingHistory(
                patient.patientId
              );
              if (historyIncluded) {
                console.log(
                  "📋 Pending history was found and included in prefill mode submission"
                );

                // Set flag that we're including history
                setIsSavingHistory(true);
              }
            }

            // CRITICAL FIX: Get the most up-to-date medical history directly from the ref
            // This bypasses React's asynchronous state updates
            let updatedMedicalHistory = patientData.medicalHistory || "";

            // Try to get the latest medical history from the clinicalTabRef
            if (
              clinicalTabRef &&
              clinicalTabRef.current &&
              clinicalTabRef.current.getLatestMedicalHistory
            ) {
              const latestHistory =
                clinicalTabRef.current.getLatestMedicalHistory();
              if (latestHistory) {
                console.log(
                  `📊 Retrieved latest medical history from ref: "${latestHistory.substring(
                    0,
                    30
                  )}..."`
                );
                updatedMedicalHistory = latestHistory;
              }
            }

            console.log(
              `📊 Final medical history for API request: "${updatedMedicalHistory.substring(
                0,
                30
              )}..."`
            );
            console.log(
              `📊 Medical history length: ${updatedMedicalHistory.length} characters`
            );

            // Include clinicalParameters with new timestamp and create history flag
            updateData = {
              ...updateData,
              // Use the most up-to-date medical history directly from ref
              medicalHistory: updatedMedicalHistory,
              // FORCE these flags to ensure history is processed
              pendingHistoryIncluded: true,
              forceHistoryUpdate: true,
              diagnosis: patientData.diagnosis || "",
              prescription: patientData.prescription || "",
              treatment: patientData.treatment || "",
              reports: patientData.reports || "",
              advisedInvestigations: patientData.advisedInvestigations || "",
              clinicalParameters: {
                ...clinicalParameters,
                // Ensure unique timestamp for history tracking
                date: new Date().toISOString(),
              },
              // Include a flag to create parameter history
              createParameterHistory: true,
            };

            // Process and include report files
            if (reportFiles && reportFiles.length > 0) {
              console.log(
                `🔍 CLINICAL UPDATE: Found ${reportFiles.length} report files to process`
              );

              // Log file details for debugging
              reportFiles.forEach((file, idx) => {
                console.log(
                  `📄 File ${idx + 1}/${reportFiles.length}: Name: ${
                    file.name || "unnamed"
                  }, Type: ${file.type || "unknown"}, URI: ${
                    file.uri ? file.uri.substring(0, 30) + "..." : "none"
                  }`
                );
                console.log(
                  `   Category: ${file.category || "uncategorized"}, Size: ${
                    file.size || "unknown"
                  }, Already uploaded: ${isFileAlreadyUploaded(file)}`
                );
              });

              // Process files to ensure they all have base64 data
              try {
                console.log("🔄 Processing report files for clinical update");

                // Show processing message to user for large uploads
                if (reportFiles.length > 3) {
                  Alert.alert(
                    "Processing Files",
                    `Preparing ${reportFiles.length} file(s) for upload. This may take a moment...`,
                    [{ text: "OK" }]
                  );
                }

                const processedReportFiles = await ensureFilesHaveBase64(
                  reportFiles
                );
                console.log(
                  `✅ Successfully processed ${processedReportFiles.length} files for clinical update`
                );

                // Include the processed files in the update data
                updateData.reportFiles = processedReportFiles;

                // Log the first file's base64 data length for debugging
                if (
                  processedReportFiles.length > 0 &&
                  processedReportFiles[0].base64Data
                ) {
                  console.log(
                    `📊 First file base64 data length: ${processedReportFiles[0].base64Data.length} chars`
                  );
                }
              } catch (fileError) {
                console.error(
                  `❌ Error processing report files for clinical update: ${fileError.message}`
                );
                console.error(fileError.stack);
                Alert.alert(
                  "Warning",
                  "There was an issue processing some files. They may not be uploaded correctly."
                );
              }
            } else {
              console.log("📄 No report files to include in clinical update");
            }

            console.log(
              "📝 Clinical info update data prepared:",
              JSON.stringify({
                ...updateData,
                clinicalParameters: "object",
                hasReportFiles: !!updateData.reportFiles,
                reportFilesCount: updateData.reportFiles?.length || 0,
              })
            );
            break;

          case "prescription":
            // Process medications to remove any undefined values
            const processedMedications = medications.map((med) => ({
              name: med.name || "",
              duration: med.duration || "",
              timing: med.timing || "",
              timingValues: med.timingValues || "{}",
              specialInstructions: med.specialInstructions || "", // Include per-medication special instructions
              datePrescribed: med.datePrescribed || new Date().toISOString(), // Ensure date is included
            }));

            updateData = {
              ...updateData,
              medications: processedMedications,
            };
            console.log("📝 Prescription update data prepared");
            console.log(`   Medications: ${processedMedications.length}`);
            break;

          case "diagnosis":
            console.log("\n🔬 DIAGNOSIS UPDATE DEBUGGING");
            console.log(`Current diagnosis value: "${patientData.diagnosis}"`);

            // Ensure reportData has no undefined values
            const cleanReportData = {};
            Object.keys(reportData).forEach((key) => {
              cleanReportData[key] = reportData[key] || "";
            });

            // Process report files with base64 data
            let processedReportFiles = [];
            if (reportFiles.length > 0) {
              console.log(
                `📁 Processing ${reportFiles.length} files for update`
              );
              processedReportFiles = await ensureFilesHaveBase64(reportFiles);
              console.log(
                `✅ Processed ${processedReportFiles.length} files for update`
              );
            }

            // CRITICAL FIX: Always explicitly include diagnosis field
            // ADD THESE LINES FOR THE DIAGNOSIS HISTORY FEATURE:
            updateData = {
              ...updateData,
              updateSection: "diagnosis",
              reportData: cleanReportData,
              // IMPORTANT: Explicitly include diagnosis field from patient data
              diagnosis: patientData.diagnosis, // This is the key fix!
              advisedInvestigations: patientData.advisedInvestigations,
              // Include processed report files if any
              ...(processedReportFiles.length > 0
                ? { reportFiles: processedReportFiles }
                : {}),
              // ADD THESE LINES TO ENSURE DIAGNOSIS IS ADDED TO HISTORY
              createDiagnosisHistory: true,
              diagnosisTimestamp: new Date().toISOString(),
            };

            console.log(
              "📊 DIAGNOSIS UPDATE: Final diagnosis value in payload:",
              updateData.diagnosis
            );
            break;

          default:
            return Alert.alert("Error", `Unknown section: ${activeSection}`);
        }

        console.log("\n🌐 SENDING UPDATE API REQUEST");
        console.log(
          "-----------------------------------------------------------"
        );
        console.log(
          "📡 Endpoint: https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction"
        );

        // Stringify with replacer function to handle undefined values
        const jsonBody = JSON.stringify(updateData, (key, value) => {
          return value === undefined ? null : value; // Replace undefined with null
        });

        console.log(`📊 Request body sample: ${jsonBody.substring(0, 200)}...`);
        console.log(
          `   updateMode type in JSON: ${typeof JSON.parse(jsonBody)
            .updateMode}`
        );

        // Enhanced debugging logs to help diagnose API issues
        console.log("🔄 Raw request body being sent:", jsonBody);
        console.log("🔄 Request data type check:", {
          patientId: typeof updateData.patientId,
          updateMode: typeof updateData.updateMode,
          updateModeValue: updateData.updateMode,
          isUpdate: updateData.isUpdate,
          updateSection: typeof updateData.updateSection,
        });

        // Make the API request with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        const timeout = 10000; // 10 second timeout

        while (retryCount <= maxRetries) {
          try {
            console.log(`🔄 API attempt ${retryCount + 1}/${maxRetries + 1}`);

            // Use AbortController for timeout if supported
            const controller =
              typeof AbortController !== "undefined"
                ? new AbortController()
                : null;
            const timeoutId = controller
              ? setTimeout(() => controller.abort(), timeout)
              : null;

            response = await fetch(
              "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  "Cache-Control": "no-cache", // Prevent caching
                },
                body: jsonBody,
                // Add timeout controls if available
                ...(controller ? { signal: controller.signal } : {}),
              }
            );

            // Clear timeout if it was set
            if (timeoutId) clearTimeout(timeoutId);

            // If we got here, the request was successful
            console.log(
              `✅ Network request successful, status: ${response.status}`
            );
            break;
          } catch (networkError) {
            console.error(
              `❌ Network error (attempt ${retryCount + 1}/${maxRetries + 1}):`,
              networkError
            );

            // Additional diagnostic info
            console.log(`🔍 Network error details:`, {
              message: networkError.message || "Unknown error",
              type: networkError.constructor.name,
              stack: networkError.stack
                ? networkError.stack.split("\n")[0]
                : "No stack trace",
            });

            // Check if we should retry
            if (retryCount === maxRetries) {
              console.log("❌ Maximum retry attempts reached");
              throw new Error(
                `Network request failed after ${maxRetries + 1} attempts: ${
                  networkError.message || "Unknown error"
                }. Check your internet connection and try again.`
              );
            }

            // Wait before retrying (exponential backoff)
            const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, etc.
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            retryCount++;
          }
        }

        console.log(`⏱️ Response received at: ${new Date().toISOString()}`);
        console.log(`📊 HTTP Status code: ${response.status}`);

        // Parse the response
        const responseText = await response.text();
        let result;

        try {
          result = JSON.parse(responseText);
          console.log("📋 Parsed response:", JSON.stringify(result, null, 2));
        } catch (parseError) {
          console.error("❌ Error parsing response:", parseError);
          throw new Error(
            `Invalid response from server: ${parseError.message}`
          );
        }

        // Check for nested response
        if (result.body && typeof result.body === "string") {
          try {
            const parsedBody = JSON.parse(result.body);
            console.log(
              "📦 Parsed nested response body:",
              JSON.stringify(parsedBody, null, 2)
            );
            result = parsedBody;
          } catch (e) {
            console.log("Inner body is not valid JSON, using as-is");
          }
        }

        // Check if the operation was successful
        const isSuccess =
          result.success === true ||
          (result.statusCode &&
            result.statusCode >= 200 &&
            result.statusCode < 300) ||
          (result.body &&
            result.body.includes &&
            result.body.includes('"success":true'));

        if (!isSuccess) {
          let errorMessage = "Unknown error occurred";

          if (result.error) {
            errorMessage = result.error;
          } else if (result.message && result.success === false) {
            errorMessage = result.message;
          } else if (
            typeof result.body === "string" &&
            result.body.includes("error")
          ) {
            // Try to extract error from body string
            try {
              const bodyObj = JSON.parse(result.body);
              errorMessage = bodyObj.error || bodyObj.message || errorMessage;
            } catch (e) {
              // If we can't parse the body, use it as-is if it's a string
              errorMessage =
                typeof result.body === "string" ? result.body : errorMessage;
            }
          }

          throw new Error(errorMessage);
        }

        // Reset any history flags after successful save
        setIsSavingHistory(false);

        // Handle success based on which section was updated
        let successMessage = "";
        let nextAction = () => navigation.goBack();

        switch (activeSection) {
          case "basic":
            successMessage = "Basic information updated successfully!";
            nextAction = () => switchSection("clinical");
            break;
          case "clinical":
            successMessage = "Clinical information updated successfully!";
            nextAction = () => switchSection("diagnosis");

            // Clear any pending history or new history data from AsyncStorage after success
            if (patient?.patientId) {
              try {
                await AsyncStorage.removeItem(
                  `new_history_input_${patient.patientId}`
                );
                await AsyncStorage.removeItem(
                  `pending_history_${patient.patientId}`
                );
                console.log(
                  "✅ Cleared history input storage after successful update"
                );
              } catch (error) {
                console.error("❌ Error clearing history storage:", error);
              }
            }
            break;
          case "prescription":
            successMessage = "Prescription updated successfully!";
            nextAction = () => switchSection("diagnosis");
            break;
          case "diagnosis":
            successMessage = "Diagnosis information updated successfully!";
            nextAction = () => switchSection("prescription"); // Navigate to prescription tab

            // Clear the diagnosis history cache to ensure fresh data on next view
            try {
              const cacheKey = `diagnosis_history_${patient.patientId}`;
              await AsyncStorage.removeItem(cacheKey);
              console.log("✅ Cleared diagnosis history cache after update");
            } catch (error) {
              console.error(
                "❌ Error clearing diagnosis history cache:",
                error
              );
            }
            break;
        }

        if (activeSection === "diagnosis") {
          console.log(
            "🧹 Prefill mode - clearing diagnosis after successful update"
          );

          // Call the diagnosis clearing function
          if (
            diagnosisTabRef &&
            diagnosisTabRef.current &&
            diagnosisTabRef.current.clearDiagnosisAfterSave
          ) {
            console.log("🧹 Using diagnosisTabRef to clear diagnosis");
            diagnosisTabRef.current.clearDiagnosisAfterSave();
          } else {
            console.warn("⚠️ diagnosisTabRef not available in prefill mode");

            // Fallback: update the patientData state directly
            console.log(
              "🧹 Directly clearing diagnosis through updateField in prefill mode"
            );

            // Store current diagnosis in history first through AsyncStorage
            try {
              const timestamp = new Date().toISOString();
              const diagnosisHistoryItem = {
                diagnosis: patientData.diagnosis,
                date: timestamp,
              };

              // Store this history item temporarily
              AsyncStorage.setItem(
                `diagnosis_history_temp_${patient.patientId}`,
                JSON.stringify(diagnosisHistoryItem)
              );
              console.log("📝 Stored diagnosis history item in AsyncStorage");

              // Then clear the diagnosis field
              updateField("diagnosis", "");
            } catch (error) {
              console.error(
                "❌ Error handling diagnosis history in prefill mode:",
                error
              );
              // Still clear the field even if history saving fails
              updateField("diagnosis", "");
            }
          }
        }

        // Check if we got a new patient ID in the response, which would indicate creation instead of update
        if (result.patientId && result.patientId !== patient.patientId) {
          console.warn(
            "⚠️ WARNING: API returned a new patient ID, indicating creation instead of update"
          );
          console.warn(
            `   Expected: ${patient.patientId}, Received: ${result.patientId}`
          );

          Alert.alert(
            "Update Warning",
            "The system may have created a new record instead of updating the existing one. Please check your patient records.",
            [{ text: "OK", onPress: nextAction }]
          );
        } else {
          // Show success message
          Alert.alert("Success", successMessage, [
            { text: "OK", onPress: nextAction },
          ]);
        }
      } catch (error) {
        console.error("❌ Error updating patient data:", error);

        // Create a more user-friendly error message based on error type
        let errorMessage = error.message || "Please try again.";

        // Check for specific network errors and improve messages
        if (error.message && error.message.includes("Network request failed")) {
          errorMessage =
            "Unable to connect to server. Please check your internet connection and try again.";
        } else if (error.message && error.message.includes("timeout")) {
          errorMessage =
            "Request timed out. The server took too long to respond. Please try again later.";
        } else if (error.message && error.message.includes("abort")) {
          errorMessage = "Request was cancelled. Please try again.";
        }

        Alert.alert("Error", `Failed to update patient data. ${errorMessage}`);
      } finally {
        setIsSubmitting(false);
        setIsSavingHistory(false); // Reset any history flags
        console.log("🏁 Prefill mode submission completed");
      }
    }
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case "basic":
        return (
          <KeyboardAwareScrollView>
            <BasicTab
              patientData={patientData}
              errors={errors}
              updateField={updateField}
            />
          </KeyboardAwareScrollView>
        );
      case "clinical":
        return (
          <KeyboardAwareScrollView>
            <ClinicalTab
              ref={clinicalTabRef}
              patientData={patientData}
              updateField={updateField}
              reportFiles={reportFiles}
              clinicalParameters={clinicalParameters}
              setClinicalParameters={setClinicalParameters}
              showDatePicker={showDatePicker}
              setShowDatePicker={setShowDatePicker}
              tempDate={tempDate}
              setTempDate={setTempDate}
              handleDateChange={handleDateChange}
              pickDocument={pickDocument}
              removeReportFile={removeReportFile}
              isFileAlreadyUploaded={isFileAlreadyUploaded}
              savedSections={savedSections}
              patientId={patient?.patientId || permanentPatientId}
              prefillMode={prefillMode}
              hideBasicTab={hideBasicTab}
              saveNewHistoryEntryToStorage={saveNewHistoryEntryToStorage}
            />
          </KeyboardAwareScrollView>
        );
      case "diagnosis":
        return (
          <KeyboardAwareScrollView>
            <DiagnosisTab
              patientData={patientData}
              updateField={updateField}
              patientId={patient?.patientId}
              tempPatientId={permanentPatientId} // Make sure this matches the prop name expected in DiagnosisTab
              prefillMode={prefillMode}
              navigation={navigation}
              route={{
                ...route,
                params: {
                  ...route?.params,
                  diagnosisTabRef: diagnosisTabRef,
                },
              }}
            />
          </KeyboardAwareScrollView>
        );
      case "prescription":
        return (
          <KeyboardAwareScrollView>
            <PrescriptionTab
              patientData={patientData}
              patient={patient}
              medications={medications}
              setMedications={setMedications}
              expandedMedications={expandedMedications}
              setExpandedMedications={setExpandedMedications}
              expandedGroups={expandedGroups}
              setExpandedGroups={setExpandedGroups}
              newPrescriptionIndices={newPrescriptionIndices}
              setNewPrescriptionIndices={setNewPrescriptionIndices}
              reportFiles={reportFiles}
              handleSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              getSubmitButtonText={getSubmitButtonText}
              prefillMode={prefillMode}
              initialTab={initialTab}
              // ADD THIS LINE: Pass permanentPatientId for new patients
              tempPatientId={permanentPatientId}
            />
          </KeyboardAwareScrollView>
        );
      default:
        return null;
    }
  };

  // Add handleParameterUpdate function
  const handleParameterUpdate = (field: string, value: string) => {
    setClinicalParameters((prev) => ({
      ...prev,
      [field]: value,
      date: new Date(), // Update timestamp when parameters change
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#0070D6" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {prefillMode ? "Edit Patient" : "New Patient"}
          </Text>
          {prefillMode && patient && (
            <Text style={styles.patientSubtitle}>
              {patient.name} • {patient.age} years
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, isSubmitting && styles.saveButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>{getSubmitButtonText()}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {!hideBasicTab && (
          <TouchableOpacity
            style={[styles.tab, activeSection === "basic" && styles.activeTab]}
            onPress={() => switchSection("basic")}
          >
            <Text
              style={[
                styles.tabText,
                activeSection === "basic" && styles.activeTabText,
              ]}
            >
              Basic
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.tab, activeSection === "clinical" && styles.activeTab]}
          onPress={() => switchSection("clinical")}
        >
          <Text
            style={[
              styles.tabText,
              activeSection === "clinical" && styles.activeTabText,
            ]}
          >
            Clinical
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeSection === "diagnosis" && styles.activeTab,
          ]}
          onPress={() => switchSection("diagnosis")}
        >
          <Text
            style={[
              styles.tabText,
              activeSection === "diagnosis" && styles.activeTabText,
            ]}
          >
            Diagnosis
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeSection === "prescription" && styles.activeTab,
          ]}
          onPress={() => switchSection("prescription")}
        >
          <Text
            style={[
              styles.tabText,
              activeSection === "prescription" && styles.activeTabText,
            ]}
          >
            Prescription
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contentContainer}>{renderActiveSection()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingTop: 50, // Set consistent padding for both iOS and Android
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
  },
  saveButton: {
    backgroundColor: "#0070D6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#0070D6",
  },
  tabText: {
    fontSize: 14,
    color: "#4A5568",
  },
  activeTabText: {
    color: "#0070D6",
    fontWeight: "600",
  },
  contentContainer: {
    flex: 1,
  },
  patientSubtitle: {
    fontSize: 14,
    color: "#718096",
    marginTop: 2,
    textAlign: "center",
  },
});

export default NewPatientForm;
