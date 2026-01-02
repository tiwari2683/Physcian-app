import React, {
  // Force rebuild
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  ActionSheetIOS,
  Modal,
  Image,
  FlatList,
  Animated,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import ViewParametersModal from "./ViewParametersModal";
import ViewHistoryModal from "./ViewHistoryModal";
import ViewUploadedFilesModal from "./ViewUploadedFilesModal";
import ViewFilesModal from "./components/ViewFilesModal";
import AddHistoryModal from "./components/AddHistoryModal";
import AutoBulletTextArea from "../Common/AutoBulletTextArea";
import { useClinicalForm } from "./hooks/useClinicalForm";
import CollapsibleSection from "../Common/CollapsibleSection";
import { logObject } from "../../Utils/Logger";
import { ImagePickerErrorHandler } from "../../Utils/ImagePickerErrorHandler";
import { unmarshallDynamoDBObject } from "../../Utils/DynamoDbUtils";
import { normalizeUri, validateImageFile } from "../../Utils/FileUtils";



















// Helper function for regex escaping (new)
const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Format history for display with proper date sorting
const formatHistoryForDisplay = (historyText: string | null | undefined) => {
  if (!historyText) return null;

  // Split by entry markers
  const entrySeparator = /---\s*(?:New\s*)?Entry\s*\([^)]+\)\s*---/i;
  const entries = historyText.split(entrySeparator).filter(Boolean);

  // If there's just raw text with no separators, return it as is
  if (entries.length <= 1 && !historyText.match(entrySeparator)) {
    return <Text style={styles.historyText}>{historyText}</Text>;
  }

  // Find all entry markers with their positions and timestamps
  const markerRegex = /---\s*(?:New\s*)?Entry\s*\(([^)]+)\)\s*---/g;
  const markers = [];
  let match;

  while ((match = markerRegex.exec(historyText)) !== null) {
    markers.push({
      text: match[0],
      position: match.index,
      timestamp: match[1],
    });
  }

  // Extract entries with their timestamps
  const entriesWithDates: Array<{ text: string; timestamp: string; date: Date }> = [];

  for (let i = 0; i < markers.length; i++) {
    const startPos = markers[i].position + markers[i].text.length;
    const endPos =
      i < markers.length - 1 ? markers[i + 1].position : historyText.length;

    const entryText = historyText.substring(startPos, endPos).trim();

    if (entryText) {
      // Parse the date from the timestamp
      let date;
      try {
        date = new Date(markers[i].timestamp);
        // If the date is invalid, try parsing as locale string
        if (isNaN(date.getTime())) {
          // Extract date components from locale string formats like "4/21/2025, 10:30:45 AM"
          const parts = markers[i].timestamp.split(/[/,:\s]/);
          if (parts.length >= 3) {
            // Try to create a date from the components
            const month = parseInt(parts[0]) - 1; // 0-based months
            const day = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            date = new Date(year, month, day);
          }
        }
      } catch (e) {
        // If date parsing fails, use a default date
        console.log(
          `âŒ Error parsing date from timestamp: ${markers[i].timestamp}`,
          e
        );
        date = new Date(0);
      }

      entriesWithDates.push({
        text: entryText,
        timestamp: markers[i].timestamp,
        date: date,
      });
    }
  }

  // Sort entries by date (newest first)
  entriesWithDates.sort((a, b) => {
    // First try to compare by the parsed date
    if (a.date && b.date && !isNaN(a.date.getTime()) && !isNaN(b.date.getTime())) {
      return b.date.getTime() - a.date.getTime();
    }

    // If we can't compare by date, use the original order (this is a fallback)
    return 0;
  });

  // Create a formatted view with entries in date order (newest first)
  return (
    <View>
      {entriesWithDates.map((entry: any, index: number) => (
        <View key={index} style={styles.entryContainer}>
          {entry.timestamp && (
            <Text style={styles.entryTimestamp}>{entry.timestamp}</Text>
          )}
          <Text style={styles.historyText}>{entry.text}</Text>
          {index < entriesWithDates.length - 1 && (
            <View style={styles.entrySeparator} />
          )}
        </View>
      ))}
    </View>
  );
};

// Define TypeScript interface for ClinicalTab props
interface ClinicalTabProps {
  patientData: any;
  updateField: (field: string, value: any) => void;
  reportFiles: any[];
  clinicalParameters: any;
  setClinicalParameters: (params: any) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  tempDate: Date;
  setTempDate: (date: Date) => void;
  handleDateChange: (event: any, selectedDate?: Date) => void;
  pickDocument: (file?: any) => void;
  removeReportFile: (index: number) => void;
  isFileAlreadyUploaded: (file: any) => boolean;
  savedSections: any;
  patientId: string;
  prefillMode?: boolean;
  hideBasicTab?: boolean;
}

