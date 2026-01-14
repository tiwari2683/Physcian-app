import React, { useState, useEffect, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
    Platform,
    StatusBar,
    RefreshControl
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { API_ENDPOINTS } from "../../Config";
import { getFitnessCertificateHistory } from "./Services/FitnessCertificateBackendService";
import GenerateCertificatePdf from "./GenerateCertificatePdf";
import { FormData, OpinionType } from "./Types/FitnessCertificateTypes";

// Prop Types
interface FitnessCertificateHistoryProps {
    navigation: any;
    route: any;
}

interface HistoryItem {
    certificateId: string;
    createdAt: string;
    patientName: string;
    selectedOpinionType: string;
    doctorName?: string;
    [key: string]: any; // Catch-all for other form data
}

const FitnessCertificateHistory: React.FC<FitnessCertificateHistoryProps> = ({ navigation, route }) => {
    const { patient } = route.params || {};
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // PDF Generation State
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [selectedCertificate, setSelectedCertificate] = useState<Partial<FormData>>({});

    const loadHistory = useCallback(async () => {
        if (!patient?.patientId) return;

        try {
            const certificates = await getFitnessCertificateHistory(
                API_ENDPOINTS.PATIENT_PROCESSOR,
                patient.patientId
            );

            // Sort by date descending (newest first)
            const sorted = certificates.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setHistory(sorted);
        } catch (error) {
            console.error("Failed to load history:", error);
            Alert.alert("Error", "Could not load certificate history");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [patient?.patientId]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadHistory();
    };

    const handleDownloadPdf = (item: HistoryItem) => {
        // Map HistoryItem to FormData structure
        const certData: Partial<FormData> = {
            // Map standard fields
            ...item,
            // Explicitly map potentially deeper fields if needed, 
            // but spread covers most since they share structure.
            // Ensure metadata is present for the PDF
            certificateId: item.certificateId,
            createdAt: item.createdAt,
            patientName: item.patientName,
            patientAge: patient?.age?.toString(),
            patientSex: patient?.sex,
            selectedOpinionType: item.selectedOpinionType as OpinionType,
        };

        setSelectedCertificate(certData);
        setShowPdfModal(true);
    };

    const handleCertificatePress = (item: HistoryItem) => {
        // Step 3.3: Copy to New Logic will go here
        console.log("Certificate pressed:", item.certificateId);

        // For now, simple alert or log
        // Alert.alert("Certificate Details", `ID: ${item.certificateId}\nDate: ${new Date(item.createdAt).toLocaleDateString()}`);
        navigation.navigate("FitnessCertificate", {
            patient: patient,
            templateData: item
        });
    };

    const formatDate = (isoString: string) => {
        if (!isoString) return "Unknown Date";
        return new Date(isoString).toLocaleDateString("en-IN", {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    const getOpinionLabel = (type: string) => {
        switch (type) {
            case 'surgery_fitness': return 'Surgery Fitness';
            case 'medication_modification': return 'Medication Modification';
            case 'fitness_reserved': return 'Fitness Reserved';
            default: return 'Fitness Certificate';
        }
    };

    const renderItem = ({ item }: { item: HistoryItem }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => handleCertificatePress(item)}
            activeOpacity={0.7}
        >
            <View style={styles.cardHeader}>
                <View style={styles.dateContainer}>
                    <Ionicons name="calendar-outline" size={16} color="#4c669f" />
                    <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={styles.badgeContainer}>
                    <Text style={styles.idText}>#{item.certificateId.slice(-6)}</Text>
                </View>
            </View>

            <View style={styles.cardBody}>
                <Text style={styles.opinionLabel}>{getOpinionLabel(item.selectedOpinionType)}</Text>
                <Text style={styles.doctorText}>Dr. {item.doctorName || "Unknown"}</Text>
            </View>

            <View style={styles.cardFooter}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDownloadPdf(item)}
                >
                    <Ionicons name="download-outline" size={16} color="#0070D6" />
                    <Text style={[styles.actionText, { color: "#0070D6" }]}>PDF</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <View style={styles.actionButton}>
                    <Text style={styles.actionText}>Tap to Copy</Text>
                    <Ionicons name="arrow-forward" size={16} color="#4c669f" />
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
            <StatusBar barStyle="light-content" backgroundColor="#4c669f" />

            {/* Header */}
            <LinearGradient
                colors={["#4c669f", "#3b5998", "#192f6a"]}
                style={styles.header}
            >
                <View style={styles.headerContent}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>History</Text>
                        <Text style={styles.headerSubtitle}>{patient?.name}</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
            </LinearGradient>

            {/* List */}
            {isLoading && !isRefreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#4c669f" />
                    <Text style={styles.loadingText}>Loading history...</Text>
                </View>
            ) : (
                <FlatList
                    data={history}
                    renderItem={renderItem}
                    keyExtractor={item => item.certificateId}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={["#4c669f"]} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="document-text-outline" size={48} color="#ccc" />
                            <Text style={styles.emptyText}>No certificates found</Text>
                        </View>
                    }
                />
            )}

            {/* Read-Only PDF Generator */}
            <GenerateCertificatePdf
                visible={showPdfModal}
                onClose={() => setShowPdfModal(false)}
                formData={selectedCertificate}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F5F7FA",
    },
    header: {
        paddingTop: Platform.OS === "ios" ? 10 : 20,
        paddingBottom: 20,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        marginBottom: 10,
    },
    headerContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#FFFFFF",
        textAlign: 'center'
    },
    headerSubtitle: {
        fontSize: 14,
        color: "rgba(255,255,255,0.8)",
        textAlign: 'center'
    },
    listContent: {
        padding: 16,
    },
    centerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
        color: "#666",
    },
    emptyContainer: {
        alignItems: "center",
        marginTop: 50,
    },
    emptyText: {
        marginTop: 10,
        color: "#999",
        fontSize: 16,
    },

    // Card Styles
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    dateContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    dateText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#2D3748",
    },
    badgeContainer: {
        backgroundColor: "#EDF2F7",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    idText: {
        fontSize: 10,
        color: "#718096",
        fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    },
    cardBody: {
        marginBottom: 12,
    },
    opinionLabel: {
        fontSize: 16,
        color: "#2b6cb0",
        fontWeight: "500",
        marginBottom: 4,
    },
    doctorText: {
        fontSize: 12,
        color: "#718096",
    },
    cardFooter: {
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
        marginTop: 8,
    },
    actionButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        gap: 6,
        flex: 1,
    },
    divider: {
        width: 1,
        height: 20,
        backgroundColor: "#E2E8F0",
    },
    actionText: {
        fontSize: 12,
        color: "#4c669f",
        fontWeight: "500",
    }
});

export default FitnessCertificateHistory;
