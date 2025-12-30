import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  GestureResponderEvent,
  Vibration,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "@aws-amplify/auth";

import { API_ENDPOINTS } from "../../Config";
import { handleApiError } from "../../Utils/ApiErrorHandler";

const { width } = Dimensions.get("window");
const API_URL = API_ENDPOINTS.DOCTOR_DASHBOARD;

// Polling interval (in milliseconds) - Optimized to 30 seconds
const POLLING_INTERVAL = 30000;

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
  }>;
  reportFiles: Array<{
    name: string;
    url: string;
    type: string;
  }>;
  createdAt: string;
  updatedAt: string;
  reports: string;
}

interface APIResponse {
  patients: Patient[];
  count: number;
  scannedCount: number;
}

interface DoctorDashboardProps {
  navigation: any;
  route: any;
}

// Main Component
const DoctorDashboard: React.FC<DoctorDashboardProps> = ({ navigation, route }) => {
  const { isAuthenticated } = route.params;
  // State for API data
  const [patientData, setPatientData] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshAnimating, setIsRefreshAnimating] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [imageScale, setImageScale] = useState<number>(1);
  const [lastDistance, setLastDistance] = useState<number>(0);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [isDeletingPatient, setIsDeletingPatient] = useState<string | null>(
    null
  );

  useEffect(() => {
    console.log('dashboard', isAuthenticated);

    if (!isAuthenticated) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
    }
  }, [isAuthenticated, navigation]);

  // Track touches for pinch zoom
  const handleTouchMove = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;

    // Need two touches for pinch-to-zoom
    if (touches.length >= 2) {
      const touch1 = touches[0];
      const touch2 = touches[1];

      // Calculate distance between touches
      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // First touch - initialize last distance
      if (lastDistance === 0) {
        setLastDistance(distance);
        return;
      }

      // Calculate the scale change ratio
      const scale = distance / lastDistance;

      // Apply the new scale, but keep it within reasonable limits
      setImageScale((prevScale) => {
        const newScale = prevScale * scale;
        return Math.min(Math.max(newScale, 0.5), 5); // Clamp between 0.5 and 5
      });

      // Update last distance for next move
      setLastDistance(distance);
    }
  };

  // Reset when touches end
  const handleTouchEnd = () => {
    setLastDistance(0);
  };

  // Delete patient function
  const handleDeletePatient = useCallback(async (patient: Patient) => {
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
              console.log(
                `🗑️ Deleting patient: ${patient.name} (ID: ${patient.patientId})`
              );

              const response = await fetch(API_URL, {
                method: "POST", // Changed to POST for Lambda
                headers: {
                  "Content-Type": "application/json",
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
              console.log("✅ Patient deleted successfully:", result);

              // Remove patient from local state
              setPatientData((prevData) =>
                prevData.filter((p) => p.patientId !== patient.patientId)
              );

              // Update last update time
              setLastUpdate(new Date());

              // Show success message
              Alert.alert(
                "Patient Deleted",
                `${patient.name} has been successfully deleted.`,
                [{ text: "OK", style: "default" }]
              );
            } catch (error: any) {
              console.error("❌ Delete patient error:", error);
              Alert.alert(
                "Delete Error",
                "Failed to delete patient. Please try again.",
                [{ text: "OK", style: "default" }]
              );
            } finally {
              setIsDeletingPatient(null);
            }
          },
        },
      ]
    );
  }, []);

  // Logout functionality
  const handleLogout = useCallback(async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            setIsLoggingOut(true);
            console.log("🚪 Logging out user...");

            // Sign out from AWS Amplify
            await signOut();

            console.log("✅ User logged out successfully");

            // Navigate to login screen
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          } catch (error: any) {
            console.error("❌ Logout error:", error);
            setIsLoggingOut(false);

            Alert.alert("Logout Error", "Failed to logout. Please try again.", [
              { text: "OK", style: "default" },
            ]);
          }
        },
      },
    ]);
  }, [navigation]);

  // Fetch data from API with polling
  useEffect(() => {
    let isComponentMounted = true;

    // Sort patients by date (ascending order)
    const sortPatientsByDate = (patients: Patient[]) => {
      return [...patients].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB; // Ascending order (oldest to newest)
      });
    };

    // Initial data load function (shows loading state)
    const initialFetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Updated to POST with getAllPatients action
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "getAllPatients" }),
        });


        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error Response:", errorText);
          throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        // Parse the body if it's a string
        const responseData: APIResponse =
          typeof data.body === "string" ? JSON.parse(data.body) : data;

        if (isComponentMounted) {
          // Sort and update patient data
          const sortedPatients = sortPatientsByDate(
            responseData.patients || []
          );
          setPatientData(sortedPatients);
          // Update last fetch timestamp
          setLastUpdate(new Date());
        }
      } catch (err) {
        // Use standardized error handler
        const errorResult = handleApiError(err, "fetching patient data");
        if (isComponentMounted) {
          setError(errorResult.message);
        }
      } finally {
        if (isComponentMounted) {
          setIsLoading(false);
        }
      }
    };

    // Automatic polling function (runs every 30 seconds)
    const autoPollData = async () => {
      // Skip if component unmounted
      if (!isComponentMounted) return;

      try {
        // Show fetching indicator
        setIsFetching(true);

        // Fetch fresh data with cache control headers
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
          const errorText = await response.text();
          console.error("Polling API Error Response:", errorText);
          console.error(
            "Polling error: API returned status " + response.status
          );
          return;
        }

        const data = await response.json();

        // Parse the body if it's a string
        const responseData: APIResponse =
          typeof data.body === "string" ? JSON.parse(data.body) : data;

        // Only update if we got valid data and component is still mounted
        if (responseData && responseData.patients && isComponentMounted) {
          // Sort patients by date
          const sortedPatients = sortPatientsByDate(responseData.patients);

          // Compare with current data to see if it's changed
          const currentData = JSON.stringify(patientData);
          const newData = JSON.stringify(sortedPatients);

          if (currentData !== newData) {
            setPatientData(sortedPatients);
            setLastUpdate(new Date());

            // Visual feedback when data changes
            setIsRefreshAnimating(true);
            setTimeout(() => {
              if (isComponentMounted) {
                setIsRefreshAnimating(false);
              }
            }, 2000);
          } else {
          }
        }
      } catch (err) {
        // Silent error for polling (console only) unless critical
        console.error("Auto-polling error:", err);
      } finally {
        if (isComponentMounted) {
          setIsFetching(false);
        }
      }
    };

    // Initial fetch when component mounts
    initialFetchData();

    // Set up polling interval for automatic refreshes every 30 seconds
    const intervalId = setInterval(autoPollData, POLLING_INTERVAL);
    console.log("Auto-polling started with interval:", POLLING_INTERVAL, "ms");

    // Clean up when component unmounts
    return () => {
      isComponentMounted = false;
      clearInterval(intervalId);
      console.log("Auto-polling stopped");
    };
  }, []); // Empty dependency array means this runs once on mount

  // Format date to more readable form
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Get last prescribed medication function
  const getLastPrescribedMedication = (medications) => {
    // Return early if no medications
    if (!medications || medications.length === 0) return null;

    // Sort medications by datePrescribed (newest first)
    const sortedMeds = [...medications].sort((a, b) => {
      // Handle missing datePrescribed fields
      if (!a.datePrescribed) return 1; // Put items without dates at the end
      if (!b.datePrescribed) return -1;

      // Sort by date (newest first)
      return (
        new Date(b.datePrescribed).getTime() -
        new Date(a.datePrescribed).getTime()
      );
    });

    // Return the most recent medication
    return sortedMeds[0];
  };

  // Get latest 5 patients (sorted by creation date, newest first)
  const getLatestPatients = () => {
    return [...patientData]
      .sort((a, b) => {
        // Sort by date (newest first)
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })
      .slice(0, 5); // Take only the first 5 after sorting
  };

  // Handle tab navigation
  const handleTabNavigation = (tabName: string) => {
    if (tabName === "Home") {
      // Already on home screen, do nothing
    } else if (tabName === "Patients") {
      navigation.navigate("Patients"); // Navigate to the PatientsData component
    } else if (tabName === "Schedule") {
      navigation.navigate("Appointments");
    } else if (tabName === "Profile") {
      navigation.navigate("Profile");
    }
  };

  // Helper to match NewAppointmentModal's date format (e.g., "Dec 29, 2025")
  const getTodayDateString = () => {
    const date = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // Note: NewAppointmentModal uses `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  // State for appointments count
  const [todaysAppointmentCount, setTodaysAppointmentCount] = useState<number>(0);

  // Fetch appointments function
  const fetchAppointmentsCount = async () => {
    try {
      // Use the APPOINTMENTS endpoint from Config
      const response = await fetch(API_ENDPOINTS.APPOINTMENTS);
      if (!response.ok) return; // Silent fail for dashboard stats

      const data = await response.json();
      if (Array.isArray(data)) {
        const todayStr = getTodayDateString();
        // Filter for appointments that match today's date string
        const count = data.filter((app: any) => app.date === todayStr).length;
        setTodaysAppointmentCount(count);
      }
    } catch (error) {
      console.error("Failed to fetch appointment count:", error);
    }
  };

  // Add fetchAppointmentsCount to the existing polling and initial load
  // We can modify the existing useEffect or add a new one. 
  // Let's hook into the existing polling mechanism by adding a separate effect for cleaner separation
  // that runs on the same schedule.

  useEffect(() => {
    let isMounted = true;

    const loadAppointments = async () => {
      if (isMounted) await fetchAppointmentsCount();
    };

    // Initial load
    loadAppointments();

    // Poll every 30s
    const interval = setInterval(loadAppointments, POLLING_INTERVAL);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // View full image and reset zoom
  const handleViewImage = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageScale(1);
    setLastDistance(0);
    setModalVisible(true);
  };

  // Handle Fitness Certificate generation
  const handleFitnessCertificate = (patient: Patient) => {
    Alert.alert(
      "Fitness Certificate",
      `Generate fitness certificate for ${patient.name}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Generate",
          onPress: () => {
            // Navigate to fitness certificate generation screen
            navigation.navigate("FitnessCertificate", { patient });
          },
        },
      ]
    );
  };

  // Manual refresh function with visual feedback
  const handleManualRefresh = () => {
    if (!isFetching) {
      setIsFetching(true);

      // Show subtle notification
      if (Platform.OS === "ios" || Platform.OS === "android") {
        // Vibration feedback on mobile if available
        if (Platform.OS === "ios" && "vibrate" in Vibration) {
          Vibration.vibrate(100);
        }
      }

      // Fetch data again
      fetch(API_URL, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          const responseData: APIResponse =
            typeof data.body === "string" ? JSON.parse(data.body) : data;
          setPatientData(responseData.patients || []);
          setLastUpdate(new Date());

          // Animate the last update text briefly
          // We'll use a state variable for this
          setIsRefreshAnimating(true);
          setTimeout(() => setIsRefreshAnimating(false), 2000);
        })
        .catch((err) => {
          console.error("Error fetching data:", err);
          // Only show error alerts, not success alerts
          Alert.alert("Error", "Failed to refresh data");
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0070D6" />
        <Text style={styles.loadingText}>Loading patient data...</Text>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={50} color="#E53935" />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => navigation.replace("DoctorDashboard")}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Get the latest 5 patients for display
  const latestPatients = getLatestPatients();

  return (
    <SafeAreaView style={styles.container}>
      {/* Image Viewer Modal with Zoom */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setModalVisible(false)}
          >
            <Ionicons name="close-circle" size={36} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Zoom instructions hint */}
          <View style={styles.zoomHintContainer}>
            <Text style={styles.zoomHintText}>Pinch to zoom in/out</Text>
          </View>

          {/* Zoomable image */}
          <View
            style={styles.imageContainer}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <Image
              source={{ uri: selectedImage }}
              style={[styles.fullImage, { transform: [{ scale: imageScale }] }]}
              resizeMode="contain"
            />
          </View>

          {/* Zoom reset button */}
          <TouchableOpacity
            style={styles.resetZoomButton}
            onPress={() => setImageScale(1)}
          >
            <Ionicons name="refresh-outline" size={24} color="#FFFFFF" />
            <Text style={styles.resetZoomText}>Reset Zoom</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <LinearGradient
          colors={["#0070D6", "#15A1B1"]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.welcomeText}></Text>
                <Text style={styles.doctorName}>Dr. Dipak Gawli</Text>
                <Text style={styles.doctorSpecialty}>Physician</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {/* Logout Button - Replaces Profile Icon */}
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={handleLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="log-out-outline"
                      size={24}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.logoutButtonText}>
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.cardContainer}>
              <View style={styles.dashboardCard}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>Today's Summary</Text>
                  <Text style={styles.cardDate}>
                    {new Date().toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                </View>
                <View style={styles.cardStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="people-outline" size={24} color="#0070D6" />
                    <View style={styles.statContent}>
                      <Text style={styles.statValue}>{patientData.length}</Text>
                      <Text style={styles.statLabel}>Patients</Text>
                    </View>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Ionicons
                      name="calendar-outline"
                      size={24}
                      color="#FF9800"
                    />
                    <View style={styles.statContent}>
                      <Text style={styles.statValue}>{todaysAppointmentCount}</Text>
                      <Text style={styles.statLabel}>Appointments</Text>
                    </View>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={24}
                      color="#4CAF50"
                    />
                    <View style={styles.statContent}>
                      <Text style={styles.statValue}>3</Text>
                      <Text style={styles.statLabel}>Messages</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.lastUpdateContainer}>
                  <Text
                    style={[
                      styles.lastUpdateText,
                      isRefreshAnimating && styles.lastUpdateTextHighlight,
                    ]}
                  >
                    Last updated: {lastUpdate.toLocaleTimeString()}
                    {isFetching ? " (refreshing...)" : ""}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate("NewPatientForm")}
          >
            <View
              style={[styles.actionIconCircle, { backgroundColor: "#0070D6" }]}
            >
              <Ionicons name="person-add-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.actionText}>New Patient</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate("Appointments")}
          >
            <View
              style={[styles.actionIconCircle, { backgroundColor: "#FF9800" }]}
            >
              <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
            </View>
            <Text
              style={styles.actionText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Appointments
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate("Reports")}
          >
            <View
              style={[styles.actionIconCircle, { backgroundColor: "#4CAF50" }]}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.actionText}>Messages</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate("Payments")}
          >
            <View
              style={[styles.actionIconCircle, { backgroundColor: "#E53935" }]}
            >
              <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.actionText}>Payments</Text>
          </TouchableOpacity>
        </View>

        {/* Patient Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Patient Details</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Patients")}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {/* Patient Cards - Now showing only latest 5 patients */}
          {latestPatients.length > 0 ? (
            latestPatients.map((patient, index) => (
              <TouchableOpacity
                key={index}
                style={styles.patientCard}
                onPress={() =>
                  navigation.navigate("NewPatientForm", {
                    patient,
                    initialTab: "clinical", // Changed from "basic" to "clinical"
                    prefillMode: true,
                    hideBasicTab: true, // Add this new parameter
                  })
                }
              >
                <View style={styles.patientCardHeader}>
                  <View style={styles.patientNameRow}>
                    <Text style={styles.patientName}>{patient.name}</Text>
                    {patient.patientId ? (
                      <View style={styles.patientIdBadge}>
                        <Text style={styles.patientIdText}>
                          ID: #{patient.patientId.slice(-6).toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.patientInfo}>
                    <View style={styles.patientInfoItem}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color="#718096"
                      />
                      <Text style={styles.patientInfoText}>
                        {patient.age} years • {patient.sex}
                      </Text>
                      {patient.status === 'PRE_REGISTERED' && (
                        <View style={{ backgroundColor: '#E3F2FD', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                          <Text style={{ fontSize: 10, color: '#0070D6', fontWeight: '600' }}>PRE-REG</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.patientInfoItem}>
                      <Ionicons name="time-outline" size={14} color="#718096" />
                      <Text style={styles.patientInfoText}>
                        {formatDate(patient.createdAt)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.patientCardBody}>
                  <View style={styles.diagnosisSection}>
                    <Text style={styles.sectionLabel}>Diagnosis:</Text>
                    <Text style={styles.diagnosisText}>
                      {patient.diagnosis}
                    </Text>
                  </View>

                  {patient.medications && patient.medications.length > 0 && (
                    <View style={styles.medicationSection}>
                      <Text style={styles.sectionLabel}>Last Medication:</Text>

                      {(() => {
                        // Get the last prescribed medication
                        const lastMed = getLastPrescribedMedication(
                          patient.medications
                        );

                        if (lastMed) {
                          return (
                            <View style={styles.medicationDateGroup}>
                              {/* Date header */}
                              {lastMed.datePrescribed && (
                                <View style={styles.medicationDateHeader}>
                                  <Ionicons
                                    name="calendar-outline"
                                    size={12}
                                    color="#718096"
                                  />
                                  <Text style={styles.medicationDateText}>
                                    {formatDate(lastMed.datePrescribed)}
                                  </Text>
                                </View>
                              )}

                              {/* Medication details */}
                              <View style={styles.medicationItem}>
                                <Text style={styles.medicationName}>
                                  {lastMed.name}
                                </Text>
                                <Text style={styles.medicationDetails}>
                                  {lastMed.timingValues &&
                                    lastMed.timingValues !== "{}" &&
                                    JSON.parse(lastMed.timingValues).morning}
                                  {lastMed.unit} •{" "}
                                  {lastMed.timing &&
                                    lastMed.timing.replace(",", "/")}{" "}
                                  • {lastMed.duration}
                                </Text>
                              </View>
                            </View>
                          );
                        } else {
                          return (
                            <Text style={styles.noMedicationText}>
                              No medication information available
                            </Text>
                          );
                        }
                      })()}
                    </View>
                  )}

                  {patient.reportFiles && patient.reportFiles.length > 0 && (
                    <View style={styles.reportsSection}>
                      <Text style={styles.sectionLabel}>Reports:</Text>
                      <View style={styles.reportsList}>
                        {patient.reportFiles.map((report, idx) => (
                          <View key={idx}>
                            {report.type && report.type.startsWith("image") ? (
                              <TouchableOpacity
                                style={styles.reportImageContainer}
                                onPress={() => handleViewImage(report.url)}
                              >
                                <Image
                                  source={{ uri: report.url }}
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
                                onPress={() => {
                                  // Handle document viewing
                                  Alert.alert(
                                    "View Document",
                                    `Opening ${report.name}`
                                  );
                                }}
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
                </View>

                <View style={styles.patientCardFooter}>
                  <TouchableOpacity
                    key={index}
                    style={styles.footerButton} // Changed from styles.patientCard to styles.footerButton
                    onPress={() =>
                      navigation.navigate("NewPatientForm", {
                        patient,
                        initialTab: "clinical",
                        prefillMode: true,
                        hideBasicTab: true,
                      })
                    }
                  >
                    <Ionicons name="create-outline" size={16} color="#0070D6" />
                    <Text style={styles.footerButtonText}>Prescribe</Text>
                  </TouchableOpacity>

                  {/* REPLACED: Message button with Delete button */}
                  <TouchableOpacity
                    style={styles.footerButton}
                    onPress={() => handleDeletePatient(patient)}
                    disabled={isDeletingPatient === patient.patientId}
                  >
                    {isDeletingPatient === patient.patientId ? (
                      <ActivityIndicator size="small" color="#E53935" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#E53935"
                      />
                    )}
                    <Text
                      style={[styles.footerButtonText, { color: "#E53935" }]}
                    >
                      {isDeletingPatient === patient.patientId
                        ? "Deleting..."
                        : "Delete"}
                    </Text>
                  </TouchableOpacity>

                  {/* NEW: Fitness Certificate Button */}
                  <TouchableOpacity
                    style={styles.footerButton}
                    onPress={() => handleFitnessCertificate(patient)}
                  >
                    <Ionicons name="ribbon-outline" size={16} color="#4CAF50" />
                    <Text style={[styles.footerButtonText, { fontSize: 12 }]}>
                      Fitness
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            // No patients placeholder - neutral message with no loading indicators
            <View style={styles.noPatientCard}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color="#A0AEC0"
              />
              <Text style={styles.noPatientText}>No recent patients</Text>
            </View>
          )}
        </View>

        {/* Upcoming Appointments Reminder */}
        {/* <View style={styles.reminderContainer}>
          <LinearGradient
            colors={["#FF9800", "#F57C00"]}
            style={styles.reminderGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.reminderContent}>
              <View style={styles.reminderIcon}>
                <Ionicons name="calendar" size={30} color="#FFFFFF" />
              </View>
              <View style={styles.reminderTextContainer}>
                <Text style={styles.reminderTitle}>Upcoming Appointments</Text>
                <Text style={styles.reminderSubtitle}>
                  You have 3 appointments scheduled for today
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reminderButton}
                onPress={() => navigation.navigate("Appointments")}
              >
                <Text style={styles.reminderButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View> */}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Home")}
        >
          <Ionicons name="home" size={24} color="#0070D6" />
          <Text style={[styles.navText, { color: "#0070D6" }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Patients")}
        >
          <Ionicons name="people-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Patients</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Schedule")}
        >
          <Ionicons name="calendar-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Profile")}
        >
          <Ionicons name="person-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#4A5568",
  },
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
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  // Logout Button Styles
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.2)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 10,
  },
  imageContainer: {
    width: width,
    height: width,
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: width,
    height: width,
  },
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
  // New report thumbnail styles
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
  noPatientCard: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    marginTop: 16,
  },
  noPatientText: {
    fontSize: 14,
    color: "#718096",
    textAlign: "center",
    marginTop: 10,
  },
  headerGradient: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 30,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  welcomeText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  doctorSpecialty: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  doctorAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  cardContainer: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  dashboardCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.2)",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.8,
        shadowRadius: 5,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
  },
  cardDate: {
    fontSize: 12,
    fontWeight: "500",
    color: "#718096",
  },
  cardStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastUpdateContainer: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  lastUpdateText: {
    fontSize: 10,
    color: "#A0AEC0",
    fontStyle: "italic",
  },
  lastUpdateTextHighlight: {
    color: "#0070D6",
    fontWeight: "600",
  },
  refreshButton: {
    marginLeft: 6,
    padding: 4,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  statContent: {
    marginLeft: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2D3748",
  },
  statLabel: {
    fontSize: 12,
    color: "#718096",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E2E8F0",
  },
  actionButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12, // Reduced horizontal padding to give more room
    marginTop: -20,
    marginBottom: 16,
  },
  actionButton: {
    width: width * 0.23, // Slightly increased width
    alignItems: "center",
    padding: 6, // Reduced padding to give more room for text
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.2)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  actionText: {
    fontSize: 11, // Reduced font size to fit the text
    color: "#2D3748",
    marginTop: 4,
    textAlign: "center",
  },
  sectionContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
  },
  viewAllText: {
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "500",
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#EDF2F7",
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.1)",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tabText: {
    fontSize: 14,
    color: "#718096",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#0070D6",
    fontWeight: "600",
  },
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
      android: {
        elevation: 2,
      },
    }),
  },
  patientCardHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  patientNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    flex: 1, // Allow name to take available space
    marginRight: 8,
  },
  patientIdBadge: {
    backgroundColor: "#F7FAFC",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  patientIdText: {
    fontSize: 11,
    color: "#4A5568",
    fontWeight: "600",
  },
  patientInfo: {
    flexDirection: "row",
    marginTop: 4,
  },
  patientInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  patientInfoText: {
    fontSize: 12,
    color: "#718096",
    marginLeft: 4,
  },
  patientCardBody: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  diagnosisSection: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 4,
  },
  diagnosisText: {
    fontSize: 14,
    color: "#2D3748",
    lineHeight: 20,
  },
  medicationSection: {
    marginBottom: 10,
  },
  medicationItem: {
    marginBottom: 6,
    paddingLeft: 4,
  },
  medicationName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2D3748",
  },
  medicationDetails: {
    fontSize: 12,
    color: "#718096",
    marginTop: 2,
  },
  noMedicationText: {
    fontSize: 12,
    color: "#718096",
    fontStyle: "italic",
    marginLeft: 4,
  },
  medicationDateGroup: {
    marginBottom: 10,
  },
  medicationDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 4,
    paddingLeft: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  medicationDateText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#718096",
    marginLeft: 4,
    fontStyle: "italic",
  },
  reportsSection: {
    marginBottom: 4,
  },
  reportsList: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  reportName: {
    fontSize: 12,
    color: "#4A5568",
    marginLeft: 4,
    maxWidth: 120,
  },
  patientCardFooter: {
    flexDirection: "row",
    padding: 12,
    justifyContent: "space-between", // Better distribution of buttons
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1, // Equal distribution
    justifyContent: "center", // Center content
    paddingVertical: 4,
  },
  footerButtonText: {
    fontSize: 13, // Slightly smaller to fit all buttons
    marginLeft: 4,
    color: "#718096",
    textAlign: "center",
  },
  reminderContainer: {
    padding: 16,
    marginBottom: 80,
  },
  reminderGradient: {
    borderRadius: 12,
  },
  reminderContent: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  reminderIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  reminderTextContainer: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  reminderSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
  },
  reminderButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  reminderButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
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
      android: {
        elevation: 4,
      },
    }),
  },
  navItem: {
    alignItems: "center",
  },
  navText: {
    fontSize: 12,
    color: "#718096",
    marginTop: 2,
  },
});

export default DoctorDashboard;