// Modify the component definition to use forwardRef with proper typing
const ClinicalTab = forwardRef<any, ClinicalTabProps>(
  (
    {
      patientData,
      updateField,
      reportFiles,
      clinicalParameters,
      setClinicalParameters,
      showDatePicker,
      setShowDatePicker,
      tempDate,
      setTempDate,
      handleDateChange,
      pickDocument,
      removeReportFile,
      isFileAlreadyUploaded,
      savedSections,
      patientId,
      prefillMode,
      hideBasicTab, // Add this line to receive the prop
    },
    ref
  ) => {
    // Use the custom hook for all form logic
    const {
      // directHistoryText, setDirectHistoryText removed
      tableModalVisible, setTableModalVisible,
      historicalData, setHistoricalData,
      dataFetched, setDataFetched,
      apiError, setApiError,
      historyModalVisible, setHistoryModalVisible,
      viewFilesModalVisible, setViewFilesModalVisible,
      viewUploadedFilesModalVisible, setViewUploadedFilesModalVisible,
      isLoading, setIsLoading,
      addHistoryModalVisible, setAddHistoryModalVisible,
      isPickerActive, setIsPickerActive,
      expandedSections, setExpandedSections,
      removeReportFileWithBackend,
      createPermanentFileStorage,
      safePickDocument,
      // saveDirectHistoryToMedicalHistory removed
      // getLatestMedicalHistory removed
      // transferHistoryText removed
      handleSaveNewHistory,
      toggleSection,
      handleParameterUpdate,
      fetchCurrentPatientData,
      fetchHistoricalData,
      clearClinicalDraft,
    } = useClinicalForm({
      patientId,
      reportFiles,
      removeReportFile,
      pickDocument,
      clinicalParameters,
      setClinicalParameters,
      updateField,
      setTempDate,
      savedSections,
      prefillMode,
      patientData,
    });

    useImperativeHandle(ref, () => ({
      // Legacy methods removed - History is now integrated into patientData
      clearClinicalDraft, // Exposed for parent to clear draft after save
    }));

    // Function to show upload options (Gallery, Camera, Document)
    const showUploadOptions = () => {
      if (Platform.OS === "ios") {
        // For iOS, use ActionSheetIOS
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: [
              "Cancel",
              "Take Photo",
              "Choose from Gallery",
              "Select Document",
            ],
            cancelButtonIndex: 0,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) {
              // Take Photo
              launchCamera();
            } else if (buttonIndex === 2) {
              // Choose from Gallery
              launchImageLibrary();
            } else if (buttonIndex === 3) {
              // Select Document
              launchDocumentPicker();
            }
          }
        );
      } else {
        // For Android, use Alert
        Alert.alert(
          "Upload Report",
          "Choose an option",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Take Photo", onPress: launchCamera },
            { text: "Choose from Gallery", onPress: launchImageLibrary },
            { text: "Select Document", onPress: launchDocumentPicker },
          ],
          { cancelable: true }
        );
      }
    };

    async function clearAllPickerFlags() {
      try {
        const keysToRemove = [
          "PICKER_OPERATION_ACTIVE",
          "PRE_PICKER_STATE",
          "LAST_KNOWN_ROUTE",
          "APP_LIFECYCLE_STATE",
        ];

        await AsyncStorage.multiRemove(keysToRemove);
        console.log("🧹 Successfully cleared all picker-related flags");
        return true;
      } catch (error) {
        console.error("❌ Error clearing picker flags:", error);
        return false;
      }
    }

    // Enhanced camera launch function with comprehensive error handling and state management
    async function launchCamera() {
      if (isPickerActive) {
        console.log("🚫 Camera picker already active, ignoring request");
        return;
      }

      setIsPickerActive(true);

      try {
        console.log("📸 Launching camera for report upload...");

        // Save complete navigation context before picker launch
        const prePickerState = {
          timestamp: Date.now(),
          patientId,
          currentRoute: "NewPatientForm",
          currentTab: "clinical",
          hideBasicTab: true,
          expandedSections,
          isPickerOperation: true, // Mark this as a picker operation
        };

        await AsyncStorage.multiSet([
          ["PRE_PICKER_STATE", JSON.stringify(prePickerState)],
          ["PICKER_OPERATION_ACTIVE", "true"],
          [
            "LAST_KNOWN_ROUTE",
            JSON.stringify({
              routeName: "NewPatientForm",
              params: {
                hideBasicTab: true,
                initialTab: "clinical",
                patientId: patientId,
              },
            }),
          ],
        ]);

        console.log("💾 Pre-picker state saved for navigation protection");

        // Request camera permissions
        const { status } = await ImagePicker.requestCameraPermissionsAsync();

        if (status !== "granted") {
          console.log("❌ Camera permission denied");
          Alert.alert(
            "Permission Denied",
            "Camera permission is required to take photos."
          );
          return;
        }

        console.log("📸 Camera permissions granted, launching picker");

        // Use memory-conscious settings to prevent app crashes
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
          base64: false,
          exif: false,
          allowsMultipleSelection: false,
        });

        console.log("📸 Camera operation completed");
        console.log("📸 Camera result structure:", {
          canceled: result.canceled,
          assetsCount: result.assets?.length || 0,
          hasUri: result.assets?.[0]?.uri ? "yes" : "no",
        });

        // Clear picker operation flag immediately after picker completes
        await AsyncStorage.removeItem("PICKER_OPERATION_ACTIVE");

        // Comprehensive result validation
        if (result.canceled) {
          console.log("📸 Camera capture was cancelled by user");
          return;
        }

        if (
          !result.assets ||
          !Array.isArray(result.assets) ||
          result.assets.length === 0
        ) {
          console.error("❌ Invalid result structure from camera:", result);
          Alert.alert("Error", "Invalid image data received from camera.");
          return;
        }

        const selectedImage = result.assets[0];

        // Validate the selected image
        if (!selectedImage || !selectedImage.uri) {
          console.error("❌ No valid image URI from camera:", selectedImage);
          Alert.alert("Error", "No valid image was captured.");
          return;
        }

        console.log("📸 Processing camera image:", {
          uri: selectedImage.uri
            ? selectedImage.uri.substring(0, 50) + "..."
            : "none",
          width: selectedImage.width,
          height: selectedImage.height,
          type: selectedImage.type,
          fileName: selectedImage.fileName,
        });

        // Normalize URI for Android compatibility
        let normalizedUri;
        try {
          normalizedUri = await normalizeUri(selectedImage.uri);
          console.log(
            `🔄 Normalized URI: ${normalizedUri.substring(0, 50)}...`
          );
        } catch (normalizationError) {
          console.error("❌ Error normalizing URI:", normalizationError);
          normalizedUri = selectedImage.uri; // Fallback to original
        }

        // Validate the image file
        const validationResult = await validateImageFile({
          ...selectedImage,
          uri: normalizedUri,
        });

        if (!validationResult.exists || validationResult.errors.length > 0) {
          console.error("❌ Image validation failed:", validationResult);
          Alert.alert(
            "Image Validation Failed",
            `The captured image has issues: ${validationResult.errors.join(
              ", "
            )}`
          );
          return;
        }

        // Get file info with error handling
        let fileInfo;
        try {
          fileInfo = await FileSystem.getInfoAsync(normalizedUri);
          console.log("📄 File info:", {
            exists: fileInfo.exists,
            size: 'size' in fileInfo && fileInfo.size
              ? `${Math.round(fileInfo.size / 1024)}KB`
              : "unknown",
            isDirectory: fileInfo.isDirectory,
          });
        } catch (fileError) {
          console.error("❌ Error getting file info:", fileError);
          // Continue without file size info but with a fallback
          fileInfo = {
            exists: true,
            size: selectedImage.fileSize || null,
          };
        }

        if (!fileInfo.exists) {
          console.error(
            "❌ Camera image file does not exist at URI:",
            normalizedUri
          );
          Alert.alert("Error", "The captured image could not be found.");
          return;
        }

        // Format today's date for the report entry
        const today = new Date();
        const formattedDate = today.toLocaleDateString();

        // Create file object with all required properties and a unique identifier
        const uniqueId = `camera_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 5)}`;

        // Generate a proper filename if none exists
        const fileName =
          selectedImage.fileName ||
          `camera_${new Date().getTime()}.${(
            selectedImage.mimeType ||
            selectedImage.type ||
            "image/jpeg"
          ).split("/")[1] || "jpg"
          }`;

        const file = {
          uri: normalizedUri,
          name: fileName,
          type: selectedImage.mimeType || selectedImage.type || "image/jpeg",
          size: fileInfo.size || selectedImage.fileSize || null,
          category: "Camera",
          dateAdded: formattedDate,
          uniqueId: uniqueId,
          width: selectedImage.width,
          height: selectedImage.height,
          isCropped: true, // Mark as cropped since allowsEditing was true
        };

        console.log("📄 Prepared camera file object:", {
          name: file.name,
          type: file.type,
          size: file.size ? `${Math.round(file.size / 1024)}KB` : "unknown",
          category: file.category,
          uniqueId: file.uniqueId,
          isCropped: file.isCropped,
        });

        // Validate safePickDocument function before calling
        if (typeof safePickDocument !== "function") {
          console.error(
            "❌ safePickDocument is not a function:",
            typeof safePickDocument
          );
          Alert.alert(
            "Error",
            "Cannot process image due to internal error. Please contact support."
          );
          return;
        }

        // Call safePickDocument with the file - this will handle file storage and state updates
        console.log("📥 Calling safePickDocument with camera file");
        const success = await safePickDocument(file);

        if (success) {
          console.log("✅ Successfully processed camera image");

          // Clear all picker flags immediately
          try {
            await AsyncStorage.multiRemove([
              "PICKER_OPERATION_ACTIVE",
              "PRE_PICKER_STATE",
              "LAST_KNOWN_ROUTE",
              "APP_LIFECYCLE_STATE",
            ]);
            console.log(
              "🧹 Cleared all picker flags to prevent navigation issues"
            );
          } catch (clearError) {
            console.error("❌ Error clearing picker flags:", clearError);
          }

          // Auto-expand reports section to show the new file
          if (!expandedSections.reports) {
            console.log("📂 Auto-expanding reports section to show new file");
            setExpandedSections((prev) => ({
              ...prev,
              reports: true,
            }));
          }
        } else {
          console.log("❌ Failed to process camera image");

          // Clear picker flags even on failure
          try {
            await AsyncStorage.multiRemove([
              "PICKER_OPERATION_ACTIVE",
              "PRE_PICKER_STATE",
              "LAST_KNOWN_ROUTE",
            ]);
          } catch (clearError) {
            console.error(
              "❌ Error clearing picker flags on failure:",
              clearError
            );
          }

          Alert.alert(
            "Error",
            "Failed to add image to reports. Please try again."
          );
        }
      } catch (error: any) {
        console.error("❌ Error taking photo:", error);
        console.error("❌ Error stack:", error?.stack);

        // Clear picker operation flag on error
        await AsyncStorage.removeItem("PICKER_OPERATION_ACTIVE");

        const errorDetails = ImagePickerErrorHandler.handleError(
          error,
          "launchCamera"
        );

        Alert.alert("Camera Error", errorDetails.userMessage, [{ text: "OK" }]);
      } finally {
        setIsPickerActive(false);
        // Final cleanup of all picker flags
        try {
          await AsyncStorage.multiRemove([
            "PICKER_OPERATION_ACTIVE",
            "PRE_PICKER_STATE",
            "LAST_KNOWN_ROUTE",
          ]);
        } catch (finalError) {
          console.error("❌ Final cleanup error:", finalError);
        }
        console.log("🔓 Camera picker operation completed, all flags cleared");
      }
    }

    // Enhanced picker launch function with navigation protection
    async function launchImageLibrary() {
      if (isPickerActive) {
        console.log("ðŸš« Gallery picker already active, ignoring request");
        return;
      }

      setIsPickerActive(true);

      try {
        console.log("ðŸ–¼ï¸ Launching image gallery for report upload...");

        // Save complete navigation context before picker launch
        const prePickerState = {
          timestamp: Date.now(),
          patientId,
          currentRoute: "NewPatientForm",
          currentTab: "clinical",
          hideBasicTab: true,
          expandedSections,
          isPickerOperation: true,
        };

        await AsyncStorage.multiSet([
          [
            "PRE_PICKER_STATE",
            JSON.stringify({
              ...prePickerState,
              isPickerOperation: true, // Mark this as a picker operation
            }),
          ],
          ["PICKER_OPERATION_ACTIVE", "true"],
          [
            "LAST_KNOWN_ROUTE",
            JSON.stringify({
              routeName: "NewPatientForm",
              params: {
                hideBasicTab: true,
                initialTab: "clinical",
                patientId: patientId,
              },
            }),
          ],
        ]);

        console.log("ðŸ’¾ Pre-picker state saved for navigation protection");

        // Request media library permissions
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (status !== "granted") {
          console.log("âŒ Media library permission denied");
          Alert.alert(
            "Permission Denied",
            "Media library permission is required to select images."
          );
          return;
        }

        console.log("ðŸ–¼ï¸ Gallery permissions granted, launching picker");

        // Use memory-conscious settings and updated API
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8, // Memory-conscious quality setting
          base64: false,
          exif: false, // Disable EXIF to reduce memory usage
          allowsMultipleSelection: false,
        });

        console.log("ðŸ–¼ï¸ Gallery operation completed");
        console.log("ðŸ–¼ï¸ Gallery result structure:", {
          canceled: result.canceled,
          assetsLength: result.assets?.length || 0,
          hasUri: result.assets?.[0]?.uri ? "yes" : "no",
        });

        // Clear picker operation flag immediately after picker completes
        await AsyncStorage.removeItem("PICKER_OPERATION_ACTIVE");

        // Robust result validation
        if (result.canceled) {
          console.log("ðŸ–¼ï¸ Gallery selection was cancelled by user");
          return;
        }

        if (
          !result.assets ||
          !Array.isArray(result.assets) ||
          result.assets.length === 0
        ) {
          console.error("âŒ Invalid result structure from gallery:", result);
          Alert.alert("Error", "Invalid image data received from gallery.");
          return;
        }

        const selectedImage = result.assets[0];

        if (!selectedImage || !selectedImage.uri) {
          console.error("âŒ No valid image URI from gallery:", selectedImage);
          Alert.alert("Error", "No valid image was selected.");
          return;
        }

        console.log("ðŸ–¼ï¸ Processing gallery image:", {
          uri: selectedImage.uri
            ? selectedImage.uri.substring(0, 50) + "..."
            : "none",
          width: selectedImage.width,
          height: selectedImage.height,
          type: selectedImage.mimeType || selectedImage.type,
          fileName: selectedImage.fileName,
        });

        // Normalize URI for Android compatibility
        let normalizedUri;
        try {
          normalizedUri = await normalizeUri(selectedImage.uri);
          console.log(
            `ðŸ”„ Normalized URI: ${normalizedUri.substring(0, 50)}...`
          );
        } catch (normalizationError) {
          console.error("âŒ Error normalizing URI:", normalizationError);
          normalizedUri = selectedImage.uri; // Fallback to original
        }

        // Validate the image file
        const validationResult = await validateImageFile({
          ...selectedImage,
          uri: normalizedUri,
        });

        if (!validationResult.exists || validationResult.errors.length > 0) {
          console.error("âŒ Image validation failed:", validationResult);
          Alert.alert(
            "Image Validation Failed",
            `The selected image has issues: ${validationResult.errors.join(
              ", "
            )}`
          );
          return;
        }

        // Get file info with robust error handling
        let fileInfo;
        try {
          fileInfo = await FileSystem.getInfoAsync(normalizedUri);
          console.log("📄 File info:", {
            exists: fileInfo.exists,
            size: ('size' in fileInfo)
              ? `${Math.round((fileInfo as any).size / 1024)}KB`
              : "unknown",
            isDirectory: fileInfo.isDirectory,
          });
        } catch (fileError) {
          console.error("âŒ Error getting file info:", fileError);
          fileInfo = {
            exists: true,
            size: selectedImage.fileSize || null,
          };
        }

        if (!fileInfo.exists) {
          console.error(
            "âŒ Gallery image file does not exist at URI:",
            normalizedUri
          );
          Alert.alert("Error", "The selected image could not be found.");
          return;
        }

        // Create file object with comprehensive data
        const today = new Date();
        const formattedDate = today.toLocaleDateString();
        const uniqueId = `gallery_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 5)}`;

        // Generate proper filename if missing
        const fileName =
          selectedImage.fileName ||
          `gallery_${new Date().getTime()}.${(
            selectedImage.mimeType ||
            selectedImage.type ||
            "image/jpeg"
          ).split("/")[1] || "jpg"
          }`;

        const file = {
          uri: normalizedUri,
          name: fileName,
          type: selectedImage.mimeType || selectedImage.type || "image/jpeg",
          size: fileInfo.size || selectedImage.fileSize || null,
          category: "Gallery",
          dateAdded: formattedDate,
          uniqueId: uniqueId,
          width: selectedImage.width,
          height: selectedImage.height,
          isCropped: true, // Mark as cropped since allowsEditing was true
        };

        console.log("ðŸ“„ Prepared gallery file object:", {
          name: file.name,
          type: file.type,
          size: file.size ? `${Math.round(file.size / 1024)}KB` : "unknown",
          category: file.category,
          uniqueId: file.uniqueId,
          isCropped: file.isCropped,
        });

        // Validate and call safePickDocument
        if (typeof safePickDocument !== "function") {
          console.error(
            "âŒ safePickDocument is not a function:",
            typeof safePickDocument
          );
          Alert.alert("Error", "Cannot process image due to internal error.");
          return;
        }

        console.log("ðŸ“¤ Calling safePickDocument with gallery file");

        // Call safePickDocument with timeout protection
        const success = await Promise.race([
          safePickDocument(file),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Operation timeout")), 15000)
          ),
        ]);

        if (success) {
          console.log("âœ… Successfully processed gallery image");

          // Clear all picker-related storage after successful operation
          await AsyncStorage.multiRemove([
            "PRE_PICKER_STATE",
            "PICKER_OPERATION_ACTIVE",
            "LAST_KNOWN_ROUTE",
          ]);
        } else {
          console.log("âŒ Failed to process gallery image");
          Alert.alert(
            "Error",
            "Failed to add image to reports. Please try again."
          );
        }
      } catch (error: any) {
        console.error("âŒ Error selecting image:", error);
        console.error("âŒ Error stack:", error.stack);

        // Clear picker operation flag on error
        await AsyncStorage.removeItem("PICKER_OPERATION_ACTIVE");

        const errorDetails = ImagePickerErrorHandler.handleError(
          error,
          "launchImageLibrary"
        );

        Alert.alert("Gallery Error", errorDetails.userMessage, [
          { text: "OK" },
        ]);
      } finally {
        setIsPickerActive(false);
        console.log(
          "ðŸ”“ Gallery picker operation completed, isPickerActive reset"
        );
      }
    }

    // Enhanced document picker function
    async function launchDocumentPicker() {
      if (isPickerActive) {
        console.log("ðŸš« Document picker already active, ignoring request");
        return;
      }

      setIsPickerActive(true);

      try {
        console.log("ðŸ“‘ Launching document picker for report upload...");

        // Launch document picker
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            "application/pdf",
            "image/*",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          copyToCacheDirectory: true,
        });

        // console.log("ðŸ“‘ Document picker result type:", result.type);

        // Check if a document was selected successfully
        if (
          result.canceled === false &&
          result.assets &&
          result.assets.length > 0
        ) {
          const document = result.assets[0];
          console.log(
            "ðŸ“‘ Document selected:",
            JSON.stringify({
              uri: document.uri
                ? document.uri.substring(0, 30) + "..."
                : "none",
              name: document.name,
              mimeType: document.mimeType,
              size: document.size
                ? `${Math.round(document.size / 1024)}KB`
                : "unknown",
            })
          );

          // Validate document
          const validationResult = await validateImageFile(document);
          if (validationResult.errors.length > 0) {
            console.warn(
              "âš ï¸ Document validation warnings:",
              validationResult.errors
            );
            // Continue anyway for documents (they might not be images)
          }

          // Format today's date for the report entry
          const today = new Date();
          const formattedDate = today.toLocaleDateString();

          // Create file object with all required properties and a unique identifier
          const uniqueId = `doc_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 5)}`;

          const file = {
            uri: document.uri,
            name: document.name,
            type: document.mimeType || "application/octet-stream",
            size: document.size,
            category: "Document",
            dateAdded: formattedDate,
            uniqueId: uniqueId,
          };

          console.log(
            "ðŸ“„ Prepared document file object:",
            JSON.stringify({
              name: file.name,
              type: file.type,
              size: file.size ? `${Math.round(file.size / 1024)}KB` : "unknown",
              category: file.category,
              uniqueId: file.uniqueId,
            })
          );

          // Call safePickDocument with the file
          if (typeof safePickDocument === "function") {
            console.log("ðŸ“¤ Calling safePickDocument with document file");
            const success = await safePickDocument(file);

            if (success) {
              console.log("âœ… Successfully processed document");

              Alert.alert("Success", "Document added to reports successfully!");
            } else {
              console.log("âŒ Failed to process document");
              Alert.alert(
                "Error",
                "Failed to add document to reports. Please try again."
              );
            }
          } else {
            console.error(
              "âŒ safePickDocument is not a function:",
              safePickDocument
            );
            Alert.alert(
              "Error",
              "Cannot process document due to internal error."
            );
          }
        } else {
          console.log("ðŸ“‘ Document selection cancelled or failed");
        }
      } catch (error: any) {
        console.error("âŒ Error selecting document:", error);
        console.error("âŒ Error stack:", error.stack);

        const errorDetails = ImagePickerErrorHandler.handleError(
          error,
          "launchDocumentPicker"
        );

        Alert.alert("Document Error", errorDetails.userMessage, [
          { text: "OK" },
        ]);
      } finally {
        setIsPickerActive(false);
        console.log(
          "ðŸ”“ Document picker operation completed, isPickerActive reset"
        );
      }
    }

    return (
      <View style={styles.formSection}>
        {/* Show API error message if one exists */}
        {apiError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>API Error</Text>
            <Text style={styles.errorMessage}>{apiError}</Text>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={() => {
                setApiError(null);
                // Try fetching data again
                fetchCurrentPatientData();
              }}
            >
              <Text style={styles.errorButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History/Complaints/Symptoms Section - MODIFIED to use formatHistoryForDisplay */}
        <CollapsibleSection
          title="History/Complaints/Symptoms"
          isExpanded={expandedSections.history}
          onToggle={() => toggleSection("history")}
          icon="document-text-outline"
        >
          <View style={styles.inputWrapper}>
            {/* Phase 3 Fix: Unified Input Logic - Always bind to newHistoryEntry */}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.inputLabel}>History/Complaints/Symptoms:</Text>
              <AutoBulletTextArea
                value={patientData.newHistoryEntry || ""} // Always bind to draft field
                onChangeText={(text: string) => updateField("newHistoryEntry", text)}
                placeholder="Enter patient's history, complaints, and symptoms. Use dash (-) or bullet (•) at the beginning of a line for auto-bulleting."
                style={[styles.textArea, { minHeight: 200 }]} // Keep the larger height
                numberOfLines={12}
              />
            </View>

            <View style={styles.historyButtonsRow}>
              <TouchableOpacity
                style={styles.viewHistoryButtonBelow}
                onPress={() => setHistoryModalVisible(true)}
              >
                <Ionicons
                  name="eye-outline"
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.viewHistoryButtonText}>
                  View History {patientData.medicalHistory ? "(Has Data)" : ""}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Hint text moved inside the unified view or simply kept below */}
            <Text style={styles.hintText}>
              Tip: Start a line with "-" to create a bulleted list
            </Text>

          </View>
        </CollapsibleSection>

        {/* Reports Section */}
        <CollapsibleSection
          title="Reports"
          isExpanded={expandedSections.reports}
          onToggle={() => toggleSection("reports")}
          icon="document-attach-outline"
        >
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.textArea, { minHeight: 150 }]}
              value={patientData.reports}
              onChangeText={(text) => updateField("reports", text)}
              placeholder="Enter report details or upload reports"
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              placeholderTextColor="#C8C8C8"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.uploadButton,
                isPickerActive && styles.uploadButtonDisabled,
              ]}
              onPress={() => {
                if (isPickerActive) {
                  console.log(
                    "ðŸš« Upload button disabled - picker operation in progress"
                  );
                  return;
                }

                console.log(
                  `ðŸ“ Current reportFiles count before upload: ${reportFiles.length}`
                );
                if (reportFiles.length > 0) {
                  console.log("ðŸ“ Existing reportFiles preview:");
                  reportFiles.forEach((file, idx) => {
                    console.log(
                      `     File ${idx + 1}: ${file.name}, Category: ${file.category || "uncategorized"
                      }, Unique ID: ${file.uniqueId || "none"}`
                    );
                  });
                }
                showUploadOptions();
              }}
              disabled={isPickerActive}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={isPickerActive ? "#A0AEC0" : "#FFFFFF"}
              />
              <Text
                style={[
                  styles.uploadButtonText,
                  isPickerActive && styles.uploadButtonTextDisabled,
                ]}
              >
                {isPickerActive ? "Processing..." : "Upload Report"}
              </Text>
            </TouchableOpacity>

            {/* Enhanced file list display with file type icons, status indicators, and categories */}
            {reportFiles.length > 0 && (
              <View style={styles.uploadedFilesContainer}>
                <Text style={styles.uploadedFilesTitle}>
                  Uploaded Files: ({reportFiles.length})
                </Text>
                {reportFiles.map((file, index) => (
                  <View key={index} style={styles.fileItem}>
                    <View style={styles.fileDetails}>
                      <Ionicons
                        name={
                          file.type?.includes("pdf")
                            ? "document-text-outline"
                            : file.type?.includes("image")
                              ? "image-outline"
                              : "document-outline"
                        }
                        size={18}
                        color="#0070D6"
                      />
                      <Text
                        style={styles.fileName}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {file.name || `File ${index + 1}`}
                      </Text>

                      {/* Add file size if available */}
                      {file.size && (
                        <Text style={styles.fileSize}>
                          ({Math.round(file.size / 1024)} KB)
                        </Text>
                      )}

                      {/* Display category if available */}
                      {file.category && (
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryText}>
                            {file.category}
                          </Text>
                        </View>
                      )}

                      {/* Add a status indicator for S3 urls */}
                      {file.uri && isFileAlreadyUploaded(file) && (
                        <View style={styles.s3BadgeContainer}>
                          <Text style={styles.s3BadgeText}>S3</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.fileActions}>
                      {/* Preview button for images */}
                      {file.type?.includes("image") && (
                        <TouchableOpacity
                          style={styles.previewButton}
                          onPress={() => {
                            Alert.alert(
                              file.name || "ImagePreview",
                              `Category: ${file.category || "Uncategorized"
                              }\nThis image will be uploaded when you save this section.`,
                              [{ text: "OK" }]
                            );
                          }}
                        >
                          <Ionicons
                            name="eye-outline"
                            size={18}
                            color="#4A5568"
                          />
                        </TouchableOpacity>
                      )}

                      {/* Remove button - Updated to use enhanced deletion */}
                      <TouchableOpacity
                        onPress={() => removeReportFileWithBackend(index)}
                      >
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color="#E53935"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <Text style={styles.uploadInfoText}>
                  Files will be uploaded to S3 when you save this section. Make
                  sure your internet connection is stable.
                </Text>

                {/* New "View Upload Files" button - Updated to use the new modal */}
                {reportFiles.length > 0 && (
                  <TouchableOpacity
                    style={styles.viewFilesButton}
                    onPress={() => setViewUploadedFilesModalVisible(true)}
                  >
                    <Ionicons
                      name="folder-open-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.viewFilesButtonText}>
                      View Upload Files
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </CollapsibleSection >

        {/* Clinical Parameters Section */}
        < CollapsibleSection
          title="Clinical Parameters"
          isExpanded={expandedSections.clinicalParameters}
          onToggle={() => toggleSection("clinicalParameters")}
          icon="pulse-outline"
        >
          <ScrollView
            style={styles.clinicalParametersContainer}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date input with picker */}
            <View style={styles.dateInputContainer}>
              <Text style={styles.dateInputLabel}>Date:</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.datePickerText}>
                  {tempDate ? tempDate.toLocaleDateString() : "Select Date"}
                </Text>
                <Ionicons name="calendar-outline" size={16} color="#4A5568" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              )}
            </View>

            {/* First row of parameters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              style={styles.parametersScrollView}
            >
              <View style={styles.parametersRow}>
                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>INR (last)</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.inr}
                    onChangeText={(text) => handleParameterUpdate("inr", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>HB</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.hb}
                    onChangeText={(text) => handleParameterUpdate("hb", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>WBC</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.wbc}
                    onChangeText={(text) => handleParameterUpdate("wbc", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>Platelet</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.platelet}
                    onChangeText={(text) =>
                      handleParameterUpdate("platelet", text)
                    }
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>Bilirubin</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.bilirubin}
                    onChangeText={(text) =>
                      handleParameterUpdate("bilirubin", text)
                    }
                  />
                </View>
              </View>
            </ScrollView>

            {/* Second row of parameters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              style={styles.parametersScrollView}
            >
              <View style={styles.parametersRow}>
                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>SGOT</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.sgot}
                    onChangeText={(text) => handleParameterUpdate("sgot", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>SGPT</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.sgpt}
                    onChangeText={(text) => handleParameterUpdate("sgpt", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>ALT</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.alt}
                    onChangeText={(text) => handleParameterUpdate("alt", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>TPR/Alb</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.tprAlb}
                    onChangeText={(text) =>
                      handleParameterUpdate("tprAlb", text)
                    }
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>Urea/Creat</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.ureaCreat}
                    onChangeText={(text) =>
                      handleParameterUpdate("ureaCreat", text)
                    }
                  />
                </View>
              </View>
            </ScrollView>

            {/* Third row of parameters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              style={styles.parametersScrollView}
            >
              <View style={styles.parametersRow}>
                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>Sodium (Na)</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.sodium}
                    onChangeText={(text) =>
                      handleParameterUpdate("sodium", text)
                    }
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>Fasting/HBA1C</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.fastingHBA1C}
                    onChangeText={(text) =>
                      handleParameterUpdate("fastingHBA1C", text)
                    }
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>P.P</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.pp}
                    onChangeText={(text) => handleParameterUpdate("pp", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>TSH</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.tsh}
                    onChangeText={(text) => handleParameterUpdate("tsh", text)}
                  />
                </View>

                <View style={styles.parameterInputContainer}>
                  <Text style={styles.parameterLabel}>FT4</Text>
                  <TextInput
                    style={styles.parameterInput}
                    keyboardType="numeric"
                    placeholder="Value"
                    value={clinicalParameters.ft4}
                    onChangeText={(text) => handleParameterUpdate("ft4", text)}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Other parameter field */}
            <View style={styles.otherParameterContainer}>
              <Text style={styles.parameterLabel}>Others</Text>
              <TextInput
                style={styles.otherParameterInput}
                placeholder="Other parameters"
                multiline
                numberOfLines={4}
                value={clinicalParameters.others || ""}
                onChangeText={(text) => handleParameterUpdate("others", text)}
              />
            </View>
            {/* Only show button if hideBasicTab is true (coming from DoctorDashboard) AND we have data */}
            {hideBasicTab &&
              (savedSections?.clinical ||
                (clinicalParameters &&
                  Object.values(clinicalParameters).some(
                    (value) => value
                  ))) && (
                <TouchableOpacity
                  style={styles.viewTableButton}
                  onPress={() => {
                    // Prepare current parameters before showing the modal
                    if (clinicalParameters) {
                      console.log("ðŸ” Preparing data for parameters table...");

                      // Ensure we have a date before showing
                      if (!clinicalParameters.date) {
                        console.log("ðŸ—“ï¸ No date found, setting current date");
                        const updatedParams = {
                          ...clinicalParameters,
                          date: new Date(),
                        };
                        setClinicalParameters(updatedParams);

                        // Create a temporary copy for immediate use
                        const tempRecord = {
                          ...updatedParams,
                          isCurrent: true,
                        };

                        // Pre-populate historical data with at least this record
                        setHistoricalData([tempRecord]);
                        console.log(
                          "ðŸ“Š Pre-populated historical data with current record"
                        );
                      } else {
                        console.log(
                          `ðŸ—“ï¸ Using existing date: ${clinicalParameters.date}`
                        );

                        // Create a temporary record for immediate use
                        const tempRecord = {
                          ...clinicalParameters,
                          isCurrent: true,
                        };

                        // Pre-populate historical data with at least this record
                        setHistoricalData([tempRecord]);
                        console.log(
                          "ðŸ“Š Pre-populated historical data with current record"
                        );
                      }
                    }

                    // Log before showing modal
                    console.log("ðŸ“Š About to show modal with prepared data");

                    // Show the modal immediately
                    setTableModalVisible(true);
                  }}
                >
                  <Ionicons name="grid-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.viewTableButtonText}>
                    View Parameters Table
                  </Text>
                </TouchableOpacity>
              )}
          </ScrollView>
        </CollapsibleSection >

        {/* Use the ViewParametersModal component */}
        < ViewParametersModal
          isVisible={tableModalVisible}
          onClose={() => {
            console.log("ðŸ”’ Closing parameters modal");
            setTableModalVisible(false);
          }}
          clinicalParameters={clinicalParameters}
          patientId={patientId}
          unmarshallDynamoDBObject={unmarshallDynamoDBObject}
          // Pass the initial historical data to ensure it's never empty
          initialHistoricalData={
            historicalData.length > 0 ? historicalData : null
          }
        />

        {/* Add the History/Complaints/Symptoms Modal */}
        < ViewHistoryModal
          isVisible={historyModalVisible}
          onClose={() => setHistoryModalVisible(false)}
          historyText={patientData.medicalHistory}
          patientId={patientId} // Add this line to pass the patientId prop
        />

        {/* Add the View Files Modal - Updated to use enhanced deletion */}
        < ViewFilesModal
          isVisible={viewFilesModalVisible}
          onClose={() => setViewFilesModalVisible(false)}
          reportFiles={reportFiles}
          removeReportFileWithBackend={removeReportFileWithBackend} // Updated to use enhanced deletion
          patientId={patientId} // Pass patientId for backend deletion
        />

        {/* Add the ViewUploadedFilesModal component */}
        < ViewUploadedFilesModal
          isVisible={viewUploadedFilesModalVisible}
          onClose={() => setViewUploadedFilesModalVisible(false)}
          patientId={patientId}
          reportFiles={reportFiles}
          removeReportFile={removeReportFileWithBackend} // Updated to use enhanced deletion
          isFileAlreadyUploaded={isFileAlreadyUploaded}
        />

        {/* Add the Add History Modal */}
        < AddHistoryModal
          isVisible={addHistoryModalVisible}
          onClose={() => setAddHistoryModalVisible(false)}
          onSave={handleSaveNewHistory}
          patientId={patientId}
        />
      </View >
    );
  }
);

