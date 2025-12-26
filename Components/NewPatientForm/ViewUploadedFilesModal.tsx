import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";

// Define the props for the component
interface ViewUploadedFilesModalProps {
  isVisible: boolean;
  onClose: () => void;
  patientId: string;
  reportFiles: Array<{
    uri: string;
    name: string;
    type: string;
    size?: number;
    category?: string;
    dateAdded?: string;
  }>;
  removeReportFile?: (index: number) => void;
  isFileAlreadyUploaded: (file: any) => boolean;
}

const ViewUploadedFilesModal = ({
  isVisible,
  onClose,
  patientId,
  reportFiles,
  removeReportFile,
  isFileAlreadyUploaded,
}: ViewUploadedFilesModalProps) => {
  // State to track loading of S3 files
  const [loading, setLoading] = useState(false);
  // State to store all files (S3 + local)
  const [allFiles, setAllFiles] = useState([]);
  // State for file being previewed
  const [selectedFile, setSelectedFile] = useState(null);
  // State to track any errors
  const [error, setError] = useState("");
  // State to track file types for filtering
  const [activeFilter, setActiveFilter] = useState("all");
  // Count of files by source
  const [fileCounts, setFileCounts] = useState({
    s3: 0,
    local: 0,
    total: 0,
  });

  // Function to fetch S3 files from the backend
  const fetchS3Files = async () => {
    if (!patientId || patientId.startsWith("temp_")) {
      // Skip API call for temporary patients
      const processedLocalFiles = reportFiles.map((file) => ({
        ...file,
        isS3File: isFileAlreadyUploaded(file),
        source: isFileAlreadyUploaded(file) ? "s3" : "local",
      }));

      setAllFiles(processedLocalFiles);
      updateFileCounts(processedLocalFiles);
      return;
    }

    setLoading(true);
    setError("");

    try {
      console.log(`🔄 Fetching S3 files for patient: ${patientId}`);

      const apiUrl =
        "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction";

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          action: "getPatientFiles",
          patientId: patientId,
        }),
      });

      const responseText = await response.text();

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ Error parsing response:", parseError);
        throw new Error("Failed to parse server response");
      }

      // Handle various response formats
      const data = result.body
        ? typeof result.body === "string"
          ? JSON.parse(result.body)
          : result.body
        : result;

      if (data.success && data.files && Array.isArray(data.files)) {
        console.log(`✅ Successfully fetched ${data.files.length} S3 files`);

        // Convert S3 files to the format expected by the UI
        const s3Files = data.files.map((file) => ({
          uri: file.url,
          name: file.name || file.key || "Unknown file",
          type: file.type || guessFileType(file.name || file.key),
          size: file.size,
          category: file.category || "S3 File",
          dateAdded:
            file.uploadDate || formatDate(file.lastModified) || "Unknown date",
          isS3File: true,
          source: "s3",
        }));

        // Combine S3 files with the local report files, avoiding duplicates
        const localFiles = reportFiles
          .filter((localFile) => {
            // Skip local files that have the same URI as an S3 file or are already uploaded
            const isAlreadyInS3 = s3Files.some(
              (s3File) =>
                s3File.name === localFile.name || s3File.uri === localFile.uri
            );
            const isAlreadyUploaded = isFileAlreadyUploaded(localFile);

            // If already uploaded but not in our S3 list, mark it as an S3 file
            if (isAlreadyUploaded && !isAlreadyInS3) {
              s3Files.push({
                ...localFile,
                isS3File: true,
                source: "s3",
              });
              return false;
            }

            return !isAlreadyInS3 && !isAlreadyUploaded;
          })
          .map((file) => ({
            ...file,
            source: "local",
          }));

        const combinedFiles = [...s3Files, ...localFiles];
        setAllFiles(combinedFiles);
        updateFileCounts(combinedFiles);
      } else {
        // If no files or error, just use local files
        console.log(
          "No S3 files found or error occurred, using local files only"
        );
        const processedLocalFiles = reportFiles.map((file) => ({
          ...file,
          isS3File: isFileAlreadyUploaded(file),
          source: isFileAlreadyUploaded(file) ? "s3" : "local",
        }));

        setAllFiles(processedLocalFiles);
        updateFileCounts(processedLocalFiles);

        if (data.error) {
          setError(data.error);
        }
      }
    } catch (error) {
      console.error("❌ Error fetching S3 files:", error);
      setError("Failed to fetch files from server. Using local files only.");
      const processedLocalFiles = reportFiles.map((file) => ({
        ...file,
        isS3File: isFileAlreadyUploaded(file),
        source: isFileAlreadyUploaded(file) ? "s3" : "local",
      }));

      setAllFiles(processedLocalFiles);
      updateFileCounts(processedLocalFiles);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to update file counts
  const updateFileCounts = (files) => {
    const counts = {
      s3: files.filter((f) => f.source === "s3" || f.isS3File).length,
      local: files.filter((f) => f.source === "local" && !f.isS3File).length,
      total: files.length,
    };
    setFileCounts(counts);
  };

  // Helper function to guess file type from name
  const guessFileType = (filename) => {
    if (!filename) return "application/octet-stream";

    const extension = filename.split(".").pop().toLowerCase();

    switch (extension) {
      case "pdf":
        return "application/pdf";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "doc":
        return "application/msword";
      case "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      default:
        return "application/octet-stream";
    }
  };

  // Helper function to format date
  const formatDate = (timestamp) => {
    if (!timestamp) return null;

    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    } catch (e) {
      return null;
    }
  };

  // Refresh file list when modal opens or reportFiles changes
  useEffect(() => {
    if (isVisible) {
      fetchS3Files();
    }
  }, [isVisible, JSON.stringify(reportFiles)]);

  // Get filtered files based on active filter
  const getFilteredFiles = () => {
    if (activeFilter === "all") return allFiles;
    return allFiles.filter(
      (file) =>
        file.source === activeFilter || (activeFilter === "s3" && file.isS3File)
    );
  };

  // Handle file preview
  const handleFilePress = (file) => {
    // Only preview images for now
    if (file.type?.includes("image")) {
      setSelectedFile(file);
    } else {
      // Show info for non-image files
      Alert.alert(
        file.name || "File Info",
        `Type: ${file.type || "Unknown"}\n${
          file.size ? `Size: ${Math.round(file.size / 1024)} KB\n` : ""
        }${file.dateAdded ? `Date: ${file.dateAdded}\n` : ""}Storage: ${
          file.isS3File ? "S3 Cloud" : "Local (Pending Upload)"
        }`,
        [{ text: "OK" }]
      );
    }
  };

  // Close preview
  const closePreview = () => {
    setSelectedFile(null);
  };

  // Handle removing files
  const handleRemoveFile = (file, index) => {
    // Show different message based on if it's S3 or local
    const message = file.isS3File
      ? "This file is stored in S3. It will only be removed from this view but not from the server."
      : "Are you sure you want to remove this file?";

    Alert.alert("Remove File", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          if (removeReportFile && !file.isS3File) {
            // Only call removeReportFile for local files
            const localIndex = reportFiles.findIndex(
              (reportFile) => reportFile.uri === file.uri
            );
            if (localIndex !== -1) {
              removeReportFile(localIndex);
            }
          }

          // Remove from the displayed list
          setAllFiles((prev) => prev.filter((_, i) => i !== index));

          // Update counts
          updateFileCounts(allFiles.filter((_, i) => i !== index));
        },
      },
    ]);
  };

  // Render each file item
  const renderFileItem = ({ item, index }) => (
    <View style={styles.fileItem}>
      <View style={styles.fileDetails}>
        <View
          style={[
            styles.fileIconContainer,
            item.isS3File ? styles.s3IconContainer : null,
          ]}
        >
          <Ionicons
            name={
              item.type?.includes("pdf")
                ? "document-text"
                : item.type?.includes("image")
                ? "image"
                : "document"
            }
            size={24}
            color={item.isS3File ? "#FFFFFF" : "#0070D6"}
          />
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.name || `File ${index + 1}`}
          </Text>

          <View style={styles.fileMetaContainer}>
            {item.size && (
              <Text style={styles.fileSize}>
                {Math.round(item.size / 1024)} KB
              </Text>
            )}

            {item.dateAdded && (
              <Text style={styles.fileDate}>Added: {item.dateAdded}</Text>
            )}

            {item.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            )}

            {item.isS3File && (
              <View style={styles.s3Badge}>
                <Text style={styles.s3BadgeText}>S3</Text>
              </View>
            )}

            {!item.isS3File && (
              <View style={styles.localBadge}>
                <Text style={styles.localBadgeText}>Pending</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.fileActions}>
        {item.type?.includes("image") && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleFilePress(item)}
          >
            <Ionicons name="eye" size={22} color="#0070D6" />
            <Text style={styles.actionText}>Preview</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.removeButton]}
          onPress={() => handleRemoveFile(item, index)}
        >
          <Ionicons name="trash" size={22} color="#E53935" />
          <Text style={styles.removeText}>Remove</Text>
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
            <Text style={styles.modalTitle}>All Uploaded Files</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#4A5568" />
            </TouchableOpacity>
          </View>

          {/* Filter tabs */}
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[
                styles.filterTab,
                activeFilter === "all" && styles.activeFilterTab,
              ]}
              onPress={() => setActiveFilter("all")}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === "all" && styles.activeFilterText,
                ]}
              >
                All ({fileCounts.total})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterTab,
                activeFilter === "s3" && styles.activeFilterTab,
              ]}
              onPress={() => setActiveFilter("s3")}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === "s3" && styles.activeFilterText,
                ]}
              >
                S3 Files ({fileCounts.s3})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterTab,
                activeFilter === "local" && styles.activeFilterTab,
              ]}
              onPress={() => setActiveFilter("local")}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === "local" && styles.activeFilterText,
                ]}
              >
                Pending ({fileCounts.local})
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0070D6" />
              <Text style={styles.loadingText}>Loading files...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={32} color="#E53935" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={fetchS3Files}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : getFilteredFiles().length > 0 ? (
            <FlatList
              data={getFilteredFiles()}
              renderItem={renderFileItem}
              keyExtractor={(_, index) => `file-${index}`}
              contentContainerStyle={styles.fileList}
              ItemSeparatorComponent={() => <View style={styles.fileDivider} />}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={48} color="#A0AEC0" />
              <Text style={styles.emptyText}>
                {activeFilter === "all"
                  ? "No files uploaded yet"
                  : activeFilter === "s3"
                  ? "No files in S3 storage yet"
                  : "No pending files for upload"}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.closeFullButton} onPress={onClose}>
            <Text style={styles.closeFullButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Image Preview Modal */}
      {selectedFile && selectedFile.type?.includes("image") && (
        <Modal
          visible={!!selectedFile}
          transparent={true}
          animationType="fade"
          onRequestClose={closePreview}
        >
          <View style={styles.previewContainer}>
            <View style={styles.previewContent}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <TouchableOpacity
                  onPress={closePreview}
                  style={styles.previewCloseButton}
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

              <View style={styles.previewFooter}>
                <TouchableOpacity
                  style={styles.previewCloseFullButton}
                  onPress={closePreview}
                >
                  <Text style={styles.previewCloseFullButtonText}>
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
    }),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
  },
  closeButton: {
    padding: 4,
  },
  filterContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  activeFilterTab: {
    backgroundColor: "#0070D6",
  },
  filterText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4A5568",
  },
  activeFilterText: {
    color: "#FFFFFF",
  },
  fileList: {
    paddingVertical: 8,
  },
  fileDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  fileItem: {
    paddingVertical: 12,
  },
  fileDetails: {
    flexDirection: "row",
    marginBottom: 8,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBF8FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  s3IconContainer: {
    backgroundColor: "#0070D6",
  },
  fileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  fileName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#2D3748",
    marginBottom: 4,
  },
  fileMetaContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  fileSize: {
    fontSize: 12,
    color: "#718096",
    marginRight: 8,
  },
  fileDate: {
    fontSize: 12,
    color: "#718096",
    marginRight: 8,
  },
  categoryBadge: {
    backgroundColor: "#E6FFFA",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 12,
    color: "#319795",
    fontWeight: "500",
  },
  s3Badge: {
    backgroundColor: "#38A169",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  s3BadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  localBadge: {
    backgroundColor: "#ED8936",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  localBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  fileActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#EBF8FF",
    marginLeft: 8,
  },
  actionText: {
    fontSize: 12,
    color: "#0070D6",
    fontWeight: "500",
    marginLeft: 4,
  },
  removeButton: {
    backgroundColor: "#FEE2E2",
  },
  removeText: {
    fontSize: 12,
    color: "#E53935",
    fontWeight: "500",
    marginLeft: 4,
  },
  loadingContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#718096",
    marginTop: 12,
  },
  errorContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#E53935",
    marginTop: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#0070D6",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#718096",
    marginTop: 12,
  },
  closeFullButton: {
    backgroundColor: "#EDF2F7",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  closeFullButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
  },
  // Preview Modal Styles
  previewContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewContent: {
    width: "100%",
    height: "100%",
    padding: 16,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
    flex: 1,
  },
  previewCloseButton: {
    padding: 4,
  },
  previewImageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    height: "90%",
    borderRadius: 8,
  },
  previewFooter: {
    paddingVertical: 12,
    alignItems: "center",
  },
  previewCloseFullButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  previewCloseFullButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});

export default ViewUploadedFilesModal;
