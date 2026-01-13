import React, { useState, useRef, useEffect } from "react";
import { API_ENDPOINTS } from "../../Config";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
  Platform,
  Share,
  PermissionsAndroid,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

// Import file system and media library with error handling
let FileSystem: any = null;
let MediaLibrary: any = null;
let captureRef: any = null;
try {
  FileSystem = require("expo-file-system");
  MediaLibrary = require("expo-media-library");
  const ViewShot = require("react-native-view-shot");
  captureRef = ViewShot.captureRef;
  console.log("✅ All file dependencies loaded successfully");
} catch (error) {
  console.log("❌ Error loading file dependencies:", error);
  console.log("📱 Some save functionality may not work without these packages");
}

const { width } = Dimensions.get("window");

// API Configuration
const API_BASE_URL =
  API_ENDPOINTS.PATIENT_PROCESSOR;

// Import type definitions
import type {
  Patient,
  DiagnosisHistoryEntry,
  InvestigationsHistoryEntry,
  FitnessCertificateProps,
  FormData,
  OpinionType,
} from "./Types/FitnessCertificateTypes";
// Import utility functions
import {
  generatePrescriptionFromMedications,
  getAndroidAPILevel,
  checkDependencies as checkDependenciesUtil,
} from "./Utils/CertificateUtils";
// Import data fetching service
import {
  fetchPatientData as fetchPatientDataService,
  fetchDiagnosisHistory as fetchDiagnosisHistoryService,
  fetchInvestigationsHistory as fetchInvestigationsHistoryService,
} from "./Services/FitnessCertificateDataService";



// Import backend persistence service
import { saveFitnessCertificateToBackend } from "./Services/FitnessCertificateBackendService";

