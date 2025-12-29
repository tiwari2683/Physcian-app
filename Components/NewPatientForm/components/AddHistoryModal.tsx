import React, { useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    Alert,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AutoBulletTextArea from "../../Common/AutoBulletTextArea";

// New Add History Modal Component
const AddHistoryModal = ({ isVisible, onClose, onSave, patientId }: any) => {
    const [newHistoryText, setNewHistoryText] = useState("");

    const handleSave = () => {
        if (newHistoryText.trim()) {
            onSave(newHistoryText);
            setNewHistoryText(""); // Clear the input after saving
        } else {
            Alert.alert("Error", "Please enter history details before saving.");
        }
    };

    return (
        <Modal
            visible={isVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add New History Entry</Text>
                        <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                            <Ionicons name="close" size={24} color="#4A5568" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.modalLabel}>
                        Enter new history, complaints, or symptoms:
                    </Text>

                    <AutoBulletTextArea
                        value={newHistoryText}
                        onChangeText={setNewHistoryText}
                        placeholder="Enter patient's history, complaints, and symptoms. Use dash (-) or bullet (•) at the beginning of a line for auto-bulleting."
                        numberOfLines={15}
                        style={[styles.textArea, { minHeight: 150 }]}
                    />

                    <Text style={styles.hintText}>
                        Tip: Start a line with "-" to create a bulleted list
                    </Text>

                    <View style={styles.modalButtonRow}>
                        <TouchableOpacity
                            style={styles.modalCancelButton}
                            onPress={onClose}
                        >
                            <Text style={styles.modalCancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.modalSaveButton}
                            onPress={handleSave}
                        >
                            <Text style={styles.modalSaveButtonText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    modalContent: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        width: "100%",
        maxHeight: "80%",
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#EEEEEE",
        paddingBottom: 15,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#2D3748",
    },
    modalCloseButton: {
        padding: 5,
    },
    modalLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: "#4A5568",
        marginBottom: 10,
    },
    textArea: {
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 12,
        fontSize: 16,
        color: "#2D3748",
        textAlignVertical: "top",
    },
    hintText: {
        fontSize: 12,
        color: "#718096",
        fontStyle: "italic",
        marginTop: 8,
        marginBottom: 20,
    },
    modalButtonRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 12,
    },
    modalCancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        backgroundColor: "#EDF2F7",
    },
    modalCancelButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#4A5568",
    },
    modalSaveButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: "#0070D6",
    },
    modalSaveButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFFFFF",
    },
});

export default AddHistoryModal;
