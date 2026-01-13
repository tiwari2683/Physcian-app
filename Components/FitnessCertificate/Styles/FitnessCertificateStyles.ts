/**
 * Styles for Fitness Certificate component
 * Extracted from FitnessCertificate.tsx for better organization
 */

import { StyleSheet, Platform } from "react-native";

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F5F7FA",
    },
    headerGradient: {
        paddingTop: Platform.OS === "ios" ? 0 : 10,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#FFFFFF",
    },
    headerButtons: {
        flexDirection: "row",
        alignItems: "center",
    },
    refreshButton: {
        padding: 8,
        marginRight: 8,
    },
    historyButton: {
        padding: 8,
    },
    testButton: {
        padding: 8,
    },
    loadingOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
    },
    loadingText: {
        color: "#FFFFFF",
        marginTop: 16,
        fontSize: 16,
        fontWeight: "500",
    },
    loadingDetails: {
        marginTop: 12,
        alignItems: "center",
    },
    loadingDetailText: {
        color: "#FFFFFF",
        fontSize: 12,
        opacity: 0.8,
        marginVertical: 2,
    },
    scrollContainer: {
        flex: 1,
    },

    // Certificate Styles
    certificateContainer: {
        backgroundColor: "#FFFFFF",
        margin: 16,
        borderRadius: 12,
        ...Platform.select({
            ios: {
                shadowColor: "rgba(0, 0, 0, 0.1)",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.8,
                shadowRadius: 4,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    certificateHeader: {
        alignItems: "center",
        paddingVertical: 20,
        paddingHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: "#0070D6",
    },
    certificateTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#0070D6",
        marginBottom: 8,
        textAlign: "center",
    },
    doctorName: {
        fontSize: 18,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 4,
    },
    doctorCredentials: {
        fontSize: 14,
        color: "#4A5568",
        marginBottom: 2,
    },
    clinicDetails: {
        fontSize: 12,
        color: "#718096",
    },
    certificateBody: {
        padding: 16,
    },

    // Patient Info Section
    patientInfoSection: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#0070D6",
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        paddingBottom: 4,
    },
    infoGrid: {
        gap: 4,
    },
    infoRow: {
        flexDirection: "row",
        paddingVertical: 2,
    },
    infoLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#4A5568",
        width: 80,
    },
    infoValue: {
        fontSize: 12,
        color: "#2D3748",
        flex: 1,
    },

    // New PreOp Section
    preOpSection: {
        marginBottom: 16,
    },
    preOpContent: {
        gap: 6,
    },
    preOpText: {
        fontSize: 12,
        color: "#2D3748",
        lineHeight: 16,
    },
    underlineText: {
        textDecorationLine: "underline",
        fontWeight: "600",
        color: "#0070D6",
    },

    // Modified Medical Opinion Section
    opinionSection: {
        marginBottom: 16,
    },
    opinionContent: {
        gap: 8,
    },
    opinionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 4,
    },
    opinionLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#4A5568",
        marginRight: 8,
    },
    opinionUnderline: {
        fontSize: 12,
        color: "#2D3748",
        textDecorationLine: "underline",
        flex: 1,
        minHeight: 16,
    },
    selectedOptionSection: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
    },
    selectedOptionLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#0070D6",
        marginBottom: 4,
    },
    selectedOptionValue: {
        fontSize: 12,
        color: "#2D3748",
        lineHeight: 16,
    },

    // Assessment Section
    assessmentSection: {
        marginBottom: 16,
    },
    assessmentGrid: {
        gap: 4,
    },
    assessmentRow: {
        flexDirection: "row",
        paddingVertical: 2,
    },
    assessmentLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#4A5568",
        width: 120,
    },
    assessmentValue: {
        fontSize: 12,
        color: "#2D3748",
        flex: 1,
    },

    // New Investigations Section
    investigationsSection: {
        marginBottom: 16,
    },
    investigationsGrid: {
        gap: 4,
    },
    investigationRow: {
        flexDirection: "row",
        paddingVertical: 2,
    },
    investigationLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#4A5568",
        width: 60,
    },
    investigationValue: {
        fontSize: 12,
        color: "#2D3748",
        flex: 1,
    },

    // Vitals Section
    vitalsSection: {
        marginBottom: 16,
    },
    vitalsGrid: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    vitalsColumn: {
        flex: 1,
        gap: 4,
    },
    vitalsLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#4A5568",
    },
    vitalsValue: {
        fontWeight: "normal",
        color: "#2D3748",
    },

    // Recommendations Section
    recommendationsSection: {
        marginBottom: 16,
    },
    recommendationsText: {
        fontSize: 12,
        color: "#2D3748",
        lineHeight: 16,
    },

    // Certificate Footer
    certificateFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
    },
    signatureSection: {
        alignItems: "center",
    },
    signatureLine: {
        width: 120,
        height: 1,
        backgroundColor: "#4A5568",
        marginBottom: 4,
    },
    signatureText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#2D3748",
    },
    signatureTitle: {
        fontSize: 10,
        color: "#718096",
    },
    signatureDate: {
        fontSize: 10,
        color: "#718096",
        marginTop: 2,
    },
    validitySection: {
        alignItems: "flex-end",
    },
    validityText: {
        fontSize: 11,
        color: "#4A5568",
        fontWeight: "500",
    },
    certificateId: {
        fontSize: 10,
        color: "#718096",
        marginTop: 2,
    },

    // Form Styles
    formContainer: {
        backgroundColor: "#FFFFFF",
        margin: 16,
        marginTop: 8,
        borderRadius: 12,
        padding: 16,
        ...Platform.select({
            ios: {
                shadowColor: "rgba(0, 0, 0, 0.1)",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.8,
                shadowRadius: 4,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    formTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 16,
    },
    formSection: {
        marginBottom: 16,
    },
    formLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: "#4A5568",
        marginBottom: 8,
    },
    textInput: {
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: "#2D3748",
        backgroundColor: "#FAFAFA",
        textAlignVertical: "top",
    },
    multilineTextInput: {
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: "#2D3748",
        backgroundColor: "#FAFAFA",
        textAlignVertical: "top",
        minHeight: 80,
    },

    // Radio and Text Field Styles
    radioContainer: {
        marginBottom: 16,
        position: "relative",
    },
    radioOption: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    radioCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "#CBD5E0",
        marginRight: 8,
    },
    radioSelected: {
        borderColor: "#0070D6",
        backgroundColor: "#0070D6",
    },
    radioLabel: {
        fontSize: 14,
        color: "#2D3748",
    },
    dropdownToggle: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "#FAFAFA",
        marginLeft: 28,
        marginBottom: 4,
        minHeight: 44,
    },
    dropdownToggleText: {
        fontSize: 14,
        color: "#2D3748",
        flex: 1,
        marginRight: 8,
        lineHeight: 18,
    },
    dropdown: {
        marginLeft: 28,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 8,
        backgroundColor: "#FFFFFF",
        maxHeight: 180,
        minHeight: 80,
        zIndex: 1000,
        ...Platform.select({
            ios: {
                shadowColor: "rgba(0, 0, 0, 0.15)",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    dropdownScrollView: {
        maxHeight: 180,
    },
    dropdownOption: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
        minHeight: 44,
        justifyContent: "center",
    },
    lastDropdownOption: {
        borderBottomWidth: 0,
    },
    dropdownOptionText: {
        fontSize: 14,
        color: "#2D3748",
        lineHeight: 18,
        flexWrap: "wrap",
        textAlign: "left",
    },

    // New Text Field Container Styles
    textFieldContainer: {
        marginLeft: 28,
        marginTop: 8,
    },
    textFieldLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#0070D6",
        marginBottom: 6,
    },

    // Vitals Input
    vitalsInputGrid: {
        flexDirection: "row",
        gap: 12,
    },
    vitalInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: "#2D3748",
        backgroundColor: "#FAFAFA",
    },

    // Validity Options
    validityOptions: {
        flexDirection: "row",
        gap: 8,
        flexWrap: "wrap",
    },
    validityOption: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#CBD5E0",
        backgroundColor: "#FFFFFF",
    },
    validitySelected: {
        borderColor: "#0070D6",
        backgroundColor: "#EBF8FF",
    },
    validityOptionText: {
        fontSize: 12,
        color: "#4A5568",
    },
    validitySelectedText: {
        color: "#0070D6",
        fontWeight: "600",
    },

    // Generate Button
    buttonContainer: {
        padding: 16,
        paddingBottom: Platform.OS === "ios" ? 34 : 16,
    },
    generateButton: {
        borderRadius: 12,
        overflow: "hidden",
    },
    generatingButton: {
        opacity: 0.7,
    },
    generateButtonGradient: {
        paddingVertical: 16,
        paddingHorizontal: 24,
    },
    buttonContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    generatingContent: {
        alignItems: "center",
        justifyContent: "center",
    },
    generateButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFFFFF",
        marginLeft: 8,
    },
    autoFillButton: {
        backgroundColor: "#EBF8FF",
        borderWidth: 1,
        borderColor: "#0070D6",
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginTop: 8,
        alignItems: "center",
    },
    autoFillButtonText: {
        color: "#0070D6",
        fontSize: 12,
        fontWeight: "500",
    },
});
