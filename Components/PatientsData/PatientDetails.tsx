import React, { useState } from "react";
import {
    StyleSheet,
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Platform,
    Image,
    Alert,
    StatusBar,
    Modal,
    GestureResponderEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

// Get screen dimensions
const { width, height } = Dimensions.get("window");

interface PatientDetailsProps {
    navigation: any;
    route: any;
}

const PatientDetails: React.FC<PatientDetailsProps> = ({ navigation, route }) => {
    const { patient } = route.params;

    // State for Image Viewer
    const [modalVisible, setModalVisible] = useState<boolean>(false);
    const [selectedImage, setSelectedImage] = useState<string>("");
    const [imageScale, setImageScale] = useState<number>(1);
    const [lastDistance, setLastDistance] = useState<number>(0);

    // Helper to format date
    const formatDate = (dateString: string) => {
        if (!dateString) return "N/A";
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        } catch (e) {
            return "N/A";
        }
    };

    const handleEdit = () => {
        navigation.navigate("NewPatientForm", {
            patient,
            initialTab: "clinical",
            prefillMode: true,
            hideBasicTab: true,
        });
    };

    const handleCertificate = () => {
        navigation.navigate("FitnessCertificate", { patient });
    };

    // Image Viewer Handler
    const handleViewImage = (file: any) => {
        // Try multiple possible URL properties
        const imageUrl = file.url || file.uri || file.fileUrl || file.s3Url;

        // Debug logging
        console.log("File object:", JSON.stringify(file, null, 2));
        console.log("Using imageUrl:", imageUrl);

        if (!imageUrl) {
            Alert.alert("Error", "Image URL not found. Please check the file data.");
            console.error("No valid URL found in file:", file);
            return;
        }

        setSelectedImage(imageUrl);
        setImageScale(1);
        setLastDistance(0);
        setModalVisible(true);
    };

    // Zoom Logic
    const handleTouchMove = (event: GestureResponderEvent) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
            const touch1 = touches[0];
            const touch2 = touches[1];
            const dx = touch1.pageX - touch2.pageX;
            const dy = touch1.pageY - touch2.pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (lastDistance === 0) {
                setLastDistance(distance);
                return;
            }

            const scale = distance / lastDistance;
            setImageScale((prevScale) => {
                const newScale = prevScale * scale;
                return Math.min(Math.max(newScale, 0.5), 5);
            });
            setLastDistance(distance);
        }
    };

    const handleTouchEnd = () => {
        setLastDistance(0);
    };

    const InfoItem = ({ icon, label, value, isLong = false }: { icon: string; label: string; value: string | number; isLong?: boolean }) => (
        <View style={[styles.infoItem, isLong && styles.infoItemLong]}>
            <View style={styles.iconContainer}>
                <Ionicons name={icon as any} size={20} color="#0070D6" />
            </View>
            <View style={styles.infoContent}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value || "N/A"}</Text>
            </View>
        </View>
    );

    const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
        <View style={styles.card}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionIconBox}>
                    <Ionicons name={icon as any} size={18} color="#0070D6" />
                </View>
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            <View style={styles.sectionContent}>{children}</View>
        </View>
    );

    const formattedDate = formatDate(patient.createdAt);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Image Viewer Modal */}
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

                    <View style={styles.zoomHintContainer}>
                        <Text style={styles.zoomHintText}>Pinch to zoom in/out</Text>
                    </View>

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

                    <TouchableOpacity
                        style={styles.resetZoomButton}
                        onPress={() => setImageScale(1)}
                    >
                        <Ionicons name="refresh-outline" size={24} color="#FFFFFF" />
                        <Text style={styles.resetZoomText}>Reset Zoom</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Premium Header Background */}
            <LinearGradient
                colors={["#0070D6", "#0056A4"]}
                style={styles.headerGradient}
            >
                <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerSafeArea}>
                    <View style={styles.headerNav}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                        >
                            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Patient Profile</Text>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <TouchableOpacity
                                style={[styles.editButton, { marginRight: 8 }]}
                                onPress={handleCertificate}
                            >
                                <Ionicons name="ribbon-outline" size={18} color="#0070D6" />
                                <Text style={styles.editButtonText}>Certificate</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                                <Ionicons name="create" size={18} color="#0070D6" />
                                <Text style={styles.editButtonText}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Floating Patient Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarRow}>
                        <View style={styles.avatarContainer}>
                            <Text style={styles.avatarText}>
                                {patient.name ? patient.name.substring(0, 1).toUpperCase() : "P"}
                            </Text>
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileName}>{patient.name}</Text>
                            <View style={styles.idBadge}>
                                <Text style={styles.idText}>ID: #{patient.patientId?.slice(-6).toUpperCase()}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Age</Text>
                            <Text style={styles.statValue}>{patient.age} Yrs</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Gender</Text>
                            <Text style={styles.statValue}>{patient.sex}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Status</Text>
                            <Text style={[styles.statValue, { color: '#4CAF50' }]}>Active</Text>
                        </View>
                    </View>
                </View>

                {/* Contact Information */}
                <View style={styles.gridContainer}>
                    <InfoItem icon="call-outline" label="Phone" value={patient.mobile} />
                    <InfoItem icon="calendar-outline" label="Registered" value={formattedDate} />
                    <InfoItem icon="location-outline" label="Address" value={patient.address} isLong />
                </View>

                {/* Clinical Info - Diagnosis & History */}
                <Section title="Diagnosis & History" icon="pulse-outline">
                    <View style={styles.clinicalItem}>
                        <Text style={styles.clinicalLabel}>Current Diagnosis</Text>
                        <Text style={styles.clinicalValue}>{patient.diagnosis || "No diagnosis recorded"}</Text>
                    </View>

                    {patient.medicalHistory && (
                        <View style={[styles.clinicalItem, styles.topBorder]}>
                            <Text style={styles.clinicalLabel}>Medical History</Text>
                            <Text style={styles.clinicalValue}>{patient.medicalHistory}</Text>
                        </View>
                    )}

                    {patient.symptoms && (
                        <View style={[styles.clinicalItem, styles.topBorder]}>
                            <Text style={styles.clinicalLabel}>Symptoms</Text>
                            <Text style={styles.clinicalValue}>{patient.symptoms}</Text>
                        </View>
                    )}
                </Section>

                {/* Treatment & Investigations */}
                {(patient.treatment || patient.advisedInvestigations) && (
                    <Section title="Plan & Instructions" icon="medkit-outline">
                        {patient.treatment && (
                            <View style={styles.clinicalItem}>
                                <Text style={styles.clinicalLabel}>Treatment Plan</Text>
                                <Text style={styles.clinicalValue}>{patient.treatment}</Text>
                            </View>
                        )}
                        {patient.advisedInvestigations && (
                            <View style={[styles.clinicalItem, patient.treatment && styles.topBorder]}>
                                <Text style={styles.clinicalLabel}>Advised Investigations</Text>
                                <Text style={styles.clinicalValue}>{patient.advisedInvestigations}</Text>
                            </View>
                        )}
                    </Section>
                )}

                {/* Medications Section */}
                {patient.medications && patient.medications.length > 0 && (
                    <Section title="Prescribed Medications" icon="bandage-outline">
                        {patient.medications.map((med: any, index: number) => (
                            <View key={index} style={[styles.medItem, index > 0 && styles.topBorder]}>
                                <View style={styles.medHeader}>
                                    <Text style={styles.medName}>{med.name}</Text>
                                    <View style={styles.medBadge}>
                                        <Text style={styles.medBadgeText}>{med.duration}</Text>
                                    </View>
                                </View>
                                <Text style={styles.medDetails}>
                                    {med.timingValues && JSON.parse(med.timingValues).morning ? JSON.parse(med.timingValues).morning : "0"}-{JSON.parse(med.timingValues || "{}").afternoon || "0"}-{JSON.parse(med.timingValues || "{}").night || "0"} • {med.timing || "N/A"}
                                </Text>
                                {med.specialInstructions ? (
                                    <Text style={styles.medInstructions}>Note: {med.specialInstructions}</Text>
                                ) : null}
                            </View>
                        ))}
                    </Section>
                )}

                {/* Reports Section */}
                {patient.reportFiles && patient.reportFiles.length > 0 && (
                    <Section title="Attached Reports" icon="document-text-outline">
                        {patient.reportFiles.map((file: any, index: number) => {
                            // Determine if it's an image
                            const isImage = file.type?.includes('image') ||
                                file.type?.startsWith('image/') ||
                                (file.url && file.url.match(/\.(jpeg|jpg|png|gif|webp)$/i)) ||
                                (file.name && file.name.match(/\.(jpeg|jpg|png|gif|webp)$/i));

                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.fileCard}
                                    onPress={() => {
                                        if (isImage) {
                                            handleViewImage(file);
                                        } else {
                                            Alert.alert(
                                                "Document",
                                                `File: ${file.name}\nType: ${file.type || "Unknown"}\n\nDocument preview not available yet.`,
                                                [
                                                    { text: "OK" },
                                                    {
                                                        text: "Copy URL",
                                                        onPress: () => {
                                                            const url = file.url || file.uri || file.fileUrl || file.s3Url;
                                                            if (url) {
                                                                console.log("Document URL:", url);
                                                                Alert.alert("URL", url);
                                                            }
                                                        }
                                                    }
                                                ]
                                            );
                                        }
                                    }}
                                >
                                    <View style={styles.fileIconBox}>
                                        <Ionicons
                                            name={isImage ? "image-outline" : "document-outline"}
                                            size={22}
                                            color="#0070D6"
                                        />
                                    </View>
                                    <View style={styles.fileInfo}>
                                        <Text style={styles.fileName} numberOfLines={1}>
                                            {file.name || "Unnamed File"}
                                        </Text>
                                        <Text style={styles.fileType}>
                                            {file.type || "Document"} {isImage ? "• Tap to view" : ""}
                                        </Text>
                                    </View>
                                    <Ionicons
                                        name={isImage ? "eye-outline" : "download-outline"}
                                        size={18}
                                        color="#0070D6"
                                    />
                                </TouchableOpacity>
                            );
                        })}
                    </Section>
                )}

            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F5F7FA",
    },
    headerGradient: {
        paddingBottom: 50,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    },
    headerSafeArea: {
        zIndex: 1,
    },
    headerNav: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
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
        fontSize: 18,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    editButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    editButtonText: {
        color: "#0070D6",
        fontWeight: "700",
        marginLeft: 6,
        fontSize: 14,
    },
    scrollView: {
        flex: 1,
        marginTop: -40,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 30,
    },
    profileCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
        marginBottom: 20,
    },
    avatarRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    avatarContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: "#E1F0FF",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#FFFFFF",
        shadowColor: "#0070D6",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    avatarText: {
        fontSize: 28,
        fontWeight: "700",
        color: "#0070D6",
    },
    profileInfo: {
        marginLeft: 16,
        flex: 1,
    },
    profileName: {
        fontSize: 22,
        fontWeight: "700",
        color: "#1A202C",
        marginBottom: 4,
    },
    idBadge: {
        backgroundColor: "#F7FAFC",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    idText: {
        fontSize: 12,
        color: "#718096",
        fontWeight: "600",
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    statItem: {
        alignItems: "center",
        flex: 1,
    },
    statLabel: {
        fontSize: 11,
        color: "#718096",
        marginBottom: 2,
        textTransform: "uppercase",
        fontWeight: "600",
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 16,
        fontWeight: "700",
        color: "#2D3748",
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: "#E2E8F0",
    },
    gridContainer: {
        marginBottom: 20,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    infoItem: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    infoItemLong: {
        marginBottom: 0,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#EBF8FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    infoContent: {
        flex: 1,
    },
    label: {
        fontSize: 12,
        color: "#718096",
    },
    value: {
        fontSize: 15,
        color: "#2D3748",
        fontWeight: "500",
    },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
        paddingBottom: 12,
    },
    sectionIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: "#EBF8FF",
        justifyContent: "center",
        alignItems: "center",
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#2D3748",
        marginLeft: 12,
    },
    sectionContent: {
        paddingLeft: 4,
    },
    clinicalItem: {
        marginBottom: 8,
    },
    topBorder: {
        borderTopWidth: 1,
        borderTopColor: "#F1F5F9",
        paddingTop: 12,
        marginTop: 8,
    },
    clinicalLabel: {
        fontSize: 12,
        color: "#718096",
        marginBottom: 4,
        fontWeight: "600",
        textTransform: "uppercase",
    },
    clinicalValue: {
        fontSize: 15,
        color: "#4A5568",
        lineHeight: 22,
    },
    medItem: {
        marginBottom: 8,
    },
    medHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
    },
    medName: {
        fontSize: 15,
        fontWeight: "700",
        color: "#2D3748",
    },
    medBadge: {
        backgroundColor: "#E6FFFA",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    medBadgeText: {
        fontSize: 11,
        color: "#319795",
        fontWeight: "600",
    },
    medDetails: {
        fontSize: 13,
        color: "#4A5568",
    },
    medInstructions: {
        fontSize: 12,
        color: "#D69E2E",
        marginTop: 2,
        fontStyle: "italic",
    },
    fileCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        padding: 12,
        borderRadius: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    fileIconBox: {
        width: 40,
        height: 40,
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
        borderWidth: 1,
        borderColor: "#EEF0F2",
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        fontSize: 14,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 2,
    },
    fileType: {
        fontSize: 11,
        color: "#A0AEC0",
    },

    // Modal Styles
    modalContainer: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.9)",
        justifyContent: "center",
        alignItems: "center",
    },
    closeButton: {
        position: "absolute",
        top: 50,
        right: 20,
        zIndex: 10,
    },
    zoomHintContainer: {
        position: "absolute",
        top: 60,
        alignSelf: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    zoomHintText: {
        color: "#FFFFFF",
        fontSize: 12,
    },
    imageContainer: {
        width: width,
        height: height,
        justifyContent: "center",
        alignItems: "center",
    },
    fullImage: {
        width: width,
        height: height * 0.8,
    },
    resetZoomButton: {
        position: "absolute",
        bottom: 50,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.2)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
    },
    resetZoomText: {
        color: "#FFFFFF",
        marginLeft: 8,
        fontWeight: "600",
    },
});

export default PatientDetails;
