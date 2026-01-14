/**
 * GenerateCertificatePdf.tsx
 * 
 * Modal component for generating and sharing Fitness Certificate PDFs
 * Uses expo-print (frontend-only, no backend dependency)
 * 
 * Pattern: Same as generateprescription.tsx
 */

import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    ActivityIndicator,
    Alert,
    ScrollView,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormData } from "./Types/FitnessCertificateTypes";
import { generateCertificateHtml, DoctorInfo, DEFAULT_DOCTOR_INFO } from "./Utils/CertificatePdfTemplate";

// ===========================================
// INTERFACES
// ===========================================

interface GenerateCertificatePdfProps {
    visible: boolean;
    onClose: () => void;
    formData: Partial<FormData>;
    doctorInfo?: DoctorInfo;
}

// ===========================================
// COMPONENT
// ===========================================

const GenerateCertificatePdf: React.FC<GenerateCertificatePdfProps> = ({
    visible,
    onClose,
    formData,
    doctorInfo = DEFAULT_DOCTOR_INFO,
}) => {
    // State
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [fileName, setFileName] = useState<string>(
        generateDefaultFileName(formData.patientName)
    );

    /**
     * Generate and share PDF
     * Uses expo-print.printToFileAsync() for local PDF creation
     */
    const generatePdf = async () => {
        try {
            setIsGenerating(true);
            console.log("📄 Generating Fitness Certificate PDF...");

            // 1. Generate HTML from template
            const html = generateCertificateHtml(formData, doctorInfo);

            // 2. Create PDF file locally using expo-print
            const { uri } = await Print.printToFileAsync({
                html,
                base64: false,
            });
            console.log("✅ PDF created at:", uri);

            // 3. Rename file with custom filename
            let fileUri = uri;
            if (fileName) {
                const sanitizedFileName = fileName
                    .replace(/[^a-zA-Z0-9_]/g, "_")
                    .replace(/_+/g, "_");
                const newFileUri = `${FileSystem.documentDirectory}${sanitizedFileName}.pdf`;

                await FileSystem.moveAsync({
                    from: uri,
                    to: newFileUri,
                });
                fileUri = newFileUri;
                console.log("📁 PDF renamed to:", fileUri);
            }

            // 4. Share the PDF
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: "application/pdf",
                    dialogTitle: "Share Fitness Certificate",
                    UTI: "com.adobe.pdf",
                });
                console.log("📤 Share dialog opened");
            } else {
                Alert.alert(
                    "Sharing Not Available",
                    "Sharing is not available on this device. The PDF has been saved locally.",
                    [{ text: "OK" }]
                );
            }

            // 5. Success - close modal
            setIsGenerating(false);
            onClose();

        } catch (error) {
            console.error("❌ Error generating PDF:", error);
            setIsGenerating(false);
            Alert.alert(
                "Generation Failed",
                "There was an error generating the certificate. Please try again.",
                [{ text: "OK" }]
            );
        }
    };

    /**
     * Get opinion type display text
     */
    const getOpinionDisplayText = (): string => {
        switch (formData.selectedOpinionType) {
            case "surgery_fitness":
                return "Fitness for Surgery";
            case "medication_modification":
                return "Medication Modification";
            case "fitness_reserved":
                return "Fitness Reserved";
            default:
                return "Medical Opinion";
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={onClose}>
                        <Ionicons name="arrow-back" size={24} color="#0070D6" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Generate Certificate PDF</Text>
                    <View style={{ width: 24 }} />
                </View>

                <ScrollView style={styles.content}>
                    {/* Certificate Preview Info */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Certificate Details</Text>

                        <View style={styles.previewCard}>
                            <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>Patient:</Text>
                                <Text style={styles.previewValue}>
                                    {formData.patientName || "N/A"}
                                </Text>
                            </View>
                            <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>Age/Sex:</Text>
                                <Text style={styles.previewValue}>
                                    {formData.patientAge || "N/A"} / {formData.patientSex || "N/A"}
                                </Text>
                            </View>
                            <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>Opinion Type:</Text>
                                <Text style={styles.previewValue}>{getOpinionDisplayText()}</Text>
                            </View>
                            <View style={styles.previewRow}>
                                <Text style={styles.previewLabel}>Validity:</Text>
                                <Text style={styles.previewValue}>
                                    {formData.validityPeriod || "30 days"}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Filename Input */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>PDF Filename</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.textInput}
                                value={fileName}
                                onChangeText={setFileName}
                                placeholder="Enter file name"
                                placeholderTextColor="#A0AEC0"
                            />
                            <Text style={styles.helperText}>
                                The file will be saved as {fileName || "certificate"}.pdf
                            </Text>
                        </View>
                    </View>

                    {/* Info Text */}
                    <View style={styles.infoCard}>
                        <Ionicons name="information-circle-outline" size={20} color="#4A5568" />
                        <Text style={styles.infoText}>
                            The PDF will include all patient details, clinical assessment,
                            investigations, and medical opinion. You can share it via
                            WhatsApp, Email, or save it to your device.
                        </Text>
                    </View>

                    {/* Generate Button */}
                    <TouchableOpacity
                        style={[styles.generateButton, isGenerating && styles.disabledButton]}
                        onPress={generatePdf}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <>
                                <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
                                <Text style={styles.generateButtonText}>Generate & Share PDF</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Generate default filename based on patient name and date
 */
function generateDefaultFileName(patientName?: string): string {
    const name = patientName?.replace(/\s+/g, "_") || "Patient";
    const date = new Date().toISOString().split("T")[0];
    return `Fitness_Certificate_${name}_${date}`;
}

// ===========================================
// STYLES
// ===========================================

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
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#2D3748",
    },
    content: {
        flex: 1,
        padding: 16,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 12,
    },
    previewCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    previewRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#F0F0F0",
    },
    previewLabel: {
        fontSize: 14,
        color: "#718096",
        fontWeight: "500",
    },
    previewValue: {
        fontSize: 14,
        color: "#2D3748",
        fontWeight: "600",
        maxWidth: "60%",
        textAlign: "right",
    },
    inputWrapper: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    textInput: {
        fontSize: 16,
        color: "#2D3748",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "#F7FAFC",
    },
    helperText: {
        fontSize: 12,
        color: "#718096",
        marginTop: 8,
    },
    infoCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: "#EBF8FF",
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: "#4A5568",
        lineHeight: 18,
    },
    generateButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0070D6",
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        gap: 10,
        marginBottom: 30,
    },
    disabledButton: {
        backgroundColor: "#A0AEC0",
    },
    generateButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "600",
    },
});

export default GenerateCertificatePdf;
