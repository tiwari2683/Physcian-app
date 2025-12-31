interface HistoryEntry {
  text: string;
  timestamp: string;
  isCurrent?: boolean;
}

interface ViewHistoryModalProps {
  isVisible: boolean;
  onClose: () => void;
  historyText: string | null | undefined;
  patientId: string;
}

import React, { useState, useEffect } from "react";
import { API_ENDPOINTS } from "../../Config";
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ViewHistoryModal: React.FC<ViewHistoryModalProps> = ({ isVisible, onClose, historyText, patientId }) => {
  // PERFORMANCE FIX: Early return if modal is not visible
  // This prevents unnecessary state initialization, logging, and effects
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("current");
  const [lastSavedText, setLastSavedText] = useState<string | null | undefined>(
    ""
  );

  // Log when component mounts - only in development
  useEffect(() => {
    if (__DEV__) {
      console.log("🔄 ViewHistoryModal mounted");
    }
    return () => {
      if (__DEV__) {
        console.log("🔄 ViewHistoryModal unmounted");
      }
    };
  }, []);

  // Log when visibility changes - only when actually visible
  useEffect(() => {
    if (isVisible && __DEV__) {
      console.log(`🔍 Modal visibility changed: ${isVisible}`);
    }
  }, [isVisible]);

  // Helper function to parse dates robustly
  const parseDate = (dateString: any) => {
    if (!dateString) return new Date(0);

    try {
      // First try direct date parsing
      const date = new Date(dateString);

      // Check if date is valid
      if (!isNaN(date.getTime())) {
        return date;
      }

      // If direct parsing failed, try parsing from locale string format
      // Handle formats like "4/21/2025, 10:30:45 AM"
      if (typeof dateString === "string") {
        const parts = dateString.split(/[/,:\s]/);
        if (parts.length >= 3) {
          const month = parseInt(parts[0]) - 1; // 0-based months
          const day = parseInt(parts[1]);
          const year = parseInt(parts[2]);

          if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
            return new Date(year, month, day);
          }
        }
      }

      // If all parsing failed, return epoch date
      return new Date(0);
    } catch (e) {
      console.log(`❌ Error parsing date string: ${dateString}`, e);
      return new Date(0);
    }
  };

  // Improved compare function for sorting by date
  const compareDates = (a: any, b: any) => {
    const dateA = parseDate(a.timestamp);
    const dateB = parseDate(b.timestamp);

    // Make sure both dates are valid
    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
      // If one date is invalid, the valid one comes first
      if (!isNaN(dateA.getTime())) return -1; // A is valid, comes first
      if (!isNaN(dateB.getTime())) return 1; // B is valid, comes first
      return 0; // Both invalid, maintain original order
    }

    // Both dates valid, newest first
    return dateB.getTime() - dateA.getTime();
  };

  // Function to format text with bullet points
  const formatTextWithBullets = (text: string | null | undefined) => {
    if (!text) return null;
    // Split text into lines
    const lines = text.split("\n");
    return lines.map((line: string, index: number) => {
      // Check if line starts with bullet or dash
      const hasBullet = line.match(/^\s*[-•*]\s/);
      if (hasBullet) {
        // Add styling for bullet points
        return (
          <Text key={index} style={styles.historyBulletItem}>
            {line}
          </Text>
        );
      } else {
        // Regular text styling
        return line.trim() ? (
          <Text key={index} style={styles.historyText}>
            {line}
          </Text>
        ) : (
          // Add spacing for empty lines
          <Text key={index} style={{ height: 10 }} />
        );
      }
    });
  };

  // Fetch history data when modal opens
  useEffect(() => {
    if (isVisible && patientId) {
      console.log("🔄 Modal is visible with patient ID, fetching history data");
      fetchHistoryData();
    }
  }, [isVisible, patientId]);

  // We'll use a separate effect to handle changes in historyText
  // This will be triggered when the patient data changes
  useEffect(() => {
    if (patientId && historyText && isVisible) {
      console.log("🔍 Checking if history text changed:");
      console.log(`Current text: ${historyText.substring(0, 30)}...`);
      console.log(
        `Last saved: ${lastSavedText ? lastSavedText.substring(0, 30) + "..." : "none"
        }`
      );

      // First check if the text is actually different from what we last saved
      // This prevents duplicate entries when the modal is opened multiple times with the same text
      if (historyText !== lastSavedText) {
        console.log("✅ History text changed, saving to history");
        saveCurrentToHistory(historyText);
        setLastSavedText(historyText);
      } else {
        console.log("⏭️ Text hasn't changed, skipping save");
      }
    }
  }, [patientId, historyText, isVisible]);

  // Log whenever historyEntries state changes
  useEffect(() => {
    console.log(`📊 History entries updated: ${historyEntries.length} entries`);
    if (historyEntries.length > 0) {
      console.log(
        "📝 First entry:",
        historyEntries[0].text.substring(0, 30) + "..."
      );
    }
  }, [historyEntries]);

  // Function to fetch history data from API or AsyncStorage
  const fetchHistoryData = async () => {
    if (!patientId) {
      console.log("❌ Cannot fetch history: No patient ID");
      return;
    }

    console.log(`🔄 Fetching history data for patient: ${patientId}`);
    setLoading(true);
    try {
      // Try to fetch from API first (if connected)
      let apiData = null;
      try {
        console.log("🌐 Attempting to fetch history from API...");
        const apiUrl =
          API_ENDPOINTS.PATIENT_PROCESSOR;
        const requestBody = {
          action: "getMedicalHistory",
          patientId: patientId,
        };

        console.log("📤 API request:", JSON.stringify(requestBody));
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const result = await response.json();
        console.log(
          "📥 API response:",
          JSON.stringify(result).substring(0, 200) + "..."
        );

        if (
          result.success &&
          result.medicalHistory &&
          result.medicalHistory.length > 0
        ) {
          console.log(
            `✅ Fetched ${result.medicalHistory.length} history entries from API`
          );
          apiData = result.medicalHistory.map((entry: any) => ({
            text: entry.text,
            timestamp: entry.recordDate || entry.timestamp,
          }));
          console.log(
            "📝 API data sample:",
            apiData[0].text.substring(0, 30) + "..."
          );
        } else {
          console.log(
            "⚠️ No medical history found in API response or fetch failed"
          );
        }
      } catch (apiError) {
        console.log("❌ Error fetching from API:", apiError);
        console.log("⚠️ Will use local storage as fallback");
      }

      // Storage key for medical history
      const storageKey = `medical_history_${patientId}`;
      console.log(`🔍 Looking for local storage with key: ${storageKey}`);

      // Retrieve history from AsyncStorage as backup
      const storedData = await AsyncStorage.getItem(storageKey);
      let storageEntries = [];

      if (storedData) {
        storageEntries = JSON.parse(storedData);
        console.log(
          `✅ Found ${storageEntries.length} history entries in local storage`
        );
        if (storageEntries.length > 0) {
          console.log(
            "📝 Storage data sample:",
            storageEntries[0].text.substring(0, 30) + "..."
          );
        }
      } else {
        console.log("⚠️ No data found in local storage");
      }

      // Combine API and storage data, removing duplicates
      console.log("🔄 Combining data sources...");
      let combinedEntries: HistoryEntry[] = [];

      if (apiData && apiData.length > 0) {
        combinedEntries = [...apiData];
        console.log(`📊 Starting with ${combinedEntries.length} API entries`);

        // Add any storage entries that aren't in the API data
        if (storageEntries.length > 0) {
          let addedCount = 0;
          storageEntries.forEach((storageEntry: any) => {
            // Check if this entry already exists in the combined list
            const isDuplicate = combinedEntries.some(
              (entry: any) => entry.text === storageEntry.text
            );

            if (!isDuplicate) {
              combinedEntries.push(storageEntry);
              addedCount++;
            }
          });
          console.log(
            `📊 Added ${addedCount} unique entries from local storage`
          );
        }
      } else {
        // Use local storage data if no API data
        combinedEntries = storageEntries;
        console.log(
          `📊 Using ${combinedEntries.length} entries from local storage only`
        );
      }

      // Add current entry if it's not already in the list
      if (historyText && historyText.trim() !== "") {
        console.log("🔍 Checking if current text is already in history...");
        const currentExists = combinedEntries.some(
          (entry: any) => entry.text === historyText
        );

        if (!currentExists) {
          console.log("✅ Adding current text to history entries");
          combinedEntries.push({
            text: historyText,
            timestamp: new Date().toISOString(),
            isCurrent: true,
          });
        } else {
          console.log("⏭️ Current text already exists in history, skipping");
        }
      }

      // Sort by timestamp descending (newest first)
      console.log("🔄 Sorting entries by timestamp");
      const sortedData = combinedEntries.sort(compareDates);

      // Log sorting results
      if (sortedData.length > 0) {
        console.log(`📊 First entry timestamp: ${sortedData[0].timestamp}`);
        if (sortedData.length > 1) {
          console.log(`📊 Second entry timestamp: ${sortedData[1].timestamp}`);
        }
      }

      // Update state with sorted entries
      console.log(`📊 Setting ${sortedData.length} history entries to state`);
      setHistoryEntries(sortedData);

      // Update local storage with combined data
      console.log("💾 Saving combined entries back to local storage");
      await AsyncStorage.setItem(storageKey, JSON.stringify(combinedEntries));

      // Update our tracking of the last saved text
      console.log("🔄 Updating lastSavedText reference");
      setLastSavedText(historyText);
    } catch (error) {
      console.error("❌ Error fetching history data:", error);
    } finally {
      setLoading(false);
      console.log("✅ Fetch history operation completed");
    }
  };

  // Function to save current text to history
  const saveCurrentToHistory = async (textToSave: string) => {
    if (!patientId || !textToSave) {
      console.log("❌ Cannot save history: Missing patient ID or text");
      return;
    }

    console.log(`🔄 Saving history entry for patient: ${patientId}`);
    console.log(`📝 Text to save: ${textToSave.substring(0, 30)}...`);

    try {
      const storageKey = `medical_history_${patientId}`;

      // Get existing history
      console.log(`🔍 Retrieving existing history from key: ${storageKey}`);
      let historyArray = [];
      const storedData = await AsyncStorage.getItem(storageKey);

      if (storedData) {
        historyArray = JSON.parse(storedData);
        console.log(`✅ Found ${historyArray.length} existing history entries`);
      } else {
        console.log("⚠️ No existing history found, starting new array");
      }

      // Check if this exact text already exists in history
      console.log("🔍 Checking if text already exists in history...");
      const textExists = historyArray.some(
        (entry: any) => entry.text === textToSave
      );

      if (!textExists) {
        console.log("✅ Text is new, adding to history");
        // Add current entry with timestamp
        const timestamp = new Date().toISOString();
        console.log(`🕒 Using timestamp: ${timestamp}`);

        const newEntry = {
          text: textToSave,
          timestamp: timestamp,
        };

        historyArray.push(newEntry);
        console.log(`📊 History now has ${historyArray.length} entries`);

        // Sort by timestamp descending (newest first)
        console.log("🔄 Sorting history by timestamp");
        historyArray.sort(compareDates);

        // Only keep the last 20 entries to avoid storage issues (increased from 10)
        if (historyArray.length > 20) {
          console.log(
            `⚠️ Trimming history from ${historyArray.length} to 20 entries`
          );
          historyArray = historyArray.slice(0, 20);
        }

        // Save back to AsyncStorage
        console.log("💾 Saving history to AsyncStorage");
        await AsyncStorage.setItem(storageKey, JSON.stringify(historyArray));

        // Also update our state
        console.log("🔄 Updating historyEntries state");
        setHistoryEntries(historyArray);
        console.log(
          `✅ Added new history entry: ${textToSave.substring(0, 20)}...`
        );

        // Try to save to API as well
        try {
          console.log("🌐 Attempting to save history to API");
          const apiUrl =
            API_ENDPOINTS.PATIENT_PROCESSOR;
          const requestBody = {
            action: "updatePatientData",
            updateMode: true,
            patientId: patientId,
            updateSection: "clinical",
            medicalHistory: textToSave,
            createMedicalHistoryEntry: true,
          };

          console.log(
            "📤 API request:",
            JSON.stringify(requestBody).substring(0, 200) + "..."
          );
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          const result = await response.json();
          console.log(
            "📥 API response:",
            JSON.stringify(result).substring(0, 200) + "..."
          );
          console.log("✅ Successfully saved history to API");
        } catch (apiError) {
          console.log("❌ Error saving to API:", apiError);
          console.log("⚠️ History saved to local storage only");
        }
      } else {
        console.log("⏭️ Text already exists in history, skipping save");
      }
    } catch (error) {
      console.error("❌ Error saving history:", error);
    }
  };

  // Format date for display - showing only the date without "New Entry" text
  const formatDate = (dateString: any) => {
    try {
      // If the date string contains "New Entry" pattern, extract just the date part
      if (typeof dateString === "string" && dateString.includes("New Entry")) {
        // Extract just the date portion inside parentheses
        const matches = dateString.match(/\(([^)]+)\)/);
        if (matches && matches[1]) {
          dateString = matches[1];
        }
      }

      const date = parseDate(dateString);
      // Check if date is valid before formatting
      if (isNaN(date.getTime())) {
        return "Unknown date";
      }

      // Return just the date without any prefixes
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch (e) {
      console.log(`❌ Error formatting date: ${dateString}`, e);
      return "Date format error";
    }
  };

  // Format history display to remove "New Entry" text and show newest on top
  const formatHistoryDisplay = (text: string | null | undefined) => {
    if (!text) return null;

    // Check if text contains entry markers
    const entryMarker = /---\s*(?:New\s*)?Entry\s*\(([^)]+)\)\s*---/;
    if (!text.match(entryMarker)) {
      return formatTextWithBullets(text);
    }

    // Find all entries with timestamps
    const entriesWithDates = [];
    const markerRegex = /---\s*(?:New\s*)?Entry\s*\(([^)]+)\)\s*---/g;
    let match;
    let lastIndex = 0;
    let prevTimestamp = null;

    while ((match = markerRegex.exec(text)) !== null) {
      const markerText = match[0];
      const timestamp = match[1]; // Extract just the date portion from parentheses
      const startPos = match.index + markerText.length;

      // If this isn't the first match, extract the text for the previous entry
      if (lastIndex > 0) {
        const entryText = text.substring(lastIndex, match.index).trim();
        if (entryText && prevTimestamp) {
          entriesWithDates.push({ text: entryText, timestamp: prevTimestamp });
        }
      }

      lastIndex = startPos;
      prevTimestamp = timestamp;
    }

    // Add the last entry
    if (lastIndex < text.length) {
      const entryText = text.substring(lastIndex).trim();
      if (entryText && prevTimestamp) {
        entriesWithDates.push({ text: entryText, timestamp: prevTimestamp });
      }
    }

    // Sort entries by timestamp (newest first)
    entriesWithDates.sort((a, b) => {
      const dateA = parseDate(a.timestamp);
      const dateB = parseDate(b.timestamp);
      return dateB.getTime() - dateA.getTime();
    });

    return entriesWithDates.map((entry: any, index: number) => (
      <View key={index} style={styles.entryContainer}>
        <Text style={styles.entryTimestamp}>{entry.timestamp}</Text>
        {formatTextWithBullets(entry.text)}
        {index < entriesWithDates.length - 1 && (
          <View style={styles.entrySeparator} />
        )}
      </View>
    ));
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
            <Text style={styles.modalTitle}>
              History / Complaints / Symptoms
            </Text>
            <TouchableOpacity
              onPress={() => {
                console.log("🔄 Close button pressed");
                onClose();
              }}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={styles.closeIcon}
            >
              <Ionicons name="close-circle" size={28} color="#4A5568" />
            </TouchableOpacity>
          </View>

          {/* Tab navigation */}
          {/* <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "current" && styles.activeTab]}
              onPress={() => {
                console.log("🔄 Switching to Current tab");
                setActiveTab("current");
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "current" && styles.activeTabText,
                ]}
              >
                Current
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "history" && styles.activeTab]}
              onPress={() => {
                console.log("🔄 Switching to History tab");
                setActiveTab("history");
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "history" && styles.activeTabText,
                ]}
              >
                History
              </Text>
            </TouchableOpacity>
          </View> */}

          {/* Content area */}

          <ScrollView style={styles.modalBody}>
            {formatHistoryDisplay(historyText)}
          </ScrollView>


          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                console.log("🔄 Footer close button pressed");
                onClose();
              }}
            >
              <Text style={styles.closeButtonText}>Close</Text>
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxHeight: "80%",
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
    flex: 1,
  },
  closeIcon: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    marginTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#0070D6",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#718096",
  },
  activeTabText: {
    color: "#0070D6",
  },
  modalBody: {
    marginVertical: 16,
    maxHeight: "70%",
    paddingHorizontal: 4,
  },
  historyText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4A5568",
    paddingBottom: 8,
  },
  historyBulletItem: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4A5568",
    marginLeft: 4,
    paddingBottom: 8,
    fontWeight: "400",
  },
  historyEntryContainer: {
    marginBottom: 16,
  },
  historyEntryHeader: {
    backgroundColor: "#F7FAFC",
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  historyEntryDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A5568",
  },
  historyEntryContent: {
    paddingHorizontal: 4,
  },
  entryDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
  },
  buttonContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  closeButton: {
    backgroundColor: "#0070D6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: "#4A5568",
    fontSize: 16,
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyStateText: {
    marginTop: 16,
    color: "#718096",
    fontSize: 16,
    textAlign: "center",
  },
  // Additional styles for direct history formatting
  entryContainer: {
    marginBottom: 12,
    paddingBottom: 8,
  },
  entryTimestamp: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A5568",
    backgroundColor: "#F7FAFC",
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  entrySeparator: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
  },
});

export default ViewHistoryModal;
