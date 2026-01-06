import React, { useState } from "react";
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Platform,
    Alert,
    Linking,
    ActivityIndicator,
    StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    const { appointment: initialAppointment } = route.params as { appointment: Appointment };
    const [appointment, setAppointment] = useState<Appointment>(initialAppointment);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [isCanceling, setIsCanceling] = useState(false);

    const getStatusColor = (status: string) => {
        switch (status) {
            case "upcoming":
                return "#3B82F6";
            case "completed":
                return "#10B981";
            case "canceled":
                return "#EF4444";
            default:
                return "#64748B";
        }
    };

    // Type colors matching Appointments.tsx
    const getTypeColor = (type: string) => {
        switch (type) {
            case "Follow-up":
                return { bg: "#DBEAFE", text: "#1D4ED8" };
            case "Check-up":
                return { bg: "#D1FAE5", text: "#047857" };
            case "Consultation":
                return { bg: "#FEF3C7", text: "#B45309" };
            case "Emergency":
                return { bg: "#FEE2E2", text: "#DC2626" };
            default:
                return { bg: "#F1F5F9", text: "#475569" };
        }
    };

    // ============================================
    // COMPUTED STATUS LOGIC (same as Appointments.tsx)
    // ============================================

    // Parse "Jan 6, 2026" + "3:00 PM" into a Date object
    const parseAppointmentDateTime = (dateStr: string, timeStr: string): Date => {
        const months: Record<string, number> = {
            "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5,
            "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
        };

        const dateMatch = dateStr?.match(/(\w+)\s+(\d+),\s+(\d+)/);
        if (!dateMatch) return new Date(0);

        const month = months[dateMatch[1]] ?? 0;
        const day = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);

        const timeMatch = timeStr?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!timeMatch) return new Date(year, month, day, 23, 59);

        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3].toUpperCase();

        if (ampm === "PM" && hours !== 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;

        return new Date(year, month, day, hours, minutes);
    };

    // Compute effective status based on date/time
    const getEffectiveStatus = (): "upcoming" | "completed" | "canceled" => {
        if (appointment.status === "canceled") return "canceled";
        if (appointment.status === "completed") return "completed";

        const appointmentDateTime = parseAppointmentDateTime(appointment.date, appointment.time);
        if (appointmentDateTime <= new Date()) return "completed";

        return "upcoming";
    };

    const effectiveStatus = getEffectiveStatus();

    // Edit is disabled for now
    const isEditDisabled = true;

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
                    onPress: async () => {
                        setIsCanceling(true);
                        try {
                            const response = await fetch(API_ENDPOINTS.APPOINTMENTS, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    ...appointment,
                                    id: String(appointment.id),
                                    status: "canceled"
                                })
                            });

                            if (!response.ok) {
                                throw new Error("Failed to cancel appointment");
                            }

                            setAppointment(prev => ({ ...prev, status: "canceled" }));
                            Alert.alert("Success", "Appointment has been canceled.", [
                                { text: "OK", onPress: () => navigation.goBack() }
                            ]);
                        } catch (error) {
                            console.error("Cancel error:", error);
                            Alert.alert("Error", "Failed to cancel appointment. Please try again.");
                        } finally {
                            setIsCanceling(false);
                        }
                    },
                },
            ]
        );
    };

    const handleCall = () => {
        // In a real app, you'd have the patient's phone number
        Alert.alert("Call Patient", "Phone number not available for this appointment.");
    };

    const handleMessage = () => {
        Alert.alert("Message Patient", "Messaging feature coming soon.");
    };

    const initials = appointment.patientName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const typeColors = getTypeColor(appointment.type);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0D9488" />
            {/* Header Background that extends to top */}
            <View style={styles.headerBackground}>
                <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Appointment</Text>
                        <View style={{ width: 40 }} />
                    </View>
                </SafeAreaView>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Status Banner */}
                <View style={[styles.statusBanner, { backgroundColor: getStatusColor(effectiveStatus) + '15' }]}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(effectiveStatus) }]} />
                    <Text style={[styles.statusBannerText, { color: getStatusColor(effectiveStatus) }]}>
                        {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)} Appointment
                    </Text>
                </View>

                {/* Patient Card */}
                <View style={styles.card}>
                    <View style={styles.patientSection}>
                        <View style={[styles.avatar, { backgroundColor: getStatusColor(effectiveStatus) + '20' }]}>
                            <Text style={[styles.avatarText, { color: getStatusColor(effectiveStatus) }]}>
                                {initials}
                            </Text>
                        </View>
                        <View style={styles.patientInfo}>
                            <Text style={styles.patientName}>{appointment.patientName}</Text>
                            <View style={styles.patientMeta}>
                                <Text style={styles.patientAge}>{appointment.patientAge} years old</Text>
                                {appointment.patientId && (
                                    <View style={styles.verifiedBadge}>
                                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                                        <Text style={styles.verifiedText}>Verified</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Type Badge */}
                    <View style={[styles.typeBadge, { backgroundColor: typeColors.bg }]}>
                        <Ionicons name="medical" size={16} color={typeColors.text} />
                        <Text style={[styles.typeBadgeText, { color: typeColors.text }]}>
                            {appointment.type}
                        </Text>
                    </View>
                </View>

                {/* Details Card */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Appointment Details</Text>

                    <View style={styles.detailRow}>
                        <View style={styles.detailIconContainer}>
                            <Ionicons name="calendar" size={20} color="#0D9488" />
                        </View>
                        <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Date</Text>
                            <Text style={styles.detailValue}>{appointment.date}</Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <View style={styles.detailIconContainer}>
                            <Ionicons name="time" size={20} color="#0891B2" />
                        </View>
                        <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Time</Text>
                            <Text style={styles.detailValue}>{appointment.time}</Text>
                        </View>
                    </View>

                    {appointment.notes && (
                        <View style={styles.notesSection}>
                            <View style={styles.noteHeader}>
                                <Ionicons name="document-text" size={18} color="#64748B" />
                                <Text style={styles.noteTitle}>Notes</Text>
                            </View>
                            <Text style={styles.notesText}>{appointment.notes}</Text>
                        </View>
                    )}
                </View>

                {/* Actions - Only show for truly upcoming appointments */}
                {effectiveStatus === "upcoming" && (
                    <View style={styles.actionsCard}>
                        {/* View Profile Button */}
                        {appointment.patientId && (
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={handleViewProfile}
                                disabled={isLoadingProfile}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="person" size={20} color="#FFFFFF" />
                                <Text style={styles.primaryButtonText}>
                                    {isLoadingProfile ? "Loading..." : "View Patient Profile"}
                                </Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.actionChip} onPress={handleCall}>
                                <Ionicons name="call" size={18} color="#10B981" />
                                <Text style={[styles.actionChipText, { color: '#10B981' }]}>Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionChip} onPress={handleMessage}>
                                <Ionicons name="chatbubble" size={18} color="#3B82F6" />
                                <Text style={[styles.actionChipText, { color: '#3B82F6' }]}>Message</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={handleCancel}
                            disabled={isCanceling}
                            activeOpacity={0.7}
                        >
                            {isCanceling ? (
                                <ActivityIndicator color="#EF4444" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                                    <Text style={styles.cancelButtonText}>Cancel Appointment</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {/* Completed/Canceled Status Info */}
                {effectiveStatus !== "upcoming" && (
                    <View style={[styles.statusInfoCard, { borderColor: getStatusColor(effectiveStatus) + '40' }]}>
                        <Ionicons
                            name={effectiveStatus === "completed" ? "checkmark-circle" : "close-circle"}
                            size={24}
                            color={getStatusColor(effectiveStatus)}
                        />
                        <Text style={[styles.statusInfoText, { color: getStatusColor(effectiveStatus) }]}>
                            This appointment has been {effectiveStatus}
                        </Text>
                    </View>
                )}
            </ScrollView>
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
        backgroundColor: "#0D9488",
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        paddingTop: Platform.OS === 'android' ? 35 : 0,
    },
    headerSafeArea: {
        backgroundColor: "transparent",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 20,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: "rgba(255, 255, 255, 0.25)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.3)",
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    // ====== CONTENT AREA ======
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    // ====== STATUS BANNER ======
    statusBanner: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 10,
    },
    statusBannerText: {
        fontSize: 15,
        fontWeight: "600",
    },
    // ====== CARD STYLES ======
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        ...Platform.select({
            ios: {
                shadowColor: "#1E293B",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 12,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    // ====== PATIENT SECTION ======
    patientSection: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    avatarText: {
        fontSize: 20,
        fontWeight: "700",
    },
    patientInfo: {
        flex: 1,
    },
    patientName: {
        fontSize: 20,
        fontWeight: "700",
        color: "#1E293B",
        marginBottom: 4,
    },
    patientMeta: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
    },
    patientAge: {
        fontSize: 14,
        color: "#64748B",
    },
    verifiedBadge: {
        flexDirection: "row",
        alignItems: "center",
        marginLeft: 12,
    },
    verifiedText: {
        fontSize: 12,
        color: "#10B981",
        fontWeight: "600",
        marginLeft: 4,
    },
    // ====== TYPE BADGE ======
    typeBadge: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        gap: 6,
    },
    typeBadgeText: {
        fontSize: 14,
        fontWeight: "600",
    },
    // ====== SECTION TITLE ======
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#1E293B",
        marginBottom: 16,
    },
    // ====== DETAIL ROW ======
    detailRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    detailIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: "#F1F5F9",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    detailContent: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 12,
        color: "#64748B",
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 16,
        color: "#1E293B",
        fontWeight: "600",
    },
    // ====== NOTES SECTION ======
    notesSection: {
        marginTop: 8,
        backgroundColor: "#F8FAFC",
        padding: 14,
        borderRadius: 14,
    },
    noteHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    noteTitle: {
        fontSize: 14,
        color: "#64748B",
        fontWeight: "600",
        marginLeft: 8,
    },
    notesText: {
        fontSize: 15,
        color: "#475569",
        lineHeight: 22,
    },
    // ====== ACTIONS CARD ======
    actionsCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        ...Platform.select({
            ios: {
                shadowColor: "#1E293B",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 12,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    primaryButton: {
        flexDirection: "row",
        backgroundColor: "#0D9488",
        paddingVertical: 16,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
        gap: 8,
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
    primaryButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "600",
    },
    actionRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 12,
        marginBottom: 16,
    },
    actionChip: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F8FAFC",
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    actionChipText: {
        fontSize: 15,
        fontWeight: "600",
    },
    cancelButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#FEF2F2",
        gap: 8,
    },
    cancelButtonText: {
        color: "#EF4444",
        fontSize: 15,
        fontWeight: "600",
    },
    // ====== STATUS INFO CARD ======
    statusInfoCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        paddingVertical: 20,
        paddingHorizontal: 24,
        borderRadius: 16,
        borderWidth: 2,
        gap: 12,
    },
    statusInfoText: {
        fontSize: 15,
        fontWeight: "600",
    },
    // ====== LEGACY STYLES ======
    editButton: {
        padding: 8,
    },
    editButtonText: {
        fontSize: 16,
        color: "#0D9488",
        fontWeight: "500",
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
    detailValueContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    actionsContainer: {
        gap: 12,
    },
    actionButton: {
        flexDirection: "row",
        backgroundColor: "#0D9488",
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
        borderColor: "#0D9488",
    },
    secondaryButtonText: {
        color: "#0D9488",
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
        color: "#EF4444",
        fontSize: 16,
        fontWeight: "500",
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
});

export default AppointmentDetails;
