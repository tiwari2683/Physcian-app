import React, { useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    FlatList,
    Image,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Enhanced View Files Modal Component with backend deletion
const ViewFilesModal = ({
    isVisible,
    onClose,
    reportFiles,
    removeReportFileWithBackend, // Updated to use enhanced deletion function
    patientId,
}: any) => {
    const [selectedFile, setSelectedFile] = useState<any>(null);

    const handleFilePress = (file: any) => {
        setSelectedFile(file);
    };

    const closePreview = () => {
        setSelectedFile(null);
    };

    const renderFileItem = ({ item, index }: any) => (
        <View style={styles.modalFileItem}>
            <View style={styles.modalFileDetails}>
                <View style={styles.modalFileIconContainer}>
                    <Ionicons
                        name={
                            item.type?.includes("pdf")
                                ? "document-text"
                                : item.type?.includes("image")
                                    ? "image"
                                    : "document"
                        }
                        size={24}
                        color="#0070D6"
                    />
                </View>
                <View style={styles.modalFileInfo}>
                    <Text style={styles.modalFileName} numberOfLines={1}>
                        {item.name || `File ${index + 1}`}
                    </Text>
                    <View style={styles.modalFileMetaContainer}>
                        {item.size && (
                            <Text style={styles.modalFileSize}>
                                {Math.round(item.size / 1024)} KB
                            </Text>
                        )}
                        {item.dateAdded && (
                            <Text style={styles.modalFileDate}>Added: {item.dateAdded}</Text>
                        )}
                        {item.category && (
                            <View style={styles.modalCategoryBadge}>
                                <Text style={styles.modalCategoryText}>{item.category}</Text>
                            </View>
                        )}
                        {/* Add status indicators */}
                        {item.uploadedToS3 && (
                            <View style={styles.statusBadge}>
                                <Text style={styles.statusText}>✅ Uploaded</Text>
                            </View>
                        )}
                        {item.s3UploadFailed && (
                            <View style={[styles.statusBadge, styles.errorBadge]}>
                                <Text style={[styles.statusText, styles.errorText]}>
                                    ❌ Upload Failed
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            <View style={styles.modalFileActions}>
                {item.type?.includes("image") && (
                    <TouchableOpacity
                        style={styles.modalActionButton}
                        onPress={() => handleFilePress(item)}
                    >
                        <Ionicons name="eye" size={22} color="#0070D6" />
                        <Text style={styles.modalActionText}>Preview</Text>
                    </TouchableOpacity>
                )}

                {/* Enhanced delete button with confirmation - Updated to use enhanced deletion */}
                <TouchableOpacity
                    style={[styles.modalActionButton, styles.modalRemoveButton]}
                    onPress={() => {
                        // Call the enhanced removal function with backend deletion
                        removeReportFileWithBackend(index);
                    }}
                >
                    <Ionicons name="trash" size={22} color="#E53935" />
                    <Text style={styles.modalRemoveText}>Delete</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

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
                        <Text style={styles.modalTitle}>Uploaded Files</Text>
                        <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                            <Ionicons name="close" size={24} color="#4A5568" />
                        </TouchableOpacity>
                    </View>

                    {reportFiles.length > 0 ? (
                        <FlatList
                            data={reportFiles}
                            renderItem={renderFileItem}
                            keyExtractor={(_, index) => `file-${index}`}
                            style={styles.modalFileList}
                            ItemSeparatorComponent={() => (
                                <View style={styles.modalFileDivider} />
                            )}
                        />
                    ) : (
                        <View style={styles.modalEmptyContainer}>
                            <Ionicons name="document-outline" size={48} color="#A0AEC0" />
                            <Text style={styles.modalEmptyText}>No files uploaded yet</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.modalCloseFullButton}
                        onPress={onClose}
                    >
                        <Text style={styles.modalCloseFullButtonText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* File Preview Modal */}
            {selectedFile && selectedFile.type?.includes("image") && (
                <Modal
                    visible={!!selectedFile}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={closePreview}
                >
                    <View style={styles.previewModalContainer}>
                        <View style={styles.previewModalContent}>
                            <View style={styles.previewModalHeader}>
                                <Text style={styles.previewModalTitle} numberOfLines={1}>
                                    {selectedFile.name}
                                </Text>
                                <TouchableOpacity
                                    onPress={closePreview}
                                    style={styles.previewModalCloseButton}
                                >
                                    <Ionicons name="close" size={24} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.previewImageContainer}>
                                <Image
                                    source={{ uri: selectedFile.uri }}
                                    style={styles.previewImage}
                                    resizeMode="contain"
                                />
                            </View>

                            <View style={styles.previewModalFooter}>
                                <TouchableOpacity
                                    style={styles.previewModalCloseFullButton}
                                    onPress={closePreview}
                                >
                                    <Text style={styles.previewModalCloseFullButtonText}>
                                        Close Preview
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
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
    modalFileList: {
        maxHeight: 400,
    },
    modalFileItem: {
        paddingVertical: 12,
    },
    modalFileDetails: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    modalFileIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#EBF8FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    modalFileInfo: {
        flex: 1,
    },
    modalFileName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 4,
    },
    modalFileMetaContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
    },
    modalFileSize: {
        fontSize: 12,
        color: "#718096",
        marginRight: 10,
    },
    modalFileDate: {
        fontSize: 12,
        color: "#718096",
        marginRight: 10,
    },
    modalCategoryBadge: {
        backgroundColor: "#EDF2F7",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 8,
    },
    modalCategoryText: {
        fontSize: 10,
        color: "#4A5568",
        fontWeight: "600",
    },
    statusBadge: {
        backgroundColor: "#E6FFFA",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 8,
        flexDirection: "row",
        alignItems: "center",
    },
    statusText: {
        fontSize: 10,
        color: "#047481",
        fontWeight: "600",
    },
    errorBadge: {
        backgroundColor: "#FFF5F5",
    },
    errorText: {
        color: "#C53030",
    },
    modalFileActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 5,
    },
    modalActionButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: "#EBF8FF",
        marginLeft: 10,
    },
    modalActionText: {
        fontSize: 13,
        color: "#0070D6",
        fontWeight: "600",
        marginLeft: 6,
    },
    modalRemoveButton: {
        backgroundColor: "#FFF5F5",
    },
    modalRemoveText: {
        fontSize: 13,
        color: "#E53935",
        fontWeight: "600",
        marginLeft: 6,
    },
    modalFileDivider: {
        height: 1,
        backgroundColor: "#EEEEEE",
        width: "100%",
    },
    modalEmptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
    },
    modalEmptyText: {
        fontSize: 16,
        color: "#718096",
        marginTop: 16,
    },
    modalCloseFullButton: {
        backgroundColor: "#E2E8F0",
        padding: 14,
        borderRadius: 10,
        alignItems: "center",
        marginTop: 20,
    },
    modalCloseFullButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#4A5568",
    },
    previewModalContainer: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        justifyContent: "center",
        alignItems: "center",
    },
    previewModalContent: {
        width: "100%",
        height: "100%",
        justifyContent: "space-between",
    },
    previewModalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        paddingTop: 50,
    },
    previewModalTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#FFFFFF",
        flex: 1,
        marginRight: 20,
    },
    previewModalCloseButton: {
        padding: 5,
    },
    previewImageContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    previewImage: {
        width: "100%",
        height: "100%",
    },
    previewModalFooter: {
        padding: 20,
        paddingBottom: 40,
    },
    previewModalCloseFullButton: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        padding: 14,
        borderRadius: 10,
        alignItems: "center",
    },
    previewModalCloseFullButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFFFFF",
    },
});

export default ViewFilesModal;