const styles = StyleSheet.create({
  formSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  // Collapsible section styles
  collapsibleContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    overflow: "hidden",
  },
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#F7FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  collapsibleTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1, // Add flex to take available space
    maxWidth: "85%", // Limit width to ensure arrow is visible
  },
  collapsibleHeaderIcon: {
    marginRight: 10,
    minWidth: 20, // Ensure icon has minimum width
  },
  chevronContainer: {
    width: 30, // Fixed width for the chevron container
    alignItems: "center", // Center the chevron horizontally
    justifyContent: "center", // Center the chevron vertically
  },
  collapsibleTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    flexShrink: 1, // Allow text to shrink if needed
  },
  collapsibleContent: {
    padding: 15,
    backgroundColor: "#FFFFFF",
  },
  inputWrapper: { marginBottom: 16 },
  labelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 6,
  },
  // Style for non-editable history text
  historyText: {
    fontSize: 16,
    color: "#2D3748",
    lineHeight: 24,
  },
  placeholderText: {
    fontSize: 16,
    color: "#A0AEC0",
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },
  // Row container for buttons
  historyButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  // Updated styles for View History button below input field
  viewHistoryButtonBelow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0070D6",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    marginRight: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  viewHistoryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  // Style for the new Add History button
  addHistoryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#38A169", // Green color to differentiate from view button
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  addHistoryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  textInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
  },
  hintText: {
    fontSize: 12,
    color: "#718096",
    fontStyle: "italic",
    marginTop: 4,
  },
  // Error styles
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F87171",
  },
  errorTitle: {
    color: "#B91C1C",
    fontWeight: "600",
    marginBottom: 4,
    fontSize: 16,
  },
  errorMessage: {
    color: "#7F1D1D",
    fontSize: 14,
    marginBottom: 8,
  },
  errorButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
    fontSize: 14,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0070D6",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  uploadButtonDisabled: {
    backgroundColor: "#E2E8F0",
  },
  uploadButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: 8,
  },
  uploadButtonTextDisabled: {
    color: "#A0AEC0",
  },
  uploadedFilesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#F0F5FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1E0FF",
  },
  uploadedFilesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 8,
  },
  fileItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  fileDetails: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "nowrap",
  },
  fileName: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    flex: 1,
  },
  fileSize: {
    fontSize: 12,
    color: "#718096",
    marginLeft: 4,
  },
  fileActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewButton: {
    padding: 6,
    marginRight: 8,
  },
  categoryBadge: {
    backgroundColor: "#EBF8FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  categoryText: {
    fontSize: 11,
    color: "#2B6CB0",
    fontWeight: "500",
  },
  s3BadgeContainer: {
    backgroundColor: "#38A169",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  s3BadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  uploadInfoText: {
    fontSize: 12,
    color: "#718096",
    fontStyle: "italic",
    marginTop: 12,
    textAlign: "center",
  },
  // New View Files Button
  viewFilesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4C51BF", // Indigo color to differentiate from other buttons
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    alignSelf: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  viewFilesButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  clinicalParametersContainer: {
    backgroundColor: "#F0F5FF",
    borderRadius: 8,
    padding: 12,
    marginTop: 0,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#D1E0FF",
  },
  clinicalParametersTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  dateInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  dateInputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    width: 50,
  },
  datePickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  },
  datePickerText: {
    fontSize: 14,
    color: "#2D3748",
  },
  parametersScrollView: {
    marginBottom: 12,
  },
  parametersRow: {
    flexDirection: "row",
    paddingBottom: 8,
  },
  parameterInputContainer: {
    width: 120,
    marginRight: 12,
  },
  parameterLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 4,
  },
  parameterInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
  },
  otherParameterContainer: {
    marginBottom: 5,
  },
  otherParameterInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 100, // ensures it's visible for multiline
    textAlignVertical: "top", // aligns text properly inside multiline
  },

  // Styles for View Table button
  viewTableButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#38A169", // Green color
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  viewTableButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: 8,
  },
  // Styles for the View Files Modal
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
  modalCloseButton: {
    padding: 4,
  },
  modalFileList: {
    flex: 1,
  },
  modalFileDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  modalFileItem: {
    paddingVertical: 12,
  },
  modalFileDetails: {
    flexDirection: "row",
    marginBottom: 8,
  },
  modalFileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBF8FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  modalFileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  modalFileName: {
    fontSize: 16,
    fontWeight: "500",
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
    marginRight: 8,
  },
  modalFileDate: {
    fontSize: 12,
    color: "#718096",
    marginRight: 8,
  },
  modalCategoryBadge: {
    backgroundColor: "#E6FFFA",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  modalCategoryText: {
    fontSize: 12,
    color: "#319795",
    fontWeight: "500",
  },
  modalFileActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  modalActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#EBF8FF",
    marginLeft: 8,
  },
  modalRemoveButton: {
    backgroundColor: "#FEE2E2",
  },
  modalRemoveText: {
    fontSize: 12,
    color: "#E53935",
    fontWeight: "500",
    marginLeft: 4,
  },
  modalActionText: {
    fontSize: 12,
    color: "#0070D6",
    fontWeight: "500",
    marginLeft: 4,
  },
  modalEmptyContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  modalEmptyText: {
    fontSize: 16,
    color: "#718096",
    marginTop: 12,
  },
  modalCloseFullButton: {
    backgroundColor: "#EDF2F7",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  modalCloseFullButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
  },
  // Preview Modal Styles
  previewModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewModalContent: {
    width: "100%",
    height: "100%",
    padding: 16,
  },
  previewModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  previewModalTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
    flex: 1,
  },
  previewModalCloseButton: {
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
  previewModalFooter: {
    paddingVertical: 12,
    alignItems: "center",
  },
  previewModalCloseFullButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  previewModalCloseFullButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  // Modal styles for Add History modal
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 8,
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  modalCancelButton: {
    backgroundColor: "#EDF2F7",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    alignItems: "center",
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
  },
  modalSaveButton: {
    backgroundColor: "#38A169",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    alignItems: "center",
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  // New styles for formatted history display
  entryContainer: {
    marginBottom: 10,
  },
  entryTimestamp: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 4,
    backgroundColor: "#F7FAFC",
    padding: 4,
    borderRadius: 4,
  },
  entrySeparator: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
  },
  addHistoryLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 6,
  },
  updateNextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#38A169", // Green color
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  updateNextButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    marginRight: 8,
  },
  // Add status badge styles for file deletion feedback
  statusBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  statusText: {
    fontSize: 10,
    color: "#065F46",
    fontWeight: "500",
  },
  errorBadge: {
    backgroundColor: "#FEE2E2",
  },
  errorText: {
    color: "#991B1B",
  },
});

export default ClinicalTab;
