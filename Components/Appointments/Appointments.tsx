import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import NewAppointmentModal from "./NewAppointmentModal"; // Import the modal component

const { width } = Dimensions.get("window");

// Types
interface Appointment {
  id: string; // Changed from number to string for consistency with Lambda
  patientId?: string; // LINKED PATIENT ID
  patientName: string;
  patientAge: number;
  date: string;
  time: string;
  type: string;
  status: "upcoming" | "completed" | "canceled";
  notes?: string;
}

interface AppointmentsProps {
  navigation: any;
  route: any;
}

import { API_ENDPOINTS } from "../../Config";
import { handleApiError } from "../../Utils/ApiErrorHandler";

// ... imports

const Appointments: React.FC<AppointmentsProps> = ({ navigation }) => {
  // Filter states
  const [activeFilter, setActiveFilter] = useState<string>("today");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Modal visibility state
  const [modalVisible, setModalVisible] = useState(false);

  // Real appointment data
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Error state for fetch failures
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch appointments
  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const response = await fetch(API_ENDPOINTS.APPOINTMENTS);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Ensure data is an array and IDs are strings
      const normalizedData = (Array.isArray(data) ? data : []).map((item: any) => ({
        ...item,
        id: String(item.id)
      }));
      setAppointments(normalizedData);
    } catch (error: any) {
      setFetchError(error.message || "Failed to load appointments");
      handleApiError(error, "fetching appointments");
    } finally {
      setIsLoading(false);
    }
  };

  // Filter tabs
  const filterTabs = [
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
    { key: "canceled", label: "Canceled" },
  ];

  // ============================================
  // DATE-TIME PARSING AND COMPUTED STATUS LOGIC
  // ============================================

  // Parse "Jan 6, 2026" + "3:00 PM" into a Date object
  const parseAppointmentDateTime = (dateStr: string, timeStr: string): Date => {
    const months: Record<string, number> = {
      "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5,
      "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
    };

    // Parse date: "Jan 6, 2026"
    const dateMatch = dateStr?.match(/(\w+)\s+(\d+),\s+(\d+)/);
    if (!dateMatch) {
      console.warn(`[Appointments] Failed to parse date: "${dateStr}"`);
      return new Date(0); // Invalid date fallback (epoch = past)
    }

    const month = months[dateMatch[1]] ?? 0;
    const day = parseInt(dateMatch[2]);
    const year = parseInt(dateMatch[3]);

    // Parse time: "3:00 PM"
    const timeMatch = timeStr?.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeMatch) {
      console.warn(`[Appointments] Failed to parse time: "${timeStr}"`);
      return new Date(year, month, day, 23, 59); // End of day fallback
    }

    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3].toUpperCase();

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    return new Date(year, month, day, hours, minutes);
  };

  // Compute effective status based on date/time + stored status
  const getEffectiveStatus = (appointment: Appointment): "upcoming" | "completed" | "canceled" => {
    // Canceled appointments ALWAYS stay canceled (regardless of time)
    if (appointment.status === "canceled") {
      return "canceled";
    }

    // Explicitly completed appointments stay completed
    if (appointment.status === "completed") {
      return "completed";
    }

    // For "upcoming" status, check if appointment time has passed
    const appointmentDateTime = parseAppointmentDateTime(appointment.date, appointment.time);
    const now = new Date();

    if (appointmentDateTime <= now) {
      // Past appointment that was never explicitly completed → auto-infer as completed
      return "completed";
    }

    return "upcoming";
  };

  // ============================================
  // END COMPUTED STATUS LOGIC
  // ============================================

  // ============================================
  // TODAY'S APPOINTMENTS HELPER
  // ============================================
  const getTodaysAppointments = (): Appointment[] => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Filter for today's appointments (only upcoming status, not cancelled/completed)
    const todayAppts = appointments.filter((appointment) => {
      const effectiveStatus = getEffectiveStatus(appointment);
      // Only show upcoming appointments for today
      if (effectiveStatus !== "upcoming") return false;

      const apptDateTime = parseAppointmentDateTime(appointment.date, appointment.time);
      return apptDateTime >= todayStart && apptDateTime <= todayEnd;
    });

    // Sort: Emergency first, then by time
    return todayAppts.sort((a, b) => {
      const aIsEmergency = a.type === "Emergency";
      const bIsEmergency = b.type === "Emergency";

      // Emergency appointments first
      if (aIsEmergency && !bIsEmergency) return -1;
      if (!aIsEmergency && bIsEmergency) return 1;

      // Within same priority, sort by time
      const aTime = parseAppointmentDateTime(a.date, a.time);
      const bTime = parseAppointmentDateTime(b.date, b.time);
      return aTime.getTime() - bTime.getTime();
    });
  };

  // Filtered appointments based on active filter
  const filteredAppointments = activeFilter === "today"
    ? getTodaysAppointments()
    : appointments.filter(
      (appointment) => getEffectiveStatus(appointment) === activeFilter
    );

  // Status colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case "upcoming":
        return "#0070D6";
      case "completed":
        return "#4CAF50";
      case "canceled":
        return "#E53935";
      default:
        return "#718096";
    }
  };

  // Handle tab navigation
  const handleTabNavigation = (tabName: string) => {
    if (tabName === "Home") {
      navigation.navigate("DoctorDashboard");
    } else if (tabName === "Patients") {
      navigation.navigate("Patients");
    } else if (tabName === "Schedule") {
      // Already on appointments/schedule screen, do nothing
    } else if (tabName === "Profile") {
      navigation.navigate("Profile");
    }
  };

  // Handle saving a new appointment
  const handleSaveAppointment = async (appointmentData: any) => {
    try {
      setIsLoading(true);

      const response = await fetch(API_ENDPOINTS.APPOINTMENTS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(appointmentData),
      });

      if (!response.ok) {
        // Try to parse the error message from the backend
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // If parsing fails, use default error message
        }

        if (response.status === 409) {
          Alert.alert("Scheduling Conflict", errorMessage);
          return;
        }

        if (response.status === 400) {
          Alert.alert("Invalid Input", errorMessage);
          return;
        }

        throw new Error(errorMessage);
      }

      await response.json();

      // Refresh the list
      await fetchAppointments();

      // Close the modal
      setModalVisible(false);

      // Show confirmation
      Alert.alert(
        "Appointment Created",
        `Appointment for ${appointmentData.patientName} on ${appointmentData.date} at ${appointmentData.time} has been scheduled.`
      );
    } catch (error) {
      handleApiError(error, "saving appointment");
    } finally {
      setIsLoading(false);
    }
  };

  // Appointment card component - REDESIGNED
  const AppointmentCard = ({ appointment }: { appointment: Appointment }) => {
    const effectiveStatus = getEffectiveStatus(appointment);
    const initials = appointment.patientName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
      <TouchableOpacity
        style={styles.appointmentCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("AppointmentDetails", { appointment })}
      >
        {/* Status indicator line */}
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(effectiveStatus) }]} />

        <View style={styles.cardContent}>
          {/* Top row: Avatar + Info + Type badge */}
          <View style={styles.appointmentHeader}>
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: getStatusColor(effectiveStatus) + '20' }]}>
              <Text style={[styles.avatarText, { color: getStatusColor(effectiveStatus) }]}>{initials}</Text>
            </View>

            {/* Patient Info */}
            <View style={styles.patientInfo}>
              <Text style={styles.patientName}>{appointment.patientName}</Text>
              <View style={styles.patientMeta}>
                <Text style={styles.patientAge}>{appointment.patientAge} yrs</Text>
                <View style={styles.dot} />
                <Text style={[styles.statusLabel, { color: getStatusColor(effectiveStatus) }]}>
                  {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
                </Text>
              </View>
            </View>

            {/* Type badge */}
            <View style={[styles.typeTag, { backgroundColor: getTypeColor(appointment.type) }]}>
              <Text style={[styles.typeText, { color: getTypeTextColor(appointment.type) }]}>
                {appointment.type}
              </Text>
            </View>
          </View>

          {/* Date and Time row */}
          <View style={styles.appointmentDetails}>
            <View style={styles.detailChip}>
              <Ionicons name="calendar" size={14} color="#0D9488" />
              <Text style={styles.detailText}>{appointment.date}</Text>
            </View>
            <View style={styles.detailChip}>
              <Ionicons name="time" size={14} color="#0891B2" />
              <Text style={styles.detailText}>{appointment.time}</Text>
            </View>
          </View>

          {/* Quick actions for upcoming only */}
          {effectiveStatus === "upcoming" && (
            <View style={styles.appointmentActions}>
              <TouchableOpacity style={styles.actionChip}>
                <Ionicons name="call" size={16} color="#10B981" />
                <Text style={[styles.actionText, { color: '#10B981' }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionChip}>
                <Ionicons name="chatbubble" size={16} color="#3B82F6" />
                <Text style={[styles.actionText, { color: '#3B82F6' }]}>Message</Text>
              </TouchableOpacity>
              <View style={styles.actionSpacer} />
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </View>
          )}

          {/* Chevron for non-upcoming */}
          {effectiveStatus !== "upcoming" && (
            <View style={styles.chevronContainer}>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Type tag colors - ENHANCED
  const getTypeColor = (type: string) => {
    switch (type) {
      case "Follow-up":
        return "#DBEAFE";
      case "Check-up":
        return "#D1FAE5";
      case "Consultation":
        return "#FEF3C7";
      case "Emergency":
        return "#FEE2E2";
      default:
        return "#F1F5F9";
    }
  };

  // Type text colors
  const getTypeTextColor = (type: string) => {
    switch (type) {
      case "Follow-up":
        return "#1D4ED8";
      case "Check-up":
        return "#047857";
      case "Consultation":
        return "#B45309";
      case "Emergency":
        return "#DC2626";
      default:
        return "#475569";
    }
  };

  // Empty state component - REDESIGNED
  const EmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="calendar-outline" size={48} color="#0D9488" />
      </View>
      <Text style={styles.emptyStateTitle}>
        {activeFilter === "today" ? "No appointments today" : `No ${activeFilter} appointments`}
      </Text>
      <Text style={styles.emptyStateText}>
        {activeFilter === "today"
          ? "You have no scheduled appointments for today"
          : activeFilter === "upcoming"
            ? "Book a new appointment using the + button above"
            : `You don't have any ${activeFilter} appointments yet`}
      </Text>
    </View>
  );

  // Error state component - REDESIGNED
  const ErrorState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { backgroundColor: '#FEE2E2' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color="#DC2626" />
      </View>
      <Text style={styles.emptyStateTitle}>Connection Failed</Text>
      <Text style={styles.emptyStateText}>{fetchError}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={fetchAppointments}
        activeOpacity={0.8}
      >
        <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  // Loading state component - REDESIGNED
  const LoadingState = () => (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color="#0D9488" />
      <Text style={[styles.emptyStateText, { marginTop: 20 }]}>Loading your appointments...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0070D6" />
      {/* Modern Gradient-style Header with SafeArea */}
      <View style={styles.headerBackground}>
        <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Appointments</Text>
              <Text style={styles.headerSubtitle}>
                {filteredAppointments.length} {activeFilter}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={26} color="white" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      {/* Modern Pill-style Filter Tabs */}
      <View style={styles.filterWrapper}>
        <View style={styles.filterContainer}>
          {filterTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                activeFilter === tab.key && styles.activeFilterTab,
              ]}
              onPress={() => setActiveFilter(tab.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === tab.key && styles.activeFilterText,
                ]}
              >
                {tab.label}
              </Text>
              {activeFilter === tab.key && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{filteredAppointments.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Appointment list */}
      {isLoading && appointments.length === 0 ? (
        <LoadingState />
      ) : fetchError ? (
        <ErrorState />
      ) : filteredAppointments.length > 0 ? (
        <FlatList
          data={filteredAppointments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AppointmentCard appointment={item} />}
          contentContainerStyle={styles.appointmentsList}
          showsVerticalScrollIndicator={false}
          refreshing={isLoading}
          onRefresh={fetchAppointments}
        />
      ) : (
        <EmptyState />
      )}

      {/* New Appointment Modal */}
      <NewAppointmentModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveAppointment}
      />

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Home")}
        >
          <Ionicons name="home-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Home</Text>
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
          <Ionicons name="calendar" size={24} color="#0070D6" />
          <Text style={[styles.navText, { color: "#0070D6" }]}>Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabNavigation("Profile")}
        >
          <Ionicons name="person-outline" size={24} color="#718096" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  // ====== HEADER STYLES ======
  headerBackground: {
    backgroundColor: "#0070D6",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingTop: Platform.OS === 'android' ? 35 : 0,
  },
  headerSafeArea: {
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  addButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  // ====== FILTER TAB STYLES ======
  filterWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 6,
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
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  activeFilterTab: {
    backgroundColor: "#0070D6",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  activeFilterText: {
    color: "#FFFFFF",
  },
  filterBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // ====== APPOINTMENT LIST STYLES ======
  appointmentsList: {
    padding: 16,
    paddingBottom: 100,
  },
  // ====== APPOINTMENT CARD STYLES ======
  appointmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
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
  statusIndicator: {
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  appointmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 3,
  },
  patientMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  patientAge: {
    fontSize: 12,
    color: "#718096",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 8,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  typeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  // ====== APPOINTMENT DETAILS (DATE/TIME) ======
  appointmentDetails: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 10,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  // ====== APPOINTMENT ACTIONS ======
  appointmentActions: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 10,
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  actionSpacer: {
    flex: 1,
  },
  chevronContainer: {
    alignItems: "flex-end",
    marginTop: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  rescheduleButton: {
    marginLeft: "auto",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rescheduleText: {
    fontSize: 14,
    color: "#1D4ED8",
    fontWeight: "500",
  },
  viewNotesButton: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewNotesText: {
    fontSize: 14,
    color: "#047857",
    fontWeight: "500",
  },
  // ====== EMPTY STATE STYLES ======
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#E6FFFA",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateText: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: "#0D9488",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#0D9488",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // ====== BOTTOM NAV STYLES ======
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  navItem: {
    alignItems: "center",
    paddingVertical: 4,
  },
  navText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    fontWeight: "500",
  },
});

export default Appointments;
