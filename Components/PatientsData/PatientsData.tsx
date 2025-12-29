import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
  Alert,
  Image,
  Modal,
  StatusBar,
  ScrollView,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { API_ENDPOINTS } from "../../Config";

const { width } = Dimensions.get("window");
const API_URL = API_ENDPOINTS.PATIENT_PROCESSOR;

// Types
interface Patient {
  name: string;
  age: number;
  sex: string;
  patientId: string;
  diagnosis: string;
  treatment: string;
  prescription: string;
  advisedInvestigations: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    datePrescribed?: string;
    timing?: string;
    unit?: string;
    timingValues?: string;
    specialInstructions?: string;
  }>;
  reportFiles: Array<{
    name: string;
    url: string;
    type: string;
  }>;
  createdAt: string;
  updatedAt: string;
  reports: string;
  generatedPrescription?: string;
  reportData?: Record<string, string>;
  firstVisit?: Record<string, any>;
  existingData?: string;
}

interface APIResponse {
  patients: Patient[];
  count: number;
  scannedCount: number;
}

interface PatientsDataProps {
  navigation: any;
  route: any;
}

const PatientsData: React.FC<PatientsDataProps> = ({ navigation }) => {
  // State variables
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterBy, setFilterBy] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [imageModalVisible, setImageModalVisible] = useState<boolean>(false);
  const [imageScale, setImageScale] = useState<number>(1);
  const [lastDistance, setLastDistance] = useState<number>(0);
  const [isDeletingPatient, setIsDeletingPatient] = useState<string | null>(
    null
  );

  // Fade animation for modals
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Format date to more readable form
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return dateString;
    }
  };

  // Delete patient function
  const handleDeletePatient = async (patient: Patient) => {
    try {
      console.log(
        `🗑️ Deleting patient: ${patient.name} (ID: ${patient.patientId})`
      );

      // Show confirmation dialog
      Alert.alert(
        "Delete Patient",
        `Are you sure you want to delete ${patient.name}? This action cannot be undone.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                setIsDeletingPatient(patient.patientId);

                const response = await fetch(API_URL, {
                  method: "POST", // Changed to POST for Lambda
                  headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                    Expires: "0",
                  },
                  body: JSON.stringify({
                    action: "deletePatient",
                    patientId: patient.patientId,
                  }),
                });

                if (!response.ok) {
                  throw new Error(`Delete failed: ${response.status}`);
                }

                const result = await response.json();
                console.log("✅ Delete response:", result);

                // Update local state by removing the deleted patient
                setPatients((prevPatients) =>
                  prevPatients.filter((p) => p.patientId !== patient.patientId)
                );
                setFilteredPatients((prevFiltered) =>
                  prevFiltered.filter((p) => p.patientId !== patient.patientId)
                );

                Alert.alert(
                  "Success",
                  `${patient.name} has been deleted successfully.`,
                  [{ text: "OK" }]
                );
              } catch (error) {
                console.error("❌ Delete patient error:", error);
                Alert.alert(
                  "Error",
                  `Failed to delete ${patient.name}. Please try again.`,
                  [{ text: "OK" }]
                );
              } finally {
                setIsDeletingPatient(null);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("❌ Error in handleDeletePatient:", error);
      Alert.alert("Error", "An unexpected error occurred. Please try again.", [
        { text: "OK" },
      ]);
    }
  };

  // Fetch data from API
  const fetchPatients = async () => {
    try {
      setError(null);
      console.log("Fetching patients data from API...");

      // Updated to POST with getAllPatients action
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        body: JSON.stringify({ action: "getAllPatients" }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      console.log("API response received");

      const responseData: APIResponse =
        typeof data.body === "string" ? JSON.parse(data.body) : data;

      console.log(`Received ${responseData.patients?.length || 0} patients`);

      if (responseData && responseData.patients) {
        setPatients(responseData.patients);
        applyFiltersAndSort(
          responseData.patients,
          searchQuery,
          filterBy,
          sortBy
        );
      }
    } catch (err) {
      console.error("Error fetching patients:", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial data load and refresh on focus
  useEffect(() => {
    fetchPatients();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPatients();
    }, [])
  );

  // Apply filters and sorting
  const applyFiltersAndSort = (
    data: Patient[],
    query: string,
    filter: string,
    sort: string
  ) => {
    let result = [...data];
    if (query.trim() !== "") {
      const lowercaseQuery = query.toLowerCase();
      result = result.filter(
        (patient) =>
          patient.name.toLowerCase().includes(lowercaseQuery) ||
          patient.patientId.toLowerCase().includes(lowercaseQuery) ||
          patient.diagnosis.toLowerCase().includes(lowercaseQuery)
      );
    }
    if (filter === "male") {
      result = result.filter((patient) => patient.sex.toLowerCase() === "male");
    } else if (filter === "female") {
      result = result.filter(
        (patient) => patient.sex.toLowerCase() === "female"
      );
    } else if (filter === "critical") {
      result = result.filter((patient) =>
        patient.diagnosis.toLowerCase().includes("critical")
      );
    }
    if (sort === "newest") {
      result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (sort === "oldest") {
      result.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } else if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }
    setFilteredPatients(result);
  };

  // Update filters on dependency changes
  useEffect(() => {
    applyFiltersAndSort(patients, searchQuery, filterBy, sortBy);
  }, [searchQuery, filterBy, sortBy, patients]);

  // Pull-to-refresh handler
  const onRefresh = () => {
    setIsRefreshing(true);
    fetchPatients();
  };

  // Tab navigation handler
  const handleTabNavigation = (tabName: string) => {
    if (tabName === "Home") {
      navigation.navigate("DoctorDashboard");
    } else if (tabName === "Patients") {
      // already here
    } else if (tabName === "Schedule") {
      navigation.navigate("Appointments");
    } else if (tabName === "Profile") {
      navigation.navigate("Profile");
    }
  };

  // View patient details with fade-in effect
  const handleViewPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setModalVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // View image in full screen
  const handleViewImage = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageScale(1);
    setLastDistance(0);
    setImageModalVisible(true);
  };

  // Get last prescribed medication
  const getLastPrescribedMedication = (medications: Patient["medications"]) => {
    if (!medications || medications.length === 0) return null;
    try {
      const sortedMeds = [...medications].sort((a, b) => {
        if (!a.datePrescribed) return 1;
        if (!b.datePrescribed) return -1;
        return (
          new Date(b.datePrescribed).getTime() -
          new Date(a.datePrescribed).getTime()
        );
      });
      return sortedMeds[0];
    } catch (error) {
      console.error("Error in getLastPrescribedMedication:", error);
      return null;
    }
  };

  // Format medication info for display
  const formatMedicationInfo = (medication: any) => {
    if (!medication) return "No medications";
    let displayText = medication.name;
    if (medication.dosage) displayText += ` ${medication.dosage}`;
    if (medication.unit)
      displayText += `${medication.dosage ? "" : " "}${medication.unit}`;
    return displayText;
  };

  // Render a patient card with improved touch feedback
  const renderPatientCard = ({ item }: { item: Patient }) => (
    <TouchableOpacity
      style={styles.patientCard}
      onPress={() => handleViewPatient(item)}
      activeOpacity={0.85}
      accessibilityLabel={`View details for patient ${item.name}`}
    >
      <View style={styles.patientCardHeader}>
        <View style={styles.patientNameContainer}>
          <Text style={styles.patientName}>{item.name}</Text>
          <View style={styles.patientMetaContainer}>
            <Text style={styles.patientMeta}>
              {item.age} yrs • {item.sex}
            </Text>
          </View>
        </View>
        <Text style={styles.patientId}>
          ID: {item.patientId.substring(0, 8)}
        </Text>
      </View>
      <View style={styles.patientCardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="medical" size={16} color="#718096" />
          <Text style={styles.diagnosisText} numberOfLines={1}>
            {item.diagnosis}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color="#718096" />
          <Text style={styles.dateText}>
            Added: {formatDate(item.createdAt)}
          </Text>
        </View>
        {item.medications && item.medications.length > 0 && (
          <View style={styles.medicationRow}>
            <Ionicons name="medical-outline" size={16} color="#0070D6" />
            <Text style={styles.medicationText} numberOfLines={1}>
              {formatMedicationInfo(
                getLastPrescribedMedication(item.medications)
              )}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.patientCardFooter}>
        <TouchableOpacity
          style={styles.cardButton}
          onPress={(e) => {
            e.stopPropagation();
            navigation.navigate("NewPatientForm", {
              patient: item,
              initialTab: "clinical", // Changed from "basic" to "clinical"
              prefillMode: true,
              hideBasicTab: true, // Add this new parameter
            });
          }}
          accessibilityLabel={`Prescribe for ${item.name}`}
        >
          <Ionicons name="create-outline" size={16} color="#0070D6" />
          <Text style={styles.cardButtonText}>Prescribe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cardButton, styles.deleteButton]}
          onPress={(e) => {
            e.stopPropagation();
            handleDeletePatient(item);
          }}
          disabled={isDeletingPatient === item.patientId}
          accessibilityLabel={`Delete ${item.name}`}
        >
          {isDeletingPatient === item.patientId ? (
            <ActivityIndicator size="small" color="#E53935" />
          ) : (
            <Ionicons name="trash-outline" size={16} color="#E53935" />
          )}
          <Text style={[styles.cardButtonText, styles.deleteButtonText]}>
            {isDeletingPatient === item.patientId ? "Deleting..." : "Delete"}
          </Text>
        </TouchableOpacity>

        {item.reportFiles && item.reportFiles.length > 0 && (
          <View style={styles.reportsIndicator}>
            <Ionicons
              name="document-attach-outline"
              size={16}
              color="#4CAF50"
            />
            <Text style={styles.reportsCount}>
              {item.reportFiles.length} reports
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0070D6" />
        <Text style={styles.loadingText}>Loading patient data...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={50} color="#E53935" />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchPatients}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Patient Details Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => setModalVisible(false)}
      >
        <Animated.View
          style={[styles.patientModalContainer, { opacity: fadeAnim }]}
        >
          {selectedPatient && (
            <View style={styles.patientModalContent}>
              <View style={styles.patientModalHeader}>
                <Text style={styles.patientModalTitle}>
                  {selectedPatient.name}
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                  accessibilityLabel="Close patient details"
                >
                  <Ionicons name="close" size={24} color="#718096" />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.patientModalBody}
                showsVerticalScrollIndicator
              >
                {/* Patient Details */}
                <View style={styles.patientModalSection}>
                  <Text style={styles.patientModalSectionTitle}>
                    Patient Details
                  </Text>
                  <View style={styles.patientInfoRow}>
                    <Text style={styles.patientInfoLabel}>Patient ID:</Text>
                    <Text style={styles.patientInfoValue}>
                      {selectedPatient.patientId}
                    </Text>
                  </View>
                  <View style={styles.patientInfoRow}>
                    <Text style={styles.patientInfoLabel}>Age:</Text>
                    <Text style={styles.patientInfoValue}>
                      {selectedPatient.age} years
                    </Text>
                  </View>
                  <View style={styles.patientInfoRow}>
                    <Text style={styles.patientInfoLabel}>Gender:</Text>
                    <Text style={styles.patientInfoValue}>
                      {selectedPatient.sex}
                    </Text>
                  </View>
                  <View style={styles.patientInfoRow}>
                    <Text style={styles.patientInfoLabel}>First Visit:</Text>
                    <Text style={styles.patientInfoValue}>
                      {formatDate(selectedPatient.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.patientInfoRow}>
                    <Text style={styles.patientInfoLabel}>Last Updated:</Text>
                    <Text style={styles.patientInfoValue}>
                      {formatDate(selectedPatient.updatedAt)}
                    </Text>
                  </View>
                </View>

                {/* Medical Details */}
                <View style={styles.patientModalSection}>
                  <Text style={styles.patientModalSectionTitle}>
                    Medical Details
                  </Text>
                  <View style={styles.patientInfoRow}>
                    <Text style={styles.patientInfoLabel}>Diagnosis:</Text>
                    <Text style={styles.patientInfoValue}>
                      {selectedPatient.diagnosis}
                    </Text>
                  </View>
                  {selectedPatient.treatment && (
                    <View style={styles.patientInfoRow}>
                      <Text style={styles.patientInfoLabel}>Treatment:</Text>
                      <Text style={styles.patientInfoValue}>
                        {selectedPatient.treatment}
                      </Text>
                    </View>
                  )}
                  {selectedPatient.prescription && (
                    <View style={styles.patientInfoRow}>
                      <Text style={styles.patientInfoLabel}>Prescription:</Text>
                      <Text style={styles.patientInfoValue}>
                        {selectedPatient.prescription}
                      </Text>
                    </View>
                  )}
                  {selectedPatient.advisedInvestigations && (
                    <View style={styles.patientInfoRow}>
                      <Text style={styles.patientInfoLabel}>
                        Advised Tests:
                      </Text>
                      <Text style={styles.patientInfoValue}>
                        {selectedPatient.advisedInvestigations}
                      </Text>
                    </View>
                  )}
                </View>

                {selectedPatient.generatedPrescription && (
                  <View style={styles.patientModalSection}>
                    <Text style={styles.patientModalSectionTitle}>
                      Generated Prescription
                    </Text>
                    <View style={styles.prescriptionContainer}>
                      <Text style={styles.prescriptionText}>
                        {selectedPatient.generatedPrescription}
                      </Text>
                    </View>
                  </View>
                )}

                {selectedPatient.medications &&
                  selectedPatient.medications.length > 0 && (
                    <View style={styles.patientModalSection}>
                      <Text style={styles.patientModalSectionTitle}>
                        Current Medications
                      </Text>
                      {selectedPatient.medications.map((med, index) => (
                        <View key={index} style={styles.medicationItem}>
                          <Text style={styles.medicationName}>{med.name}</Text>
                          <Text style={styles.medicationDetails}>
                            {med.unit ? `${med.unit} • ` : ""}
                            {med.timing
                              ? med.timing.replace(/,/g, "/")
                              : ""} • {med.duration}
                          </Text>
                          {med.timingValues && (
                            <Text style={styles.timingValues}>
                              Dosage:{" "}
                              {(() => {
                                try {
                                  const timings = JSON.parse(med.timingValues);
                                  return Object.entries(timings)
                                    .map(([time, dose]) => `${time}: ${dose}`)
                                    .join(", ");
                                } catch (e) {
                                  return med.timingValues;
                                }
                              })()}
                            </Text>
                          )}
                          {med.specialInstructions && (
                            <Text style={styles.specialInstructions}>
                              Special Instructions: {med.specialInstructions}
                            </Text>
                          )}
                          {med.datePrescribed && (
                            <Text style={styles.medicationDate}>
                              Prescribed: {formatDate(med.datePrescribed)}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                {selectedPatient.reports && (
                  <View style={styles.patientModalSection}>
                    <Text style={styles.patientModalSectionTitle}>
                      Report History
                    </Text>
                    <Text style={styles.reportsText}>
                      {selectedPatient.reports}
                    </Text>
                  </View>
                )}

                {selectedPatient.reportData && (
                  <View style={styles.patientModalSection}>
                    <Text style={styles.patientModalSectionTitle}>
                      Report Data
                    </Text>
                    {Object.entries(selectedPatient.reportData).map(
                      ([key, value], idx) => (
                        <View key={idx} style={styles.patientInfoRow}>
                          <Text style={styles.patientInfoLabel}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}:
                          </Text>
                          <Text style={styles.patientInfoValue}>
                            {value as string}
                          </Text>
                        </View>
                      )
                    )}
                  </View>
                )}

                {selectedPatient.firstVisit && (
                  <View style={styles.patientModalSection}>
                    <Text style={styles.patientModalSectionTitle}>
                      First Visit Information
                    </Text>
                    {Object.entries(selectedPatient.firstVisit)
                      .filter(
                        ([key]) => key !== "reports" && key !== "reportFiles"
                      )
                      .map(([key, value], idx) => (
                        <View key={idx} style={styles.patientInfoRow}>
                          <Text style={styles.patientInfoLabel}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}:
                          </Text>
                          <Text style={styles.patientInfoValue}>
                            {value as string}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}

                {selectedPatient.reportFiles &&
                  selectedPatient.reportFiles.length > 0 && (
                    <View style={styles.patientModalSection}>
                      <Text style={styles.patientModalSectionTitle}>
                        Report Files
                      </Text>
                      <View style={styles.reportsList}>
                        {selectedPatient.reportFiles.map((report, idx) => (
                          <View key={idx}>
                            {report.type && report.type.startsWith("image") ? (
                              <TouchableOpacity
                                style={styles.reportImageContainer}
                                onPress={() => handleViewImage(report.url)}
                                accessibilityLabel={`View image ${report.name}`}
                              >
                                <Image
                                  source={{ uri: report.url || report.uri }}
                                  style={styles.reportThumbnail}
                                />
                                <Text
                                  style={styles.reportImageName}
                                  numberOfLines={1}
                                >
                                  {report.name.length > 20
                                    ? report.name.substring(0, 20) + "..."
                                    : report.name}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.reportItem}
                                onPress={() =>
                                  Alert.alert(
                                    "View Document",
                                    `Opening ${report.name}`
                                  )
                                }
                                accessibilityLabel={`Open document ${report.name}`}
                              >
                                <Ionicons
                                  name="document-outline"
                                  size={16}
                                  color="#0070D6"
                                />
                                <Text
                                  style={styles.reportName}
                                  numberOfLines={1}
                                  ellipsizeMode="middle"
                                >
                                  {report.name}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
              </ScrollView>

              <View style={styles.patientModalFooter}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    setModalVisible(false);
                    navigation.navigate("NewPatientForm", {
                      patient: selectedPatient,
                      initialTab: "clinical", // Changed from "basic" to "clinical"
                      prefillMode: true,
                      hideBasicTab: true, // Add this new parameter
                    });
                  }}
                  accessibilityLabel="Edit or prescribe"
                >
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteActionButton]}
                  onPress={() => {
                    setModalVisible(false);
                    handleDeletePatient(selectedPatient);
                  }}
                  accessibilityLabel="Delete patient"
                >
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.imageModalContainer}>
          <TouchableOpacity
            style={styles.imageCloseButton}
            onPress={() => setImageModalVisible(false)}
            accessibilityLabel="Close image viewer"
          >
            <Ionicons name="close-circle" size={36} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.zoomHintContainer}>
            <Text style={styles.zoomHintText}>Pinch to zoom in/out</Text>
          </View>
          <Image
            source={{ uri: selectedImage }}
            style={[styles.fullImage, { transform: [{ scale: imageScale }] }]}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.resetZoomButton}
            onPress={() => setImageScale(1)}
            accessibilityLabel="Reset zoom"
          >
            <Ionicons name="refresh-outline" size={24} color="#FFFFFF" />
            <Text style={styles.resetZoomText}>Reset Zoom</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Header */}
      <LinearGradient
        colors={["#0070D6", "#15A1B1"]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Patients</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("NewPatientForm")}
            accessibilityLabel="Add new patient"
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Search and Filter Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search-outline" size={20} color="#718096" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search patients..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#A0AEC0"
            accessibilityLabel="Search patients"
          />
          {searchQuery !== "" && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={20} color="#718096" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
        >
          {["all", "male", "female", "critical"].map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterTab,
                filterBy === cat && styles.activeFilterTab,
              ]}
              onPress={() => setFilterBy(cat)}
              accessibilityLabel={`Filter ${cat}`}
            >
              <Text
                style={[
                  styles.filterText,
                  filterBy === cat && styles.activeFilterText,
                ]}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              Alert.alert("Sort By", "Select a sorting option", [
                { text: "Newest First", onPress: () => setSortBy("newest") },
                { text: "Oldest First", onPress: () => setSortBy("oldest") },
                { text: "Name (A-Z)", onPress: () => setSortBy("name") },
                { text: "Cancel", style: "cancel" },
              ]);
            }}
            accessibilityLabel="Sort patients"
          >
            <Ionicons name="funnel-outline" size={20} color="#0070D6" />
            <Text style={styles.sortText}>Sort</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Patient List */}
      <FlatList
        data={filteredPatients}
        keyExtractor={(item) => item.patientId}
        renderItem={renderPatientCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={["#0070D6"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={50} color="#A0AEC0" />
            <Text style={styles.emptyText}>No patients found</Text>
            <Text style={styles.emptySubtext}>
              Try adjusting your search or filters
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("NewPatientForm")}
        accessibilityLabel="Add new patient"
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Home")}
          accessibilityLabel="Home"
        >
          <Ionicons name="home-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Patients")}
          accessibilityLabel="Patients"
        >
          <Ionicons name="people" size={24} color="#0070D6" />
          <Text style={[styles.navText, { color: "#0070D6" }]}>Patients</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Schedule")}
          accessibilityLabel="Schedule"
        >
          <Ionicons name="calendar-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Profile")}
          accessibilityLabel="Profile"
        >
          <Ionicons name="person-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#4A5568" },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#F5F7FA",
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "bold",
    color: "#2D3748",
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: "#718096",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: "#0070D6",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
  header: {
    paddingTop: Platform.OS === "ios" ? 0 : StatusBar.currentHeight,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#FFFFFF" },
  addButton: { padding: 8 },
  searchContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDF2F7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: "#2D3748" },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterScroll: { flex: 1 },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: "#EDF2F7",
  },
  activeFilterTab: { backgroundColor: "#0070D6" },
  filterText: { fontSize: 14, color: "#4A5568", fontWeight: "500" },
  activeFilterText: { color: "#FFFFFF", fontWeight: "600" },
  sortContainer: { marginLeft: 8 },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#0070D6",
  },
  sortText: {
    marginLeft: 4,
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "500",
  },
  listContent: { padding: 16, paddingBottom: 100 },
  patientCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.1)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.6,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  patientCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  patientNameContainer: { flex: 1 },
  patientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 4,
  },
  patientMetaContainer: { flexDirection: "row", alignItems: "center" },
  patientMeta: { fontSize: 14, color: "#4A5568" },
  patientId: { fontSize: 12, color: "#718096", fontWeight: "500" },
  patientCardBody: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  diagnosisText: { marginLeft: 8, fontSize: 14, color: "#2D3748", flex: 1 },
  dateText: { marginLeft: 8, fontSize: 14, color: "#718096" },
  medicationRow: { flexDirection: "row", alignItems: "center" },
  medicationText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "500",
    flex: 1,
  },
  patientCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  cardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#EDF2F7",
    borderRadius: 16,
    marginRight: 8,
  },
  deleteButton: {
    backgroundColor: "#FED7D7",
  },
  cardButtonText: {
    marginLeft: 4,
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "500",
  },
  deleteButtonText: {
    color: "#E53935",
  },
  reportsIndicator: { flexDirection: "row", alignItems: "center" },
  reportsCount: { marginLeft: 4, fontSize: 14, color: "#4CAF50" },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#718096",
    marginTop: 8,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0070D6",
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.3)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 2,
      },
      android: { elevation: 4 },
    }),
  },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
    }),
  },
  navItem: { alignItems: "center" },
  navText: { fontSize: 12, color: "#718096", marginTop: 2 },
  patientModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  patientModalContent: {
    width: width - 32,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.3)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
    }),
  },
  patientModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  patientModalTitle: { fontSize: 18, fontWeight: "bold", color: "#2D3748" },
  closeButton: { padding: 4 },
  patientModalBody: { padding: 16, maxHeight: "75%" },
  patientModalSection: { marginBottom: 16 },
  patientModalSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 4,
  },
  patientInfoRow: { flexDirection: "row", marginBottom: 8 },
  patientInfoLabel: {
    width: 100,
    fontSize: 14,
    color: "#718096",
    fontWeight: "500",
  },
  patientInfoValue: { flex: 1, fontSize: 14, color: "#2D3748" },
  medicationItem: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  medicationName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 2,
  },
  medicationDetails: { fontSize: 12, color: "#718096", marginBottom: 2 },
  medicationDate: { fontSize: 12, color: "#A0AEC0", fontStyle: "italic" },
  timingValues: { fontSize: 12, color: "#718096", marginBottom: 2 },
  specialInstructions: {
    fontSize: 12,
    color: "#4A5568",
    fontStyle: "italic",
    marginBottom: 2,
  },
  prescriptionContainer: {
    backgroundColor: "#F7FAFC",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  prescriptionText: { fontSize: 13, color: "#2D3748", lineHeight: 20 },
  reportsText: { fontSize: 13, color: "#2D3748", lineHeight: 20 },
  reportsList: { flexDirection: "row", flexWrap: "wrap" },
  reportImageContainer: {
    marginRight: 12,
    marginBottom: 10,
    alignItems: "center",
    width: 100,
  },
  reportThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  reportImageName: {
    fontSize: 11,
    color: "#4A5568",
    marginTop: 4,
    textAlign: "center",
  },
  reportItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDF2F7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  reportName: { fontSize: 12, color: "#4A5568", marginLeft: 4, maxWidth: 120 },
  patientModalFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  actionButton: {
    backgroundColor: "#0070D6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 8,
  },
  deleteActionButton: {
    backgroundColor: "#E53935",
  },
  actionButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  imageModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  imageCloseButton: { position: "absolute", top: 40, right: 20, zIndex: 10 },
  fullImage: { width: width, height: width },
  zoomHintContainer: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  zoomHintText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
  resetZoomButton: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  resetZoomText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  },
});

export default PatientsData;
