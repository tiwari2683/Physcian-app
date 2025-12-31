import React, { useState } from "react";
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Platform,
    Alert,
    SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { API_ENDPOINTS } from "../../Config";

interface Appointment {
    id: number;
    patientId?: string; // LINKED PATIENT ID
    patientName: string;
    patientAge: number;
    date: string;
    time: string;
    type: string;
    status: "upcoming" | "completed" | "canceled";
    notes?: string;
}

const AppointmentDetails = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { appointment } = route.params as { appointment: Appointment };
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

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

    const handleEdit = () => {
        Alert.alert("Coming Soon", "Edit functionality will be implemented soon.");
    };

    // New Function: Fetch and View Profile
    const handleViewProfile = async () => {
        if (!appointment.patientId) {
            Alert.alert("No Profile", "This appointment is not linked to a registered patient profile.");
            return;
        }

        try {
            setIsLoadingProfile(true);
            const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "getPatient",
                    patientId: appointment.patientId
                })
            });

            if (!response.ok) throw new Error("Failed to fetch patient data");

            const data = await response.json();
            const responseData = typeof data.body === 'string' ? JSON.parse(data.body) : data;

            if (responseData.success && responseData.patient) {
                // Navigate to NewPatientForm in 'read-only/edit' mode
                (navigation as any).navigate("NewPatientForm", {
                    patient: responseData.patient,
                    prefillMode: true,
                    initialTab: "basic"
                });
            } else {
                throw new Error("Patient not found");
            }
        } catch (error) {
            console.error("Profile fetch error:", error);
            Alert.alert("Error", "Could not load patient profile.");
        } finally {
            setIsLoadingProfile(false);
        }
    };

    const handleCancel = () => {
        Alert.alert(
            "Cancel Appointment",
            "Are you sure you want to cancel this appointment?",
            [
                { text: "No", style: "cancel" },
                {
                    text: "Yes",
                    style: "destructive",
                    onPress: () => {
                        console.log("Canceling appointment", appointment.id);
                        navigation.goBack();
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={24} color="#2D3748" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Appointment Details</Text>
                <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                    <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Main Card */}
                <View style={styles.card}>
                    <View style={styles.patientSection}>
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {appointment.patientName.charAt(0)}
                            </Text>
                        </View>
                        <View>
                            <Text style={styles.patientName}>{appointment.patientName}</Text>
                            <Text style={styles.patientAge}>
                                {appointment.patientAge} years old
                            </Text>
                            {appointment.patientId && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                                    <Text style={{ fontSize: 12, color: "#4CAF50", marginLeft: 4 }}>Registered Profile</Text>
                                </View>
                            )}
                        </View>
                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: getStatusColor(appointment.status) + "20" },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.statusText,
                                    { color: getStatusColor(appointment.status) },
                                ]}
                            >
                                {appointment.status.charAt(0).toUpperCase() +
                                    appointment.status.slice(1)}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.detailsGrid}>
                        <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Date</Text>
                            <View style={styles.detailValueContainer}>
                                <Ionicons name="calendar-outline" size={18} color="#4A5568" />
                                <Text style={styles.detailValue}>{appointment.date}</Text>
                            </View>
                        </View>
                        <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Time</Text>
                            <View style={styles.detailValueContainer}>
                                <Ionicons name="time-outline" size={18} color="#4A5568" />
                                <Text style={styles.detailValue}>{appointment.time}</Text>
                            </View>
                        </View>
                        <View style={styles.detailItem}>
                            <Text style={styles.detailLabel}>Type</Text>
                            <View style={styles.detailValueContainer}>
                                <Ionicons name="medical-outline" size={18} color="#4A5568" />
                                <Text style={styles.detailValue}>{appointment.type}</Text>
                            </View>
                        </View>
                    </View>

                    {appointment.notes ? (
                        <View style={styles.notesSection}>
                            <Text style={styles.detailLabel}>Notes</Text>
                            <Text style={styles.notesText}>{appointment.notes}</Text>
                        </View>
                    ) : null}
                </View>

                {/* Actions */}
                {appointment.status === "upcoming" && (
                    <View style={styles.actionsContainer}>
                        {/* New View Profile Button */}
                        {appointment.patientId && (
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#38A169', marginBottom: 8 }]}
                                onPress={handleViewProfile}
                                disabled={isLoadingProfile}
                            >
                                <Ionicons name="person" size={20} color="#FFFFFF" />
                                <Text style={styles.actionButtonText}>
                                    {isLoadingProfile ? "Loading..." : "View Patient Profile"}
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.actionButton}>
                            <Ionicons name="call" size={20} color="#FFFFFF" />
                            <Text style={styles.actionButtonText}>Call Patient</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.secondaryButton]}
                        >
                            <Ionicons name="chatbubble" size={20} color="#0070D6" />
                            <Text style={styles.secondaryButtonText}>Message</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.cancelActionButton]}
                            onPress={handleCancel}
                        >
                            <Text style={styles.cancelActionText}>Cancel Appointment</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
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
        paddingVertical: 12,
        backgroundColor: "#FFFFFF",
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
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
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#2D3748",
    },
    editButton: {
        padding: 8,
    },
    editButtonText: {
        fontSize: 16,
        color: "#0070D6",
        fontWeight: "500",
    },
    content: {
        padding: 16,
    },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
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
    patientSection: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    avatarPlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: "#EBF8FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    avatarText: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#0070D6",
    },
    patientName: {
        fontSize: 20,
        fontWeight: "700",
        color: "#2D3748",
        marginBottom: 4,
    },
    patientAge: {
        fontSize: 14,
        color: "#718096",
    },
    statusBadge: {
        marginLeft: "auto",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    statusText: {
        fontSize: 12,
        fontWeight: "600",
    },
    divider: {
        height: 1,
        backgroundColor: "#E2E8F0",
        marginBottom: 20,
    },
    detailsGrid: {
        gap: 20,
    },
    detailItem: {
        marginBottom: 16,
    },
    detailLabel: {
        fontSize: 14,
        color: "#718096",
        marginBottom: 6,
    },
    detailValueContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    detailValue: {
        fontSize: 16,
        color: "#2D3748",
        fontWeight: "500",
        marginLeft: 8,
    },
    notesSection: {
        marginTop: 8,
        backgroundColor: "#F7FAFC",
        padding: 12,
        borderRadius: 8,
    },
    notesText: {
        fontSize: 15,
        color: "#4A5568",
        lineHeight: 22,
    },
    actionsContainer: {
        gap: 12,
    },
    actionButton: {
        flexDirection: "row",
        backgroundColor: "#0070D6",
        paddingVertical: 14,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    actionButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "600",
        marginLeft: 8,
    },
    secondaryButton: {
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#0070D6",
    },
    secondaryButtonText: {
        color: "#0070D6",
        fontSize: 16,
        fontWeight: "600",
        marginLeft: 8,
    },
    cancelActionButton: {
        paddingVertical: 14,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 8,
    },
    cancelActionText: {
        color: "#E53935",
        fontSize: 16,
        fontWeight: "500",
    },
});

export default AppointmentDetails;
