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
import { isFileAlreadyUploaded } from "../../Utils/FileUtils";
import { usePatientForm } from "./hooks/usePatientForm";
import { DraftService } from "./Services/DraftService";
import { initiateVisit, completeVisit } from "../../Services/apiService";

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
    patientId, activeVisitId, setActiveVisitId,
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

  // =========================================================================
  // UX FIX: Instantly mark visit as IN_PROGRESS so it drops off Assistant Queue
  // =========================================================================
  useEffect(() => {
    if (activeVisitId) {
      console.log(`🩺 Doctor opened visit ${activeVisitId}. Marking as IN_PROGRESS...`);
      fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "updateVisitStatus",
          visitId: activeVisitId,
          status: "IN_PROGRESS"
        })
      }).catch(err => console.error("Failed to update status to IN_PROGRESS", err));
    }
  }, [activeVisitId]);

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
      navigation.navigate("DoctorDashboard", { isAuthenticated: true });
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

        // 1. Determine Patient ID first (needed for file uploads)
        const resolvedPatientId = permanentPatientId || patient?.patientId || patientId;

        // 2. Process Files (now with patientId available)
        let processedReportFiles = [];
        if (reportFiles && reportFiles.length > 0) {
          // Calculate accurate counts for user feedback
          const alreadyUploaded = reportFiles.filter(f => isFileAlreadyUploaded(f));
          const toUpload = reportFiles.filter(f =>
            !isFileAlreadyUploaded(f) &&
            f.uri &&
            !f.uri.startsWith("http://") &&
            !f.uri.startsWith("https://")
          );

          console.log(`📁 Processing ${reportFiles.length} files for upload`);
          console.log(`   ⏭️ Already uploaded: ${alreadyUploaded.length}`);
          console.log(`   📤 To upload: ${toUpload.length}`);

          // Debug: Log file details
          console.log('📋 REPORT FILES BEFORE UPLOAD:', JSON.stringify(
            reportFiles.map((f, idx) => ({
              index: idx,
              name: f.name,
              isAlreadyUploaded: isFileAlreadyUploaded(f),
              s3Key: f.s3Key || 'none',
              uploadedToS3: f.uploadedToS3 || false,
              uri: f.uri?.substring(0, 50)
            })),
            null,
            2
          ));

          // Show accurate progress message
          if (toUpload.length > 0) {
            const message = alreadyUploaded.length > 0
              ? `Uploading ${toUpload.length} new file(s) to cloud storage (${alreadyUploaded.length} already uploaded)...`
              : `Uploading ${toUpload.length} file(s) to cloud storage...`;
            Alert.alert("Processing Files", message, [{ text: "OK" }]);
          } else {
            console.log("✅ All files already uploaded - no upload needed");
          }

          processedReportFiles = await uploadFilesToS3(reportFiles, resolvedPatientId || "temp-patient");
          console.log(`✅ Processed ${processedReportFiles.length} files`);
        }

        const processedMedications = medications.map((med: any) => ({
          name: med.name || "",
          duration: med.duration || "",
          timing: med.timing || "",
          timingValues: med.timingValues || "{}",
          specialInstructions: med.specialInstructions || "",
          datePrescribed: med.datePrescribed || new Date().toISOString(),
        }));

        // 3. Construct Phase 3 Payload (Acute Data)
        const acuteData = {
          diagnosis: patientData.diagnosis,
          medications: processedMedications,
          clinicalParameters: clinicalParameters,
          reportFiles: processedReportFiles,
          advisedInvestigations: patientData.advisedInvestigations
        };

        // 4. Handle Visit ID (Auto-initiate if missing)
        let resolvedVisitId = activeVisitId;
        
        if (!resolvedVisitId) {
          console.log("🆕 [Phase 3] No active visit found. Initiating fresh visit before completion...");
          const initResult = await initiateVisit({
            patientId: resolvedPatientId!,
            name: patientData.name,
            age: patientData.age,
            sex: patientData.sex,
            mobile: patientData.mobile,
            address: patientData.address
          });
          
          if (initResult.success && initResult.visitId) {
            resolvedVisitId = initResult.visitId;
            setActiveVisitId(resolvedVisitId);
          } else {
            throw new Error("Failed to initiate visit for completion.");
          }
        }

        // 5. Atomic Completion (FIX: PASS ACUTEDATA PROPERLY NESTED)
        console.log(`🚀 [Phase 3] Dispatching completion for visit: ${resolvedVisitId}`);
        const completionResult = await completeVisit({
          patientId: resolvedPatientId!,
          visitId: resolvedVisitId as string,
          acuteData: acuteData // <-- FIX: Properly nest the acuteData payload!
        });

        if (!completionResult.success) {
          throw new Error(completionResult.error || "Failed to complete visit");
        }

        console.log("✅ [Phase 3] Visit completed and locked successfully!");

        // 6. Cleanup Draft
        const draftIdToDelete = resolvedPatientId;
        console.log(`🧹 Deleting draft with ID: ${draftIdToDelete}`);

        if (draftIdToDelete) {
          await DraftService.deleteDraft(draftIdToDelete);
          console.log(`✅ Draft deleted successfully`);
        }

        // 7. Navigate
        Alert.alert("Success", "Visit completed and locked successfully!", [
          {
            text: "OK",
            onPress: () => {
              navigation.navigate("DoctorDashboard", { isAuthenticated: true });
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
              tempPatientId={permanentPatientId || undefined}
              clinicalParameters={clinicalParameters}
              permanentPatientId={permanentPatientId || undefined}
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

  // VISIT LOCK: Compute whether the current visit is already locked
  // This mirrors the same logic as PrescriptionTab.isVisitLocked
  // Only relevant when editing an existing patient (prefillMode) on the prescription tab
  const isVisitLocked = prefillMode &&
    activeSection === "prescription" &&
    (() => {
      const lastLockedDate = (patientData as any)?.lastLockedVisitDate;
      if (!lastLockedDate) return false;
      const todayDate = new Date().toISOString().split("T")[0];
      return lastLockedDate >= todayDate;
    })();

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

        {isVisitLocked ? (
          <View style={[styles.saveButton, { backgroundColor: "#718096", flexDirection: "row", alignItems: "center", gap: 4 }]}>
            <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Locked</Text>
          </View>
        ) : (
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
        )}
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