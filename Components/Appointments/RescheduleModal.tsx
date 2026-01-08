import React, { useState, useEffect } from "react";
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Modal,
    Platform,
    ActivityIndicator,
    KeyboardAvoidingView,
    ScrollView,
    TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

interface Appointment {
    id: number | string;
    patientName: string;
    date: string;
    time: string;
    notes?: string;
}

interface RescheduleModalProps {
    visible: boolean;
    onClose: () => void;
    onReschedule: (date: string, time: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
    appointment: Appointment;
    isLoading: boolean;
    error: string | null;
}

const RescheduleModal: React.FC<RescheduleModalProps> = ({
    visible,
    onClose,
    onReschedule,
    appointment,
    isLoading,
    error,
}) => {
    // Parse existing date/time to Date objects
    const parseDate = (dateStr: string): Date => {
        const months: Record<string, number> = {
            "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5,
            "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
        };
        const match = dateStr?.match(/(\w+)\s+(\d+),\s+(\d+)/);
        if (!match) return new Date();
        return new Date(parseInt(match[3]), months[match[1]] ?? 0, parseInt(match[2]));
    };

    const parseTime = (timeStr: string): Date => {
        const match = timeStr?.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return new Date();

        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const ampm = match[3].toUpperCase();

        if (ampm === "PM" && hours !== 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;

        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    };

    const [date, setDate] = useState<Date>(parseDate(appointment.date));
    const [time, setTime] = useState<Date>(parseTime(appointment.time));
    const [notes, setNotes] = useState<string>(appointment.notes || "");
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (visible) {
            setDate(parseDate(appointment.date));
            setTime(parseTime(appointment.time));
            setNotes(appointment.notes || "");
            setValidationError(null);
        }
    }, [visible, appointment]);

    const formatDate = (d: Date): string => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    };

    const formatTime = (d: Date): string => {
        let hours = d.getHours();
        const minutes = d.getMinutes();
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12;
        const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
        return `${hours}:${formattedMinutes} ${ampm}`;
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === "ios");
        if (selectedDate) {
            setDate(selectedDate);
            setValidationError(null);
        }
    };

    const handleTimeChange = (event: any, selectedTime?: Date) => {
        setShowTimePicker(Platform.OS === "ios");
        if (selectedTime) {
            setTime(selectedTime);
            setValidationError(null);
        }
    };

    const handleSubmit = async () => {
        const newDateStr = formatDate(date);
        const newTimeStr = formatTime(time);

        // Check if nothing changed
        if (newDateStr === appointment.date && newTimeStr === appointment.time && notes === (appointment.notes || "")) {
            setValidationError("No changes detected. Please modify the date, time, or notes.");
            return;
        }

        // Validate date/time is in the future
        const appointmentDateTime = new Date(date);
        appointmentDateTime.setHours(time.getHours(), time.getMinutes(), 0, 0);

        if (appointmentDateTime <= new Date()) {
            setValidationError("Please select a future date and time.");
            return;
        }

        setValidationError(null);
        await onReschedule(newDateStr, newTimeStr, notes);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.modalContainer}
            >
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Reschedule Appointment</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={isLoading}>
                            <Ionicons name="close" size={24} color="#718096" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContainer}>
                        {/* Patient Info Banner */}
                        <View style={styles.patientBanner}>
                            <Ionicons name="person-circle-outline" size={24} color="#0D9488" />
                            <Text style={styles.patientName}>{appointment.patientName}</Text>
                        </View>

                        {/* Current Appointment Info */}
                        <View style={styles.currentInfo}>
                            <Text style={styles.currentInfoLabel}>Current Schedule</Text>
                            <Text style={styles.currentInfoValue}>{appointment.date} at {appointment.time}</Text>
                        </View>

                        {/* Error Display */}
                        {(error || validationError) && (
                            <View style={styles.errorBanner}>
                                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                                <Text style={styles.errorText}>{error || validationError}</Text>
                            </View>
                        )}

                        {/* Date Picker */}
                        <Text style={styles.inputLabel}>New Date *</Text>
                        <TouchableOpacity
                            style={styles.datePickerButton}
                            onPress={() => setShowDatePicker(true)}
                            disabled={isLoading}
                        >
                            <Ionicons name="calendar-outline" size={20} color="#718096" />
                            <Text style={styles.dateText}>{formatDate(date)}</Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                            <DateTimePicker
                                value={date}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={handleDateChange}
                                minimumDate={new Date()}
                            />
                        )}

                        {/* Time Picker */}
                        <Text style={styles.inputLabel}>New Time *</Text>
                        <TouchableOpacity
                            style={styles.datePickerButton}
                            onPress={() => setShowTimePicker(true)}
                            disabled={isLoading}
                        >
                            <Ionicons name="time-outline" size={20} color="#718096" />
                            <Text style={styles.dateText}>{formatTime(time)}</Text>
                        </TouchableOpacity>
                        {showTimePicker && (
                            <DateTimePicker
                                value={time}
                                mode="time"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={handleTimeChange}
                            />
                        )}

                        {/* Notes */}
                        <Text style={styles.inputLabel}>Notes (optional)</Text>
                        <View style={styles.notesContainer}>
                            <TextInput
                                style={styles.notesInput}
                                value={notes}
                                onChangeText={(text) => {
                                    setNotes(text);
                                    setValidationError(null);
                                }}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                                placeholder="Add or update notes..."
                                editable={!isLoading}
                            />
                        </View>
                    </ScrollView>

                    {/* Actions */}
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onClose}
                            disabled={isLoading}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
                            onPress={handleSubmit}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.saveButtonText}>Confirm Reschedule</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    modalContent: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === "ios" ? 40 : 20,
        maxHeight: "85%",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1E293B",
    },
    closeButton: {
        padding: 4,
    },
    formContainer: {
        padding: 16,
    },
    patientBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F0FDFA",
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
        gap: 10,
    },
    patientName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#0D9488",
    },
    currentInfo: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: "#F8FAFC",
        borderRadius: 10,
    },
    currentInfoLabel: {
        fontSize: 12,
        color: "#64748B",
        marginBottom: 4,
    },
    currentInfoValue: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1E293B",
    },
    errorBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF2F2",
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: "#FECACA",
    },
    errorText: {
        flex: 1,
        fontSize: 14,
        color: "#DC2626",
    },
    inputLabel: {
        fontSize: 14,
        color: "#64748B",
        marginBottom: 8,
        fontWeight: "500",
    },
    datePickerButton: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: 16,
        gap: 10,
    },
    dateText: {
        fontSize: 16,
        color: "#1E293B",
    },
    notesContainer: {
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 16,
    },
    notesInput: {
        fontSize: 16,
        color: "#1E293B",
        minHeight: 80,
    },
    actionsContainer: {
        flexDirection: "row",
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 10,
        alignItems: "center",
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#64748B",
    },
    saveButton: {
        flex: 2,
        backgroundColor: "#0D9488",
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    saveButtonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFFFFF",
    },
});

export default RescheduleModal;