const FitnessCertificate: React.FC<FitnessCertificateProps> = ({
  navigation,
  route,
}) => {
  const { patient } = route.params;
  const viewShotRef = useRef<View>(null);

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // API Data states
  const [patientData, setPatientData] = useState<Patient | null>(null);
  const [diagnosisHistory, setDiagnosisHistory] = useState<
    DiagnosisHistoryEntry[]
  >([]);
  const [investigationsHistory, setInvestigationsHistory] = useState<
    InvestigationsHistoryEntry[]
  >([]);

  // Data loading states
  const [dataLoadingStatus, setDataLoadingStatus] = useState({
    patient: false,
    diagnosis: false,
    investigations: false,
  });

  // Dropdown options for surgery fitness only
  const surgeryFitnessOptions = [
    "Fit for surgery under general anaesthesia",
    "Fit for surgery under spinal anaesthesia",
    "Fit for surgery under local anaesthesia",
    "Fit for minor surgery only",
    "Not fit for surgery - cardiac evaluation needed",
    "Not fit for surgery - pulmonary evaluation needed",
    "Fitness reserved pending investigations",
  ];

  // Form state
  const [formData, setFormData] = useState<FormData>({
    // Patient basic info (pre-filled)
    patientName: patient?.name || "",
    patientAge: patient?.age?.toString() || "",
    patientSex: patient?.sex || "",
    patientId: patient?.patientId || "",

    // Medical Opinion - Modified
    opinion: "",
    selectedOpinionType: null,
    surgeryFitnessOption: "",
    medicationModificationText: "", // Changed from option to text
    fitnessReservedText: "", // Changed from option to text

    // Clinical Assessment
    pastHistory: "",
    cardioRespiratorySymptoms: "No significant cardio-respiratory symptoms",

    // Vitals
    bloodPressure: "",
    heartRate: "",
    temperature: "",
    respiratoryRate: "",
    oxygenSaturation: "",

    // Investigations
    ecgFindings: "Normal ECG",
    echoFindings: "Normal Echo study",
    cxrFindings: "Clear lung fields",
    labValues: "",

    // Additional Notes
    recommendations: "",
    followUpRequired: false,
    validityPeriod: "30 days",

    // New fields added
    preOpEvaluationForm: "",
    referredForPreOp: "",
    cardioRespiratoryFunction: "Normal",
    syE: "Normal",
    ecgField: "Normal",
    echoField: "Normal",
    cxrField: "Normal",

    // Latest data from API
    latestPrescription: "",
    latestInvestigations: "",
  });

  const [showDropdown, setShowDropdown] = useState<{
    surgery: boolean;
  }>({
    surgery: false,
  });

  // Handle template data loading from History (Phase 3: Copy-to-New)
  useEffect(() => {
    if (route.params?.templateData) {
      console.log("📋 Loading certificate template...");
      const { templateData } = route.params;

      // Destructure to remove ID and timestamps to ensure new record creation
      const { certificateId, createdAt, ...cleanTemplate } = templateData as any;

      setFormData((prev) => ({
        ...prev,
        ...cleanTemplate,
        // Crucial: Restore current patient details to match current context
        patientName: patient?.name || prev.patientName,
        patientAge: patient?.age?.toString() || prev.patientAge,
        patientSex: patient?.sex || prev.patientSex,
        patientId: patient?.patientId || prev.patientId,
      }));

      Alert.alert(
        "Template Loaded",
        "Certificate data has been copied from history. Please review details before generating."
      );

      // Clear parameter to avoid reloading on re-renders
      navigation.setParams({ templateData: undefined });
    }
  }, [route.params?.templateData, patient, navigation]);

  // API Functions - wrappers that call service and manage state
  const fetchPatientData = async (patientId: string) => {
    setDataLoadingStatus((prev) => ({ ...prev, patient: true }));
    const result = await fetchPatientDataService(API_BASE_URL, patientId);
    if (result) {
      setPatientData(result);
    }
    setDataLoadingStatus((prev) => ({ ...prev, patient: false }));
    return result;
  };

  const fetchDiagnosisHistory = async (patientId: string) => {
    setDataLoadingStatus((prev) => ({ ...prev, diagnosis: true }));
    const result = await fetchDiagnosisHistoryService(API_BASE_URL, patientId);
    if (result.length > 0) {
      setDiagnosisHistory(result);
    }
    setDataLoadingStatus((prev) => ({ ...prev, diagnosis: false }));
    return result;
  };

  const fetchInvestigationsHistory = async (patientId: string) => {
    setDataLoadingStatus((prev) => ({ ...prev, investigations: true }));
    const result = await fetchInvestigationsHistoryService(API_BASE_URL, patientId);
    if (result.length > 0) {
      setInvestigationsHistory(result);
    }
    setDataLoadingStatus((prev) => ({ ...prev, investigations: false }));
    return result;
  };

  // Update loadPatientDataAndHistory function
  const loadPatientDataAndHistory = async () => {
    if (!patient?.patientId) {
      console.warn("⚠️ No patient ID provided");
      return;
    }

    setIsLoadingData(true);

    try {
      console.log("🚀 Loading patient data and history...");

      // Fetch all data concurrently
      const [patientInfo, diagHistory, invHistory] = await Promise.all([
        fetchPatientData(patient.patientId),
        fetchDiagnosisHistory(patient.patientId),
        fetchInvestigationsHistory(patient.patientId),
      ]);

      // Process past medical history
      let pastMedicalHistory = "";
      if (patientInfo?.medicalHistory) {
        pastMedicalHistory = patientInfo.medicalHistory;
        console.log("💊 Using patient's medical history");
      } else {
        console.log("💊 No medical history available");
      }

      // Process latest prescription
      let latestPrescription = "";
      if (patientInfo?.generatedPrescription) {
        latestPrescription = patientInfo.generatedPrescription;
        console.log("💊 Using generated prescription");
      } else if (
        patientInfo?.medications &&
        patientInfo.medications.length > 0
      ) {
        latestPrescription = generatePrescriptionFromMedications(
          patientInfo.medications
        );
        console.log("💊 Generated prescription from medications");
      } else {
        console.log("💊 No prescription data available");
      }

      // Process latest investigations
      let latestInvestigations = "";
      if (invHistory && invHistory.length > 0) {
        // Sort by timestamp descending to get the latest
        const sortedHistory = [...invHistory].sort(
          (a, b) => b.timestamp - a.timestamp
        );
        latestInvestigations = sortedHistory[0].advisedInvestigations || "";
        console.log("🔬 Using latest investigations from history");
      } else if (patientInfo?.advisedInvestigations) {
        latestInvestigations = patientInfo.advisedInvestigations;
        console.log("🔬 Using patient's current investigations");
      } else {
        console.log("🔬 No investigations data available");
      }

      // Update form data with API data
      setFormData((prev) => ({
        ...prev,
        patientName: patientInfo?.name || prev.patientName,
        patientAge: patientInfo?.age?.toString() || prev.patientAge,
        patientSex: patientInfo?.sex || prev.patientSex,
        pastHistory: pastMedicalHistory,
        latestPrescription: latestPrescription,
        latestInvestigations: latestInvestigations,
        // Auto-populate the text fields
        medicationModificationText: latestPrescription,
        fitnessReservedText: latestInvestigations,
      }));

      console.log("🎉 Successfully loaded patient data and history");
      console.log(`📊 Data summary:
        - Patient: ${patientInfo ? "✅" : "❌"}
        - Diagnosis entries: ${diagHistory?.length || 0}
        - Investigation entries: ${invHistory?.length || 0}
        - Medical History: ${pastMedicalHistory ? "✅" : "❌"}
        - Prescription: ${latestPrescription ? "✅" : "❌"}
        - Investigations: ${latestInvestigations ? "✅" : "❌"}`);
    } catch (error) {
      console.error("❌ Error loading patient data:", error);
      Alert.alert(
        "Data Loading Error",
        "Some patient data could not be loaded from the server. You can still create the certificate with available information."
      );
    } finally {
      setIsLoadingData(false);
      setDataLoadingStatus({
        patient: false,
        diagnosis: false,
        investigations: false,
      });
    }
  };



  // Effect to load data when component mounts
  useEffect(() => {
    loadPatientDataAndHistory();
  }, [patient?.patientId]);

  const updateFormData = (
    field: keyof FormData,
    value: string | boolean | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Update handleOpinionTypeSelect function
  const handleOpinionTypeSelect = (type: FormData["selectedOpinionType"]) => {
    updateFormData("selectedOpinionType", type);

    // Auto-populate based on type and available data
    if (type === "medication_modification" && formData.latestPrescription) {
      updateFormData("medicationModificationText", formData.latestPrescription);
      console.log(
        "🔄 Auto-populated medication modification with prescription data"
      );
    } else if (type === "fitness_reserved" && formData.latestInvestigations) {
      updateFormData("fitnessReservedText", formData.latestInvestigations);
      console.log(
        "🔄 Auto-populated fitness reserved with investigations data"
      );
    }

    // Only show dropdown for surgery fitness
    setShowDropdown({
      surgery: type === "surgery_fitness",
    });
  };

  const handleDropdownSelect = (field: keyof FormData, value: string) => {
    updateFormData(field, value);
    // Close dropdown
    setShowDropdown({
      surgery: false,
    });
  };

  // Wrapper for checkDependencies that passes module references
  const checkDependencies = (): boolean => {
    return checkDependenciesUtil(FileSystem, MediaLibrary, captureRef);
  };

  // Request permissions with timeout and better error handling
  const requestPermissions = async (): Promise<boolean> => {
    try {
      console.log("🔐 Requesting permissions...");
      console.log(
        "📱 Platform:",
        Platform.OS,
        "API Level:",
        getAndroidAPILevel()
      );

      if (Platform.OS === "android") {
        const apiLevel = getAndroidAPILevel();
        console.log("📱 Android API Level:", apiLevel);

        // For Android 10+ (API 29+), we don't need storage permissions for app-specific directories
        if (apiLevel >= 29) {
          console.log("✅ Android 10+ detected, skipping storage permissions");
        } else {
          console.log(
            "📱 Android < 10 detected, requesting storage permissions"
          );

          try {
            // Add timeout to permission request
            const permissionPromise = PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            ]);

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Permission request timeout")),
                10000
              )
            );

            const grantedResult = await Promise.race([
              permissionPromise,
              timeoutPromise,
            ]);

            const granted = grantedResult as any;
            console.log("📱 Android permissions result:", granted);

            const writeGranted =
              granted[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] ===
              "granted";
            const readGranted =
              granted[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] ===
              "granted";

            if (!writeGranted || !readGranted) {
              console.log("❌ Android storage permissions denied");
              Alert.alert(
                "Permission Required",
                "Storage permission is required to save the certificate. Please grant permission in settings."
              );
              return false;
            }

            console.log("✅ Android storage permissions granted");
          } catch (permError) {
            console.warn("⚠️ Storage permission request failed:", permError);
            console.log(
              "📱 Continuing without storage permissions (modern Android handles this)"
            );
          }
        }
      }

      // Request media library permissions for Expo
      console.log("📚 Requesting media library permissions...");

      try {
        const mediaPermissionPromise = MediaLibrary.requestPermissionsAsync();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Media permission timeout")), 10000)
        );

        const { status } = await Promise.race([
          mediaPermissionPromise,
          timeoutPromise,
        ]);
        console.log("📚 Media library permission status:", status);

        if (status !== "granted") {
          console.log("❌ Media library permission denied");
          Alert.alert(
            "Permission Required",
            "Media library permission is required to save the certificate to photos/downloads."
          );
          return false;
        }

        console.log("✅ Media library permissions granted");
      } catch (mediaError) {
        console.warn("⚠️ Media library permission failed:", mediaError);
        Alert.alert(
          "Permission Warning",
          "Media library permission failed. Certificate will be saved to app directory only."
        );
      }

      console.log("✅ Permission process completed");
      return true;
    } catch (error: any) {
      console.error("❌ Permission request error:", error);
      Alert.alert("Error", "Failed to request permissions: " + (error?.message || String(error)));
      return false;
    }
  };

  // Save certificate with improved error handling and multiple fallback methods
  const saveCertificateToDownloads = async (): Promise<boolean> => {
    // Wait for the next tick to ensure the view is rendered
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!viewShotRef.current) {
      // Try again after a longer delay
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!viewShotRef.current) {
        throw new Error("View reference not found");
      }
    }
    try {
      console.log("💾 Starting certificate save process...");

      console.log("📸 Capturing certificate view...");

      // Capture the certificate view as image
      const uri = await captureRef(viewShotRef.current, {
        format: "png",
        quality: 1.0,
        result: "tmpfile",
      });

      console.log("📸 Captured image URI:", uri);

      if (!uri) {
        console.log("❌ Failed to capture image");
        throw new Error("Failed to capture certificate image");
      }

      // Generate filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filename = `Fitness_Certificate_${formData.patientName.replace(
        /\s+/g,
        "_"
      )}_${timestamp}.png`;
      console.log("📄 Generated filename:", filename);

      let savedSuccessfully = false;
      let finalUri = uri;

      if (Platform.OS === "android") {
        console.log("📱 Android: Attempting to save certificate...");

        // Method 1: Try saving to document directory first
        try {
          const documentDir = FileSystem.documentDirectory;
          const fileUri = documentDir + filename;
          console.log("💾 Saving to document directory:", fileUri);

          await FileSystem.copyAsync({
            from: uri,
            to: fileUri,
          });

          finalUri = fileUri;
          savedSuccessfully = true;
          console.log("✅ Saved to document directory successfully");
        } catch (docError) {
          console.warn("⚠️ Document directory save failed:", docError);
        }

        // Method 2: Try creating Downloads directory if document directory failed
        if (!savedSuccessfully) {
          try {
            const downloadDir = FileSystem.documentDirectory + "Download/";
            console.log("📁 Creating/Using download directory:", downloadDir);

            const dirInfo = await FileSystem.getInfoAsync(downloadDir);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(downloadDir, {
                intermediates: true,
              });
              console.log("✅ Download directory created");
            }

            const fileUri = downloadDir + filename;
            console.log("💾 Saving to download directory:", fileUri);

            await FileSystem.copyAsync({
              from: uri,
              to: fileUri,
            });

            finalUri = fileUri;
            savedSuccessfully = true;
            console.log("✅ Saved to download directory successfully");
          } catch (downloadError) {
            console.warn("⚠️ Download directory save failed:", downloadError);
          }
        }

        // Method 3: Save to media library (makes it visible in gallery/downloads)
        try {
          console.log("📚 Attempting to save to media library...");
          const asset = await MediaLibrary.saveToLibraryAsync(finalUri);
          console.log("✅ Successfully saved to media library:", asset);
        } catch (mediaError) {
          console.warn(
            "⚠️ Media library save failed (but file saved locally):",
            mediaError
          );
        }

        if (!savedSuccessfully) {
          throw new Error("All Android save methods failed");
        }

        console.log("🎉 Android save process completed successfully");
      } else {
        console.log("🍎 iOS: Saving to photo library...");

        try {
          const asset = await MediaLibrary.saveToLibraryAsync(uri);
          console.log("✅ iOS save completed:", asset);
          savedSuccessfully = true;
        } catch (iosError) {
          console.error("❌ iOS save failed:", iosError);
          throw iosError;
        }
      }

      return savedSuccessfully;
    } catch (error: any) {
      console.error("❌ Save certificate error:", error);
      console.error("❌ Error stack:", error?.stack);
      throw error;
    }
  };

  const generateCertificate = async () => {
    console.log("🚀 Generate certificate button pressed");
    setIsGenerating(true);

    try {
      // Check dependencies first
      console.log("1️⃣ Checking dependencies...");
      if (!checkDependencies()) {
        console.log("❌ Dependencies check failed");
        return;
      }

      // Request permissions with timeout
      console.log("2️⃣ Requesting permissions...");
      const permissionTimeout = setTimeout(() => {
        console.log(
          "⏰ Permission request taking too long, continuing anyway..."
        );
      }, 5000);

      let hasPermissions = false;
      try {
        hasPermissions = await requestPermissions();
        clearTimeout(permissionTimeout);
      } catch (permError) {
        clearTimeout(permissionTimeout);
        console.warn(
          "⚠️ Permission request failed, continuing anyway:",
          permError
        );
        hasPermissions = true; // Continue anyway for modern Android
      }

      if (!hasPermissions) {
        console.log("❌ Permissions denied, but attempting to continue...");
        // Don't return here, try to save anyway
      }

      // Simulate certificate generation processing
      console.log("3️⃣ Processing certificate...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Save certificate
      console.log("4️⃣ Saving certificate...");
      let saveSuccessful = false;
      let saveError: any = null;

      try {
        saveSuccessful = await saveCertificateToDownloads();
      } catch (saveErr) {
        console.error("❌ Save failed:", saveErr);
        saveError = saveErr;
        saveSuccessful = false;
      }

      if (saveSuccessful) {
        // Phase 2: Non-blocking Backend Save (Fire & Forget)
        // We do typically NOT await this to prevent blocking the UI
        console.log("☁️ Triggering background cloud sync...");
        saveFitnessCertificateToBackend(
          API_BASE_URL,
          patient.patientId,
          { ...formData, type: 'fitness_certificate' }
        ).catch(err => console.error("❌ Cloud sync hook error:", err));

        const platformSpecificMessage =
          Platform.OS === "android"
            ? "Certificate saved successfully! 📁\n\nYou can find it in:\n• App documents folder\n• Downloads (if accessible)\n• Gallery/Photos app"
            : "Certificate saved to Photos successfully! 📷\n\nYou can find it in the Photos app.";

        console.log("🎉 Certificate generation completed successfully!");

        Alert.alert("✅ Certificate Generated", platformSpecificMessage, [
          {
            text: "📤 Share Certificate",
            onPress: () => {
              console.log("📤 Share button pressed");
              shareCertificate();
            },
          },
          {
            text: "💾 Save & Exit",
            onPress: () => {
              console.log("💾 Save & Exit pressed");
              // Show flash message before exiting
              Alert.alert(
                "✅ Saved Successfully!",
                "Certificate has been saved to downloads and is ready to use! 📁",
                [
                  {
                    text: "✅ OK",
                    onPress: () => {
                      console.log(
                        "✅ Flash message acknowledged, navigating back"
                      );
                      navigation.goBack();
                    },
                  },
                ],
                { cancelable: false }
              );
            },
            style: "default",
          },
          {
            text: "✏️ Continue Editing",
            onPress: () => console.log("✏️ Continue editing pressed"),
            style: "cancel",
          },
        ]);
      } else {
        // Even if save failed, offer to share
        console.log("⚠️ Save failed, but offering share option");
        Alert.alert(
          "⚠️ Save Issue",
          `Certificate generated but save failed.\n\nError: ${saveError?.message || "Unknown error"
          }\n\nYou can still share the certificate.`,
          [
            {
              text: "📤 Share Certificate",
              onPress: () => shareCertificate(),
            },
            {
              text: "🔄 Try Save Again",
              onPress: () => {
                console.log("🔄 Retry save");
                generateCertificate();
              },
            },
            {
              text: "❌ Cancel",
              style: "cancel",
            },
          ]
        );
      }
      return saveSuccessful;
    } catch (error: any) {
      console.error("❌ Certificate generation error:", error);
      console.error("❌ Error details:", {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });

      Alert.alert(
        "❌ Error",
        `Failed to generate certificate. Please try again.\n\n🔍 Error Details:\n${error?.message || String(error)}\n\n💡 Troubleshooting:\n• Check app permissions in settings\n• Ensure device has sufficient storage\n• Try restarting the app`,
        [
          {
            text: "📤 Try Share Instead",
            onPress: () => shareCertificate(),
          },
          {
            text: "🔄 Retry",
            onPress: () => generateCertificate(),
          },
          {
            text: "❌ Cancel",
            style: "cancel",
          },
        ]
      );
      return false;
    } finally {
      console.log("🏁 Setting isGenerating to false");
      setIsGenerating(false);
    }
  };

  const shareCertificate = async () => {
    try {
      console.log("📤 Starting certificate share...");

      if (!viewShotRef.current) {
        console.log("❌ View reference not available for sharing");
        Alert.alert("Error", "Certificate not ready for sharing");
        return;
      }

      if (!captureRef) {
        console.log("❌ captureRef not available");
        Alert.alert(
          "Error",
          "Sharing functionality not available. Missing react-native-view-shot package."
        );
        return;
      }

      // Capture certificate for sharing
      console.log("📸 Capturing certificate for sharing...");
      const uri = await captureRef(viewShotRef.current, {
        format: "png",
        quality: 1.0,
        result: "tmpfile",
      });

      console.log("📤 Sharing certificate with URI:", uri);

      if (Platform.OS === "ios") {
        await Share.share({
          url: uri,
          message: `Fitness Certificate for ${formData.patientName
            } - Generated on ${new Date().toLocaleDateString()}`,
          title: "Fitness Certificate",
        });
      } else {
        // For Android, create a file and share it
        const timestamp = Date.now();
        const filename = `fitness_cert_${timestamp}.png`;
        const fileUri = FileSystem.documentDirectory + filename;

        await FileSystem.copyAsync({
          from: uri,
          to: fileUri,
        });

        await Share.share({
          url: fileUri,
          message: `Fitness Certificate for ${formData.patientName
            } - Generated on ${new Date().toLocaleDateString()}`,
          title: "Fitness Certificate",
        });
      }

      console.log("✅ Certificate shared successfully");
    } catch (error: any) {
      console.error("❌ Error sharing certificate:", error);
      Alert.alert("Error", "Failed to share certificate: " + (error?.message || String(error)));
    }
  };

  const validateForm = (): boolean => {
    console.log("🔍 Validating form...");

    if (!formData.patientName.trim()) {
      console.log("❌ Patient name validation failed");
      Alert.alert("Validation Error", "Patient name is required");
      return false;
    }

    if (!formData.opinion.trim()) {
      console.log("❌ Opinion validation failed");
      Alert.alert("Validation Error", "Medical opinion is required");
      return false;
    }

    console.log("✅ Form validation passed");
    return true;
  };

  const handleGenerate = async () => {
    let success: boolean | undefined;
    if (typeof window !== 'undefined') (window as any).isCriticalOperation = true;
    setIsGenerating(true);
    console.log('generating');

    success = await generateCertificate();
    setIsGenerating(false);
    if (typeof window !== 'undefined') (window as any).isCriticalOperation = false;
    if (success) {
      navigation.goBack(); // Only navigate after save is done
    }
  };



  const getSelectedOptionText = () => {
    switch (formData.selectedOpinionType) {
      case "surgery_fitness":
        return formData.surgeryFitnessOption || "Not specified";
      case "medication_modification":
        return formData.medicationModificationText || "Not specified";
      case "fitness_reserved":
        return formData.fitnessReservedText || "Not specified";
      default:
        return "Not specified";
    }
  };

  // Refresh data function
  const refreshData = async () => {
    console.log("🔄 Refreshing data...");
    await loadPatientDataAndHistory();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#0070D6", "#15A1B1"]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fitness Certificate</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={refreshData}
              disabled={isLoadingData}
            >
              <Ionicons
                name={isLoadingData ? "hourglass-outline" : "refresh-outline"}
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => navigation.navigate("FitnessCertificateHistory", { patient })}
            >
              <Ionicons name="time-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Loading Overlay */}
      {isLoadingData && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0070D6" />
          <Text style={styles.loadingText}>Loading patient data...</Text>
          <View style={styles.loadingDetails}>
            <Text style={styles.loadingDetailText}>
              Patient: {dataLoadingStatus.patient ? "Loading..." : "✓"}
            </Text>
            <Text style={styles.loadingDetailText}>
              Diagnosis: {dataLoadingStatus.diagnosis ? "Loading..." : "✓"}
            </Text>
            <Text style={styles.loadingDetailText}>
              Investigations:{" "}
              {dataLoadingStatus.investigations ? "Loading..." : "✓"}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Certificate Preview */}
        <View ref={viewShotRef} style={styles.certificateContainer}>
          <View style={styles.certificateHeader}>
            <Text style={styles.certificateTitle}>
              MEDICAL FITNESS CERTIFICATE
            </Text>
            <Text style={styles.doctorName}>Dr. Diapk Gawli</Text>
            <Text style={styles.doctorCredentials}>MBBS, DNB General Medicine</Text>
            <Text style={styles.clinicDetails}>

            </Text>
          </View>

          <View style={styles.certificateBody}>
            {/* Patient Information */}
            <View style={styles.patientInfoSection}>
              <Text style={styles.sectionTitle}>PATIENT INFORMATION</Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Name:</Text>
                  <Text style={styles.infoValue}>{formData.patientName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Age/Sex:</Text>
                  <Text style={styles.infoValue}>
                    {formData.patientAge} years / {formData.patientSex}
                  </Text>
                </View>
                {/* <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Patient ID:</Text>
                  <Text style={styles.infoValue}>{formData.patientId}</Text>
                </View> */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Date:</Text>
                  <Text style={styles.infoValue}>
                    {new Date().toLocaleDateString("en-IN")}
                  </Text>
                </View>
              </View>
            </View>

            {/* New PreOp Evaluation Section */}
            <View style={styles.preOpSection}>
              <Text style={styles.sectionTitle}>PRE-OPERATIVE EVALUATION</Text>
              <View style={styles.preOpContent}>
                <Text style={styles.preOpText}>
                  PreOp evaluation / Fitness:{" "}
                  <Text style={styles.underlineText}>
                    {formData.preOpEvaluationForm || "_______"}
                  </Text>{" "}
                  form
                </Text>
                <Text style={styles.preOpText}>
                  Thanks for your reference. Referred for PreOp evaluation
                  posted for Dr.{" "}
                  <Text style={styles.underlineText}>
                    {formData.referredForPreOp || "_______"}
                  </Text>
                </Text>
              </View>
            </View>

            {/* Enhanced Clinical Assessment */}
            <View style={styles.assessmentSection}>
              <Text style={styles.sectionTitle}>CLINICAL ASSESSMENT</Text>
              <View style={styles.assessmentGrid}>
                <View style={styles.assessmentRow}>
                  <Text style={styles.assessmentLabel}>Past History:</Text>
                  <Text style={styles.assessmentValue}>
                    {formData.pastHistory || "No significant history"}
                  </Text>
                </View>
                <View style={styles.assessmentRow}>
                  <Text style={styles.assessmentLabel}>
                    Cardio Respiratory function:
                  </Text>
                  <Text style={styles.assessmentValue}>
                    {formData.cardioRespiratoryFunction}
                  </Text>
                </View>
                <View style={styles.assessmentRow}>
                  <Text style={styles.assessmentLabel}>Sy/E:</Text>
                  <Text style={styles.assessmentValue}>{formData.syE}</Text>
                </View>
              </View>
            </View>

            {/* Enhanced Investigations Section */}
            <View style={styles.investigationsSection}>
              <Text style={styles.sectionTitle}>INVESTIGATIONS</Text>
              <View style={styles.investigationsGrid}>
                <View style={styles.investigationRow}>
                  <Text style={styles.investigationLabel}>ECG:</Text>
                  <Text style={styles.investigationValue}>
                    {formData.ecgField}
                  </Text>
                </View>
                <View style={styles.investigationRow}>
                  <Text style={styles.investigationLabel}>Echo:</Text>
                  <Text style={styles.investigationValue}>
                    {formData.echoField}
                  </Text>
                </View>
                <View style={styles.investigationRow}>
                  <Text style={styles.investigationLabel}>CXR:</Text>
                  <Text style={styles.investigationValue}>
                    {formData.cxrField}
                  </Text>
                </View>
              </View>
            </View>

            {/* Medical Opinion Section - Modified */}
            <View style={styles.opinionSection}>
              <Text style={styles.sectionTitle}>MEDICAL OPINION</Text>
              <View style={styles.opinionContent}>
                <View style={styles.opinionRow}>
                  <Text style={styles.opinionLabel}>Opinion:</Text>
                  <Text style={styles.opinionUnderline}>
                    {formData.opinion || "_______________________"}
                  </Text>
                </View>
                {formData.selectedOpinionType && (
                  <View style={styles.selectedOptionSection}>
                    <Text style={styles.selectedOptionLabel}>
                      {formData.selectedOpinionType === "surgery_fitness" &&
                        "Surgery Fitness:"}
                      {formData.selectedOpinionType ===
                        "medication_modification" && "Medication Modification:"}
                      {formData.selectedOpinionType === "fitness_reserved" &&
                        "Fitness Reserved For:"}
                    </Text>
                    <Text style={styles.selectedOptionValue}>
                      {getSelectedOptionText()}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Vitals & Lab Values */}
            <View style={styles.vitalsSection}>
              <Text style={styles.sectionTitle}>VITALS & LAB VALUES</Text>
              <View style={styles.vitalsGrid}>
                <View style={styles.vitalsColumn}>
                  <Text style={styles.vitalsLabel}>
                    BP:{" "}
                    <Text style={styles.vitalsValue}>
                      {formData.bloodPressure || "Normal"}
                    </Text>
                  </Text>
                  <Text style={styles.vitalsLabel}>
                    HR:{" "}
                    <Text style={styles.vitalsValue}>
                      {formData.heartRate || "Normal"}
                    </Text>
                  </Text>
                  <Text style={styles.vitalsLabel}>
                    Temp:{" "}
                    <Text style={styles.vitalsValue}>
                      {formData.temperature || "Normal"}
                    </Text>
                  </Text>
                </View>
                <View style={styles.vitalsColumn}>
                  <Text style={styles.vitalsLabel}>
                    SpO2:{" "}
                    <Text style={styles.vitalsValue}>
                      {formData.oxygenSaturation || "Normal"}
                    </Text>
                  </Text>
                  <Text style={styles.vitalsLabel}>
                    RR:{" "}
                    <Text style={styles.vitalsValue}>
                      {formData.respiratoryRate || "Normal"}
                    </Text>
                  </Text>
                  <Text style={styles.vitalsLabel}>
                    Lab:{" "}
                    <Text style={styles.vitalsValue}>
                      {formData.labValues || "WNL"}
                    </Text>
                  </Text>
                </View>
              </View>
            </View>

            {/* Recommendations */}
            {formData.recommendations && (
              <View style={styles.recommendationsSection}>
                <Text style={styles.sectionTitle}>RECOMMENDATIONS</Text>
                <Text style={styles.recommendationsText}>
                  {formData.recommendations}
                </Text>
              </View>
            )}

            {/* Footer */}
            <View style={styles.certificateFooter}>
              <View style={styles.signatureSection}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureText}>Dr. Dipak Gawli</Text>
                <Text style={styles.signatureTitle}>
                  Physician
                </Text>
                <Text style={styles.signatureDate}>
                  Date: {new Date().toLocaleDateString("en-IN")}
                </Text>
              </View>
              <View style={styles.validitySection}>
                <Text style={styles.validityText}>
                  Valid for: {formData.validityPeriod}
                </Text>
                <Text style={styles.certificateId}>
                  Cert ID: FC{Date.now().toString().slice(-6)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Form Fields for Editing */}
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Edit Certificate Details</Text>

          {/* Opinion Field */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Medical Opinion</Text>
            <TextInput
              style={styles.textInput}
              value={formData.opinion}
              onChangeText={(text) => updateFormData("opinion", text)}
              placeholder="Enter medical opinion"
              multiline
            />
          </View>

          {/* Opinion Type Selection - Modified */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Opinion Details</Text>

            {/* Surgery Fitness Option */}
            <View style={styles.radioContainer}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => handleOpinionTypeSelect("surgery_fitness")}
              >
                <View
                  style={[
                    styles.radioCircle,
                    formData.selectedOpinionType === "surgery_fitness" &&
                    styles.radioSelected,
                  ]}
                />
                <Text style={styles.radioLabel}>Surgery Fitness</Text>
              </TouchableOpacity>

              {formData.selectedOpinionType === "surgery_fitness" && (
                <TouchableOpacity
                  style={styles.dropdownToggle}
                  onPress={() =>
                    setShowDropdown((prev) => ({
                      ...prev,
                      surgery: !prev.surgery,
                    }))
                  }
                >
                  <Text
                    style={styles.dropdownToggleText}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {formData.surgeryFitnessOption || "Select option"}
                  </Text>
                  <Ionicons
                    name={showDropdown.surgery ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#4A5568"
                  />
                </TouchableOpacity>
              )}

              {showDropdown.surgery && (
                <View style={styles.dropdown}>
                  <ScrollView
                    style={styles.dropdownScrollView}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    bounces={false}
                  >
                    {surgeryFitnessOptions.map((option, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.dropdownOption,
                          index === surgeryFitnessOptions.length - 1 &&
                          styles.lastDropdownOption,
                        ]}
                        onPress={() =>
                          handleDropdownSelect("surgeryFitnessOption", option)
                        }
                        activeOpacity={0.7}
                      >
                        <Text
                          style={styles.dropdownOptionText}
                          numberOfLines={0}
                        >
                          {option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Medication Modification Option - Updated to Text Input Only */}
            <View style={styles.radioContainer}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() =>
                  handleOpinionTypeSelect("medication_modification")
                }
              >
                <View
                  style={[
                    styles.radioCircle,
                    formData.selectedOpinionType ===
                    "medication_modification" && styles.radioSelected,
                  ]}
                />
                <Text style={styles.radioLabel}>Medication Modification</Text>
              </TouchableOpacity>

              {formData.selectedOpinionType === "medication_modification" && (
                <View style={styles.textFieldContainer}>
                  <Text style={styles.textFieldLabel}>
                    Current Prescription:
                  </Text>
                  <TextInput
                    style={styles.multilineTextInput}
                    value={formData.medicationModificationText}
                    onChangeText={(text) =>
                      updateFormData("medicationModificationText", text)
                    }
                    placeholder="Prescription details will be auto-loaded from patient data..."
                    multiline
                    textAlignVertical="top"
                    editable={true}
                  />
                  {formData.latestPrescription &&
                    !formData.medicationModificationText && (
                      <TouchableOpacity
                        style={styles.autoFillButton}
                        onPress={() =>
                          updateFormData(
                            "medicationModificationText",
                            formData.latestPrescription
                          )
                        }
                      >
                        <Text style={styles.autoFillButtonText}>
                          📋 Load Current Prescription
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              )}
            </View>

            {/* Fitness Reserved Option - Updated to Text Input Only */}
            <View style={styles.radioContainer}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => handleOpinionTypeSelect("fitness_reserved")}
              >
                <View
                  style={[
                    styles.radioCircle,
                    formData.selectedOpinionType === "fitness_reserved" &&
                    styles.radioSelected,
                  ]}
                />
                <Text style={styles.radioLabel}>Fitness Reserved For</Text>
              </TouchableOpacity>

              {formData.selectedOpinionType === "fitness_reserved" && (
                <View style={styles.textFieldContainer}>
                  <Text style={styles.textFieldLabel}>
                    Required Investigations:
                  </Text>
                  <TextInput
                    style={styles.multilineTextInput}
                    value={formData.fitnessReservedText}
                    onChangeText={(text) =>
                      updateFormData("fitnessReservedText", text)
                    }
                    placeholder="Investigation details will be auto-loaded from patient data..."
                    multiline
                    textAlignVertical="top"
                    editable={true}
                  />
                  {formData.latestInvestigations &&
                    !formData.fitnessReservedText && (
                      <TouchableOpacity
                        style={styles.autoFillButton}
                        onPress={() =>
                          updateFormData(
                            "fitnessReservedText",
                            formData.latestInvestigations
                          )
                        }
                      >
                        <Text style={styles.autoFillButtonText}>
                          📋 Load Current Investigations
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              )}
            </View>
          </View>

          {/* PreOp Evaluation Fields */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>PreOp Evaluation Form</Text>
            <TextInput
              style={styles.textInput}
              value={formData.preOpEvaluationForm}
              onChangeText={(text) =>
                updateFormData("preOpEvaluationForm", text)
              }
              placeholder="Enter form type (e.g., Surgical, Cardiac, etc.)"
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formLabel}>
              Referred for PreOp Posted For Dr.
            </Text>
            <TextInput
              style={styles.textInput}
              value={formData.referredForPreOp}
              onChangeText={(text) => updateFormData("referredForPreOp", text)}
              placeholder="Doctor name or surgery/procedure type"
              multiline
            />
          </View>

          {/* Enhanced Clinical Assessment Fields */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Past Medical History</Text>
            <TextInput
              style={styles.multilineTextInput}
              value={formData.pastHistory}
              onChangeText={(text) => updateFormData("pastHistory", text)}
              placeholder="Past medical history"
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Cardio Respiratory Function</Text>
            <TextInput
              style={styles.textInput}
              value={formData.cardioRespiratoryFunction}
              onChangeText={(text) =>
                updateFormData("cardioRespiratoryFunction", text)
              }
              placeholder="Cardio respiratory function assessment"
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Sy/E (Symptoms/Examination)</Text>
            <TextInput
              style={styles.textInput}
              value={formData.syE}
              onChangeText={(text) => updateFormData("syE", text)}
              placeholder="Symptoms and examination findings"
              multiline
            />
          </View>

          {/* Investigation Fields */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>ECG</Text>
            <TextInput
              style={styles.textInput}
              value={formData.ecgField}
              onChangeText={(text) => updateFormData("ecgField", text)}
              placeholder="ECG findings"
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Echo</Text>
            <TextInput
              style={styles.textInput}
              value={formData.echoField}
              onChangeText={(text) => updateFormData("echoField", text)}
              placeholder="Echocardiogram findings"
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formLabel}>CXR</Text>
            <TextInput
              style={styles.textInput}
              value={formData.cxrField}
              onChangeText={(text) => updateFormData("cxrField", text)}
              placeholder="Chest X-ray findings"
            />
          </View>

          {/* Vitals */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Vitals</Text>
            <View style={styles.vitalsInputGrid}>
              <TextInput
                style={styles.vitalInput}
                value={formData.bloodPressure}
                onChangeText={(text) => updateFormData("bloodPressure", text)}
                placeholder="BP (mmHg)"
              />
              <TextInput
                style={styles.vitalInput}
                value={formData.heartRate}
                onChangeText={(text) => updateFormData("heartRate", text)}
                placeholder="Heart Rate"
              />
            </View>
            <View style={[styles.vitalsInputGrid, { marginTop: 8 }]}>
              <TextInput
                style={styles.vitalInput}
                value={formData.temperature}
                onChangeText={(text) => updateFormData("temperature", text)}
                placeholder="Temperature (°F)"
              />
              <TextInput
                style={styles.vitalInput}
                value={formData.oxygenSaturation}
                onChangeText={(text) =>
                  updateFormData("oxygenSaturation", text)
                }
                placeholder="SpO2 (%)"
              />
            </View>
            <View style={[styles.vitalsInputGrid, { marginTop: 8 }]}>
              <TextInput
                style={styles.vitalInput}
                value={formData.respiratoryRate}
                onChangeText={(text) => updateFormData("respiratoryRate", text)}
                placeholder="Respiratory Rate"
              />
              <TextInput
                style={styles.vitalInput}
                value={formData.labValues}
                onChangeText={(text) => updateFormData("labValues", text)}
                placeholder="Lab Values"
              />
            </View>
          </View>

          {/* Recommendations */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Recommendations</Text>
            <TextInput
              style={styles.textInput}
              value={formData.recommendations}
              onChangeText={(text) => updateFormData("recommendations", text)}
              placeholder="Additional recommendations or precautions"
              multiline
            />
          </View>

          {/* Validity Period */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Validity Period</Text>
            <View style={styles.validityOptions}>
              {["15 days", "30 days", "60 days", "90 days"].map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[
                    styles.validityOption,
                    formData.validityPeriod === period &&
                    styles.validitySelected,
                  ]}
                  onPress={() => updateFormData("validityPeriod", period)}
                >
                  <Text
                    style={[
                      styles.validityOptionText,
                      formData.validityPeriod === period &&
                      styles.validitySelectedText,
                    ]}
                  >
                    {period}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Generate Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.generateButton,
            isGenerating && styles.generatingButton,
          ]}
          onPress={handleGenerate}
          disabled={isGenerating}
        >
          <LinearGradient
            colors={
              isGenerating ? ["#A0AEC0", "#718096"] : ["#0070D6", "#15A1B1"]
            }
            style={styles.generateButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isGenerating ? (
              <View style={styles.generatingContent}>
                <Text style={styles.generateButtonText}>
                  Generating & Saving...
                </Text>
              </View>
            ) : (
              <View style={styles.buttonContent}>
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                <Text style={styles.generateButtonText}>
                  Generate & Save Certificate
                </Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Import styles
import { styles } from "./Styles/FitnessCertificateStyles";

export default FitnessCertificate;
