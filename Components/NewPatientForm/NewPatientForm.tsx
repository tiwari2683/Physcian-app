import React, { useState, useCallback, useEffect, useRef } from "react";
import { API_ENDPOINTS } from "../../Config";
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import BasicTab from "./basic";
import ClinicalTab from "./clinical";
import DiagnosisTab from "./diagnosis";
import PrescriptionTab from "./prescription";
import * as DocumentPicker from "expo-document-picker";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";
import { logStateUpdate } from "../../Utils/Logger";
import { fileToBase64, isFileAlreadyUploaded } from "../../Utils/FileUtils";
import { usePatientForm } from "./hooks/usePatientForm";
import { DraftService } from "./Services/DraftService";

interface NewPatientFormProps {
  navigation: any;
  route: any;
}

const NewPatientForm: React.FC<NewPatientFormProps> = ({
  navigation,
  route,
}) => {
  // Extract parameters from route
  const { patient, initialTab, prefillMode, hideBasicTab } = route.params || {};

  // Use custom hook for form logic
  const {
    isSubmitting, setIsSubmitting,
    activeSection, setActiveSection,
    isNormalFlow,
    savedSections, setSavedSections,
    permanentPatientId, setPermanentPatientId,
    patientId, // Now available from hook
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
    // legacy history functions removed from destructuring
    handleDateChange,
    createBasicPatient
  } = usePatientForm({
    patient,
    initialTab,
    prefillMode,
    hideBasicTab
  });

  // UI Refs
  const scrollViewRef = useRef<any>(null);
  const clinicalTabRef = useRef<any>(null);
  const diagnosisTabRef = useRef<any>(null);

  // Utility functions for date/time formatting
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (error: any) {
      return "N/A";
    }
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error: any) {
      return "N/A";
    }
  };

  // Helper function to check if a section is saved
  const isSectionSaved = (section: string) => {
    return savedSections[section as keyof typeof savedSections];
  };

  // Helper function to check if navigation should be blocked
  const shouldBlockNavigation = () => {
    // Never block navigation if basic tab is hidden
    if (hideBasicTab) return false;

    return (
      isNormalFlow &&
      !isSectionSaved(activeSection) &&
      (!isSectionSaved("basic") || activeSection === "basic")
    );
  };

  // Effect to set initial expanded/collapsed state for medications
  useEffect(() => {
    if (initialTab === "prescription" && !prefillMode) {
      setExpandedMedications([]);
    } else if (prefillMode && initialTab === "prescription") {
      setExpandedMedications([]);
      const incompleteIndices = medications.reduce((acc: number[], med: any, index: number) => {
        if (!med.name) acc.push(index);
        return acc;
      }, []);

      if (incompleteIndices.length > 0) {
        setExpandedMedications([incompleteIndices[0]]);
      }
    }
  }, [initialTab, prefillMode, medications.length]);

  // Function to verify field values before submission
  const verifyFieldsBeforeSubmit = (section: string) => {
    switch (section) {
      case "basic":
        break;
      case "clinical":
        logStateUpdate("Clinical Fields", {
          medicalHistory: patientData.medicalHistory?.substring(0, 50) + "...",
          diagnosis: patientData.diagnosis?.substring(0, 50) + "...",
          prescription: patientData.prescription?.substring(0, 50) + "...",
          treatment: patientData.treatment?.substring(0, 50) + "...",
          reports: patientData.reports?.substring(0, 50) + "...",
          advisedInvestigations:
            patientData.advisedInvestigations?.substring(0, 50) + "...",
        });
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

  // getSubmitButtonText function
  const getSubmitButtonText = () => {
    if (activeSection === "prescription") {
      return prefillMode ? "Update Patient" : "Save Patient";
    }
    return "Next";
  };

  // proceedToNextSection function
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
      // If on the last section, go to Doctor Dashboard
      console.log("🏁 On last section, navigating to Doctor Dashboard");
      navigation.navigate("DoctorDashboard");
    }

    console.log("-----------------------------------------------------------");
  };

  // switchSection function
  const switchSection = (section: string) => {
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

  // Effect for diagnosis clearing mechanism
  useEffect(() => {
    console.log("📋 Setting up diagnosis clearing mechanism");

    const clearDiagnosisAfterSaveCompletion = async () => {
      try {
        await AsyncStorage.setItem("clearDiagnosisFlag", "true");
        console.log("🚩 Set clearDiagnosisFlag in AsyncStorage");

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
      } catch (error: any) {
        console.error("❌ Error in clearDiagnosisAfterSaveCompletion:", error);
      }
    };

    return () => {
      AsyncStorage.removeItem("clearDiagnosisFlag")
        .then(() => console.log("🧹 Cleaned up clearDiagnosisFlag on unmount"))
        .catch((error) =>
          console.error("❌ Error clearing diagnosis flag:", error)
        );
    };
  }, []);

  const checkConnection = async () => {
    try {
      // Simple check to ensure connectivity
      const response = await fetch("https://www.google.com", {
        method: "HEAD",
        mode: "no-cors",
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleSubmit = async () => {
    console.log("\n===========================================================");
    console.log(`📱 HANDLE SUBMIT STARTED | ${new Date().toISOString()}`);
    console.log("===========================================================");
    console.log(`🔍 Current Section: ${activeSection}`);

    // Get patient ID for existing patients
    const patId = patient?.patientId || permanentPatientId;

    // --- CLINICAL HISTORY SYNC LOGIC (Legacy Removed) ---
    // History is now merged only during final submission (Prescription Tab)

    // Verify field values before proceeding

    // Verify field values before proceeding
    verifyFieldsBeforeSubmit(activeSection);

    // --- INTERMEDIATE SECTIONS (No API Call) ---
    if (activeSection === "basic") {
      console.log("🔄 BASIC SECTION VALIDATION");
      if (validateForm()) {

        // Immediate Creation Logic
        if (!permanentPatientId && !patient?.patientId) {
          setIsSubmitting(true);
          try {
            const result = await createBasicPatient();
            if (result.success && result.patientId) {
              // Success: Set ID and Proceed
              setPermanentPatientId(result.patientId);
              setSavedSections((prev) => ({ ...prev, basic: true }));
              proceedToNextSection();
            } else {
              Alert.alert("Creation Failed", result.error || "Could not create patient record.");
            }
          } catch (e) {
            Alert.alert("Error", "An unexpected error occurred while creating patient.");
            console.error(e);
          } finally {
            setIsSubmitting(false);
          }
        } else {
          // ID already exists, just proceed
          console.log("✅ Basic section valid & Patient exists. Proceeding.");
          setSavedSections((prev) => ({ ...prev, basic: true }));
          proceedToNextSection();
        }

      } else {
        console.log("❌ Basic section validation failed");
        Alert.alert("Validation Error", "Please fill in all required fields (Name, Age, Mobile).");
      }
      return;
    }

    if (activeSection === "clinical") {
      console.log("🔄 CLINICAL SECTION VALIDATION");
      // No strict validation for clinical, just mark as saved locally
      setSavedSections((prev) => ({ ...prev, clinical: true }));
      proceedToNextSection();
      return;
    }

    if (activeSection === "diagnosis") {
      console.log("🔄 DIAGNOSIS SECTION VALIDATION");
      setSavedSections((prev) => ({ ...prev, diagnosis: true }));
      proceedToNextSection();
      return;
    }

    // --- FINAL SUBMISSION (Prescription Section) ---
    if (activeSection === "prescription") {
      console.log("\n🔄 FINAL SUBMISSION - PRESCRIPTION SECTION");
      setIsSubmitting(true);

      try {
        // Check internet connection
        const isConnected = await checkConnection();
        if (!isConnected) {
          throw new Error("No internet connection. Please check your network and try again.");
        }

        // 1. Process Files
        let processedReportFiles = [];
        if (reportFiles && reportFiles.length > 0) {
          console.log(`📁 Processing ${reportFiles.length} files for upload`);
          Alert.alert("Processing Files", `Preparing ${reportFiles.length} file(s) for upload...`, [{ text: "OK" }]);
          processedReportFiles = await ensureFilesHaveBase64(reportFiles);
          console.log(`✅ Processed ${processedReportFiles.length} files`);
        }

        // 2. Process Medications
        const processedMedications = medications.map((med: any) => ({
          name: med.name || "",
          duration: med.duration || "",
          timing: med.timing || "",
          timingValues: med.timingValues || "{}",
          specialInstructions: med.specialInstructions || "",
          datePrescribed: med.datePrescribed || new Date().toISOString(),
        }));

        // 3. Construct FULL Payload
        const finalPayload: any = {
          // Basic Info
          name: patientData.name,
          age: patientData.age,
          sex: patientData.sex,
          mobile: patientData.mobile,
          address: patientData.address,

          // Clinical Info
          // MERGE NEW HISTORY ENTRY IF EXISTS (Phase 3 Fix)
          medicalHistory: (patientData.newHistoryEntry && patientData.newHistoryEntry.trim())
            ? `--- New Entry (${new Date().toLocaleString()}) ---\n${patientData.newHistoryEntry}\n\n${patientData.medicalHistory || ""}`
            : patientData.medicalHistory,

          diagnosis: patientData.diagnosis, // Separate field
          advisedInvestigations: patientData.advisedInvestigations,
          reports: patientData.reports,
          reportData: reportData, // For backward compatibility?
          clinicalParameters: {
            ...clinicalParameters,
            date: new Date().toISOString(),
          },

          // Prescription
          medications: processedMedications,

          // Files
          reportFiles: processedReportFiles,

          // Flags
          createParameterHistory: true,
          createMedicalHistoryEntry: isSavingHistory, // Only if we added history? Or always?
          createDiagnosisHistory: true, // Always track history on save
          forceHistoryUpdate: true,

          // Metadata
          saveSection: "prescription", // Technically we are in prescription, but sending everything
          isPartialSave: false, // This is a FULL save
        };

        // 4. Handle ID (Update vs Create) - Phase 4 Hardening
        const resolvedPatientId = permanentPatientId || patient?.patientId || patientId;

        if (resolvedPatientId) {
          console.log(`🔑 Updating existing patient: ${resolvedPatientId}`);
          finalPayload.patientId = resolvedPatientId;
          finalPayload.updateMode = true;
          finalPayload.action = "updatePatientData";
          // No updateSection means "Full Update" in backend logic
        } else {
          console.log("🆕 Creating new patient (Fallback)");
          finalPayload.patientId = null;
          // Logic will fall through to processPatientData in backend
        }

        console.log("🚀 Sending consolidated payload to API...");
        const apiUrl = API_ENDPOINTS.PATIENT_PROCESSOR;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify(finalPayload)
        });

        console.log(`status: ${response.status}`);
        const responseText = await response.text();
        const result = JSON.parse(responseText);

        if (!result.success && !responseText.includes('"success":true')) {
          throw new Error(result.message || result.error || "Server responded with failure");
        }

        console.log("✅ Patient saved successfully!");

        // 5. Cleanup Draft - use the most current draft ID
        // In Phase 4, resolvedPatientId is the definitive ID
        const draftIdToDelete = resolvedPatientId;
        console.log(`🧹 Deleting draft with ID: ${draftIdToDelete}`);

        if (draftIdToDelete) {
          await DraftService.deleteDraft(draftIdToDelete);
          console.log(`✅ Draft deleted successfully`);
        } else {
          console.warn("⚠️ No draft ID available for deletion");
        }

        // 6. Navigate
        Alert.alert("Success", "Patient record saved successfully!", [
          {
            text: "OK",
            onPress: () => {
              navigation.navigate("DoctorDashboard");
            }
          }
        ]);

      } catch (error: any) {
        console.error("❌ Submission Error:", error);
        Alert.alert("Error", `Failed to save patient: ${error.message}`);
      } finally {
        setIsSubmitting(false);
        setIsSavingHistory(false);
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
              showCreationBanner={!permanentPatientId && !patient?.patientId} // UX: Show only for new patients
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
            // saveNewHistoryEntryToStorage prop removed
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
              tempPatientId={permanentPatientId || undefined} // Make sure this matches the prop name expected in DiagnosisTab
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
              tempPatientId={permanentPatientId || undefined}
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
            <Text style={styles.saveButtonText}>
              {activeSection === "prescription"
                ? "Save Patient"
                : activeSection === "basic" && !permanentPatientId && !patient?.patientId
                  ? "Create Patient" // UX: Explicit action for new patients
                  : "Next"}
            </Text>
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
