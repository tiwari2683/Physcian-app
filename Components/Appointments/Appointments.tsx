import React, { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import NewAppointmentModal from "./NewAppointmentModal"; // Import the modal component

const { width } = Dimensions.get("window");

// Types
interface Appointment {
  id: number;
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

const Appointments: React.FC<AppointmentsProps> = ({ navigation }) => {
  // Filter states
  const [activeFilter, setActiveFilter] = useState<string>("upcoming");

  // Modal visibility state
  const [modalVisible, setModalVisible] = useState(false);

  // Mock appointment data
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: 1,
      patientName: "John Smith",
      patientAge: 45,
      date: "Mar 4, 2025",
      time: "9:00 AM",
      type: "Follow-up",
      status: "upcoming",
    },
    {
      id: 2,
      patientName: "Maria Garcia",
      patientAge: 62,
      date: "Mar 4, 2025",
      time: "11:30 AM",
      type: "Check-up",
      status: "upcoming",
    },
    {
      id: 3,
      patientName: "David Lee",
      patientAge: 38,
      date: "Mar 5, 2025",
      time: "10:15 AM",
      type: "Consultation",
      status: "upcoming",
    },
    {
      id: 4,
      patientName: "Lisa Johnson",
      patientAge: 52,
      date: "Mar 3, 2025",
      time: "2:00 PM",
      type: "Check-up",
      status: "completed",
    },
    {
      id: 5,
      patientName: "Robert Chen",
      patientAge: 41,
      date: "Mar 2, 2025",
      time: "4:30 PM",
      type: "Follow-up",
      status: "completed",
    },
    {
      id: 6,
      patientName: "Emily Wilson",
      patientAge: 29,
      date: "Mar 4, 2025",
      time: "3:45 PM",
      type: "Emergency",
      status: "canceled",
    },
  ]);

  // Filter tabs
  const filterTabs = [
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
    { key: "canceled", label: "Canceled" },
  ];

  // Filtered appointments based on active filter
  const filteredAppointments = appointments.filter(
    (appointment) => appointment.status === activeFilter
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
  const handleSaveAppointment = (appointmentData: any) => {
    // Generate a new unique ID
    const newId = Math.max(...appointments.map((a) => a.id), 0) + 1;

    // Create new appointment object
    const newAppointment: Appointment = {
      id: newId,
      ...appointmentData,
    };

    // Add to the appointments array
    setAppointments([...appointments, newAppointment]);

    // Close the modal
    setModalVisible(false);

    // Show confirmation
    Alert.alert(
      "Appointment Created",
      `Appointment for ${appointmentData.patientName} on ${appointmentData.date} at ${appointmentData.time} has been scheduled.`
    );
  };

  // Appointment card component
  const AppointmentCard = ({ appointment }: { appointment: Appointment }) => (
    <TouchableOpacity
      style={styles.appointmentCard}
      activeOpacity={0.7}
      onPress={() => navigation.navigate("AppointmentDetails", { appointment })}
    >
      <View style={styles.appointmentHeader}>
        <View style={styles.patientInfo}>
          <Text style={styles.patientName}>{appointment.patientName}</Text>
          <Text style={styles.patientAge}>{appointment.patientAge} years</Text>
        </View>
        <View
          style={[
            styles.typeTag,
            { backgroundColor: getTypeColor(appointment.type) },
          ]}
        >
          <Text style={styles.typeText}>{appointment.type}</Text>
        </View>
      </View>

      <View style={styles.appointmentDetails}>
        <View style={styles.detailItem}>
          <Ionicons name="calendar-outline" size={16} color="#718096" />
          <Text style={styles.detailText}>{appointment.date}</Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="time-outline" size={16} color="#718096" />
          <Text style={styles.detailText}>{appointment.time}</Text>
        </View>
      </View>

      <View style={styles.appointmentActions}>
        {appointment.status === "upcoming" && (
          <>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="call-outline" size={18} color="#0070D6" />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="chatbubble-outline" size={18} color="#15A1B1" />
              <Text style={styles.actionText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rescheduleButton]}
              onPress={() =>
                navigation.navigate("RescheduleAppointment", { appointment })
              }
            >
              <Text style={styles.rescheduleText}>Reschedule</Text>
            </TouchableOpacity>
          </>
        )}
        {appointment.status === "completed" && (
          <TouchableOpacity
            style={[styles.actionButton, styles.viewNotesButton]}
            onPress={() =>
              navigation.navigate("PatientNotes", { patientId: appointment.id })
            }
          >
            <Text style={styles.viewNotesText}>View Notes</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  // Type tag colors
  const getTypeColor = (type: string) => {
    switch (type) {
      case "Follow-up":
        return "#E3F2FD";
      case "Check-up":
        return "#E8F5E9";
      case "Consultation":
        return "#FFF8E1";
      case "Emergency":
        return "#FFEBEE";
      default:
        return "#ECEFF1";
    }
  };

  // Empty state component
  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="calendar-outline" size={60} color="#CBD5E0" />
      <Text style={styles.emptyStateTitle}>No Appointments</Text>
      <Text style={styles.emptyStateText}>
        There are no {activeFilter} appointments to display
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Appointments</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)} // Open the modal when + is clicked
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        {filterTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterTab,
              activeFilter === tab.key && styles.activeFilterTab,
            ]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === tab.key && styles.activeFilterText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Appointment list */}
      {filteredAppointments.length > 0 ? (
        <FlatList
          data={filteredAppointments}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <AppointmentCard appointment={item} />}
          contentContainerStyle={styles.appointmentsList}
          showsVerticalScrollIndicator={false}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2D3748",
  },
  addButton: {
    backgroundColor: "#0070D6",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  activeFilterTab: {
    backgroundColor: "#0070D6",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#718096",
  },
  activeFilterText: {
    color: "#FFFFFF",
  },
  appointmentsList: {
    padding: 16,
    paddingBottom: 80, // For bottom nav
  },
  appointmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  appointmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 2,
  },
  patientAge: {
    fontSize: 14,
    color: "#718096",
  },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#2D3748",
  },
  appointmentDetails: {
    flexDirection: "row",
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  detailText: {
    fontSize: 14,
    color: "#718096",
    marginLeft: 4,
  },
  appointmentActions: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 12,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  actionText: {
    fontSize: 14,
    marginLeft: 4,
    color: "#718096",
  },
  rescheduleButton: {
    marginLeft: "auto",
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rescheduleText: {
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "500",
  },
  viewNotesButton: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewNotesText: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#718096",
    textAlign: "center",
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

export default Appointments;
