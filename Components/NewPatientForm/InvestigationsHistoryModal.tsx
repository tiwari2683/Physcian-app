import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

interface InvestigationHistoryItem {
  advisedInvestigations: string;
  date: string;
  formattedDate?: string;
  formattedTime?: string;
  doctor?: string;
  source?: string; // Identify if item is from a previous session
  isCurrent?: boolean; // Flag to identify current items
}

interface InvestigationsHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  currentInvestigations: string;
  investigationsHistory: InvestigationHistoryItem[];
  isLoading: boolean;
  patientName?: string;
  newItemTimestamp?: string | null; // Prop for highlighting the latest added item
}

const { height, width } = Dimensions.get("window");

// Enhanced logging helper with cleaner formatting
const logModalDebug = (message: string, data: any = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] 🔍 [MODAL] ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] 🔍 [MODAL] ${message}`);
  }
};

// Helper function to group investigations by date (YYYY-MM-DD) and source
const groupInvestigationsByDate = (
  investigationsHistory: InvestigationHistoryItem[]
) => {
  logModalDebug("Starting groupInvestigationsByDate with items:", {
    count: investigationsHistory?.length || 0,
  });

  const groupedInvestigations: {
    [key: string]: {
      displayDate: string;
      source?: string; // Source field to identify current vs previous
      items: InvestigationHistoryItem[];
    };
  } = {};

  if (!investigationsHistory || investigationsHistory.length === 0) {
    logModalDebug("No investigations history to group");
    return [];
  }

  // Sort history by date (newest first)
  const sortedHistory = [...investigationsHistory].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  logModalDebug(`Sorted ${sortedHistory.length} history items by date`);

  // Group by date in YYYY-MM-DD format for more granular grouping
  sortedHistory.forEach((item, index) => {
    try {
      const date = new Date(item.date);

      // Format as "YYYY-MM-DD" for precise grouping
      // Add source info to create distinct groups for current vs previous
      const sourceKey = item.source || "previous";
      const yearMonthDay = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(
        2,
        "0"
      )}-${sourceKey}`;

      logModalDebug(
        `Processing item ${index}, date key: ${yearMonthDay}, source: ${sourceKey}` +
          `, content: ${item.advisedInvestigations?.substring(0, 30)}...`
      );

      // Create group if it doesn't exist
      if (!groupedInvestigations[yearMonthDay]) {
        groupedInvestigations[yearMonthDay] = {
          // Format a nice heading like "April 10, 2025"
          displayDate: date.toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          source: item.source,
          items: [],
        };
        logModalDebug(
          `Created new group for: ${groupedInvestigations[yearMonthDay].displayDate} with source ${sourceKey}`
        );
      }

      // Add the investigation to this group
      groupedInvestigations[yearMonthDay].items.push(item);
    } catch (error) {
      console.error(`Error processing date ${item.date}:`, error);
      // If date is invalid, put in "Unknown Date" group
      if (!groupedInvestigations["unknown"]) {
        groupedInvestigations["unknown"] = {
          displayDate: "Unknown Date",
          items: [],
        };
      }
      groupedInvestigations["unknown"].items.push(item);
    }
  });

  // Convert map to array for easier rendering
  const result = Object.values(groupedInvestigations);
  logModalDebug(`Created ${result.length} date groups for rendering`);
  return result;
};

// Function to format a bulleted list for better display
const formatBulletedText = (text: string) => {
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Remove bullet points or dashes from the beginning if they exist
      return line.replace(/^[-•*]\s+/, "");
    });
};

const InvestigationsHistoryModal: React.FC<InvestigationsHistoryModalProps> = ({
  visible,
  onClose,
  currentInvestigations,
  investigationsHistory,
  isLoading,
  patientName = "Patient",
  newItemTimestamp = null, // Accept prop for highlighting
}) => {
  // Animation value for modal slide-up
  const [slideAnim] = useState(new Animated.Value(height));
  // State to track if modal is actually visible (for fade effect)
  const [isModalVisible, setIsModalVisible] = useState(false);
  // State to track newly added items for highlighting (internal state as fallback)
  const [internalNewItemTimestamp, setInternalNewItemTimestamp] = useState<
    string | null
  >(null);

  // Use the prop if provided, otherwise use internal state
  const effectiveNewItemTimestamp =
    newItemTimestamp || internalNewItemTimestamp;

  // Log data when modal becomes visible
  useEffect(() => {
    if (visible) {
      logModalDebug("Modal opened with data:", {
        hasCurrentInvestigations: !!currentInvestigations,
        currentLength: currentInvestigations?.length || 0,
        historyCount: investigationsHistory?.length || 0,
        newItemTimestamp: effectiveNewItemTimestamp,
      });
    }
  }, [
    visible,
    currentInvestigations,
    investigationsHistory,
    effectiveNewItemTimestamp,
  ]);

  // Get today's date and time formatted as strings
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Create a synthetic current investigations item if we have current investigations
  const currentInvestigationsItem = useMemo(() => {
    if (!currentInvestigations) {
      logModalDebug("No current investigations to display");
      return null;
    }

    const currentItem = {
      advisedInvestigations: currentInvestigations,
      date: new Date().toISOString(),
      formattedDate: today,
      formattedTime: currentTime,
      doctor: "Dr. Dipak Gawli", // Default doctor name
      source: "current", // Add source identifier for current items
      isCurrent: true, // Flag to identify as current
    };

    logModalDebug("Created current investigations item:", {
      date: currentItem.formattedDate,
      time: currentItem.formattedTime,
      contentLength: currentInvestigations.length,
      content: currentInvestigations.substring(0, 50) + "...",
    });

    return currentItem;
  }, [currentInvestigations, today, currentTime]);

  // Format the current investigations for display
  const formattedCurrentInvestigations = useMemo(
    () => formatBulletedText(currentInvestigations),
    [currentInvestigations]
  );

  // Add source field to history items if not present
  const enhancedInvestigationsHistory = useMemo(() => {
    // Make a deep copy to avoid potential mutation issues
    const enhanced = investigationsHistory.map((item) => ({
      ...item,
      source: item.source || "previous", // Mark as previous if source not specified
      // Ensure formatted date and time are set
      formattedDate:
        item.formattedDate ||
        (item.date
          ? new Date(item.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Unknown Date"),
      formattedTime:
        item.formattedTime ||
        (item.date
          ? new Date(item.date).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : ""),
    }));

    logModalDebug(
      `Enhanced ${enhanced.length} history items with source field`,
      {
        firstItem:
          enhanced.length > 0
            ? {
                source: enhanced[0]?.source,
                date: enhanced[0]?.formattedDate,
                content:
                  enhanced[0]?.advisedInvestigations?.substring(0, 30) + "...",
              }
            : "none",
      }
    );
    return enhanced;
  }, [investigationsHistory]);

  // Group investigations by date, including current if it exists
  const groupedInvestigations = useMemo(() => {
    // Make a copy of history to work with
    let combinedHistory = [...enhancedInvestigationsHistory];

    // If we have current investigations, add them to beginning of history for grouping
    if (currentInvestigationsItem && currentInvestigations) {
      combinedHistory = [currentInvestigationsItem, ...combinedHistory];
      logModalDebug("Added current investigations to history for grouping", {
        currentItem: {
          date: currentInvestigationsItem.formattedDate,
          content: currentInvestigations.substring(0, 30) + "...",
        },
        totalCount: combinedHistory.length,
      });
    }

    const grouped = groupInvestigationsByDate(combinedHistory);
    logModalDebug(`Final grouping: ${grouped.length} date groups`);

    // Log each group for debugging
    grouped.forEach((group, index) => {
      logModalDebug(
        `Group ${index + 1}: ${group.displayDate}, ${
          group.items.length
        } items, source: ${group.source || "none"}`
      );
    });

    return grouped;
  }, [
    enhancedInvestigationsHistory,
    currentInvestigationsItem,
    currentInvestigations,
  ]);

  // Effect to detect and mark new items when history changes
  useEffect(() => {
    if (investigationsHistory.length > 0 && !newItemTimestamp) {
      // Find the most recent item and use its timestamp for highlighting
      const mostRecent = [...investigationsHistory].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];

      if (mostRecent) {
        logModalDebug("Auto-detected new item to highlight:", {
          date: mostRecent.date,
          formattedDate: mostRecent.formattedDate,
          content: mostRecent.advisedInvestigations?.substring(0, 30) + "...",
        });

        setInternalNewItemTimestamp(mostRecent.date);

        // Clear the highlight after 5 seconds
        const timer = setTimeout(() => {
          setInternalNewItemTimestamp(null);
        }, 5000);

        return () => clearTimeout(timer);
      }
    }
  }, [investigationsHistory, newItemTimestamp]);

  // Handle animation when visibility changes
  useEffect(() => {
    if (visible) {
      setIsModalVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIsModalVisible(false);
      });
    }
  }, [visible, slideAnim]);

  // Helper to check if an item is newly added
  const isNewlyAdded = (date: string) => {
    if (!effectiveNewItemTimestamp) return false;

    const isNew = date === effectiveNewItemTimestamp;
    if (isNew) {
      logModalDebug(`Item with date ${date} identified as newly added`);
    }

    return isNew;
  };

  if (!isModalVisible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackground}>
        <BlurView
          intensity={Platform.OS === "ios" ? 40 : 20}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            styles.modalContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <SafeAreaView style={styles.safeAreaContainer}>
            {/* Header with title and close button */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <Text style={styles.modalTitle}>Investigations History</Text>
                <Text style={styles.patientName}>{patientName}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#4A5568" />
              </TouchableOpacity>
            </View>

            <View style={styles.headerDivider} />

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0070D6" />
                <Text style={styles.loadingText}>
                  Loading investigations history...
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContentContainer}
              >
                {/* Display empty state if no investigations */}
                {groupedInvestigations.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons
                      name="document-text-outline"
                      size={50}
                      color="#CBD5E0"
                    />
                    <Text style={styles.emptyHistoryText}>
                      No investigation history found
                    </Text>
                    <Text style={styles.emptyHistorySubtext}>
                      Previous advised investigations will appear here after you
                      select investigations and click "Update Report".
                    </Text>
                  </View>
                ) : (
                  // Display current and previous investigations
                  <>
                    {/* Current Investigations Section */}
                    {currentInvestigationsItem && currentInvestigations && (
                      <View style={styles.sectionContainer}>
                        <View style={styles.sectionHeader}>
                          <View style={styles.sectionHeaderLeft}>
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#38A169"
                            />
                            <Text style={styles.sectionHeaderText}>
                              Current Investigations
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.historyItem,
                            styles.currentHistoryItem,
                          ]}
                        >
                          <View style={styles.historyItemHeader}>
                            <View style={styles.historyItemHeaderLeft}>
                              <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>
                                  Current
                                </Text>
                              </View>
                            </View>
                            <View style={styles.historyItemDate}>
                              <Text style={styles.historyDateText}>
                                {today}
                              </Text>
                              <Text style={styles.historyTimeText}>
                                • {currentTime}
                              </Text>
                            </View>
                            <Text style={styles.doctorName}>
                              {currentInvestigationsItem.doctor}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.historyItemContent,
                              styles.currentHistoryItemContent,
                            ]}
                          >
                            {formattedCurrentInvestigations.length > 0 ? (
                              formattedCurrentInvestigations.map(
                                (investigation, i) => (
                                  <View
                                    key={`current-investigation-${i}`}
                                    style={styles.investigationItem}
                                  >
                                    <View
                                      style={[
                                        styles.bulletPoint,
                                        styles.currentBulletPoint,
                                      ]}
                                    />
                                    <Text style={styles.investigationText}>
                                      {investigation}
                                    </Text>
                                  </View>
                                )
                              )
                            ) : (
                              <Text style={styles.emptyInvestigationText}>
                                No details available
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Previous Investigations Section */}
                    {enhancedInvestigationsHistory.length > 0 && (
                      <View style={styles.sectionContainer}>
                        <View style={styles.sectionHeader}>
                          <View style={styles.sectionHeaderLeft}>
                            <Ionicons
                              name="time-outline"
                              size={18}
                              color="#3182CE"
                            />
                            <Text style={styles.sectionHeaderText}>
                              Previous Investigations
                            </Text>
                          </View>
                        </View>

                        {/* Show grouped previous investigations */}
                        {groupedInvestigations
                          .filter((group) => group.source !== "current")
                          .map((group, groupIndex) => (
                            <View
                              key={`prev-group-${groupIndex}`}
                              style={styles.historyGroup}
                            >
                              {/* Date group header */}
                              <View style={styles.monthHeader}>
                                <Ionicons
                                  name="calendar-outline"
                                  size={16}
                                  color="#3182CE"
                                />
                                <Text style={styles.monthHeaderText}>
                                  {group.displayDate}
                                </Text>
                              </View>

                              {/* Investigations in this group */}
                              {group.items.map((item, itemIndex) => {
                                const formattedItems = formatBulletedText(
                                  item.advisedInvestigations
                                );

                                // Check if this is a newly added item
                                const isNew = isNewlyAdded(item.date);

                                return (
                                  <View
                                    key={`prev-investigation-${groupIndex}-${itemIndex}`}
                                    style={[
                                      styles.historyItem,
                                      isNew && styles.newHistoryItem,
                                    ]}
                                  >
                                    <View style={styles.historyItemHeader}>
                                      <View
                                        style={styles.historyItemHeaderLeft}
                                      >
                                        {/* Show a "New" badge for recently added history item */}
                                        {isNew && (
                                          <View style={styles.newBadge}>
                                            <Text style={styles.newBadgeText}>
                                              New
                                            </Text>
                                          </View>
                                        )}
                                      </View>

                                      <View style={styles.historyItemDate}>
                                        <Text style={styles.historyDateText}>
                                          {item.formattedDate || "Unknown Date"}
                                        </Text>
                                        {item.formattedTime && (
                                          <Text style={styles.historyTimeText}>
                                            • {item.formattedTime}
                                          </Text>
                                        )}
                                      </View>
                                      {item.doctor && (
                                        <Text style={styles.doctorName}>
                                          {item.doctor}
                                        </Text>
                                      )}
                                    </View>
                                    <View
                                      style={[
                                        styles.historyItemContent,
                                        isNew && styles.newHistoryItemContent,
                                      ]}
                                    >
                                      {formattedItems.length > 0 ? (
                                        formattedItems.map(
                                          (investigation, i) => (
                                            <View
                                              key={`prev-item-${itemIndex}-${i}`}
                                              style={styles.investigationItem}
                                            >
                                              <View
                                                style={[
                                                  styles.bulletPoint,
                                                  isNew &&
                                                    styles.newBulletPoint,
                                                ]}
                                              />
                                              <Text
                                                style={styles.investigationText}
                                              >
                                                {investigation}
                                              </Text>
                                            </View>
                                          )
                                        )
                                      ) : (
                                        <Text
                                          style={styles.emptyInvestigationText}
                                        >
                                          No details available
                                        </Text>
                                      )}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          ))}
                      </View>
                    )}
                  </>
                )}

                {/* Bottom spacing for better scrolling */}
                <View style={styles.bottomSpacer} />
              </ScrollView>
            )}

            {/* Close button at bottom */}
            <TouchableOpacity
              style={styles.closeButtonBottom}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)", // Slightly darker for better contrast
    justifyContent: "flex-end",
  },
  safeAreaContainer: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "90%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25, // Increased shadow opacity
        shadowRadius: 10, // Increased shadow blur
      },
      android: { elevation: 10 }, // Increased elevation
    }),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12, // Increased bottom padding
  },
  headerLeft: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 22, // Slightly larger title
    fontWeight: "700",
    color: "#2D3748",
    letterSpacing: -0.5, // Tighter letter spacing for headings
  },
  patientName: {
    fontSize: 14,
    color: "#718096",
    marginTop: 4,
  },
  closeButton: {
    padding: 10, // Increased touch target
    borderRadius: 20,
    backgroundColor: "#F7FAFC",
  },
  headerDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 16, // Slightly reduced horizontal margins
    marginBottom: 12, // Increased bottom margin
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16, // Reduced from 20 to 16
  },
  scrollContentContainer: {
    paddingBottom: 16, // Add padding at the bottom of scroll content
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#718096",
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginLeft: 8,
  },
  historyGroup: {
    marginBottom: 24,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EBF8FF",
    borderRadius: 10, // Increased from 8 to 10
    paddingVertical: 10, // Increased from 8 to 10
    paddingHorizontal: 14, // Increased from 12 to 14
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#3182CE",
  },
  monthHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C5282",
    marginLeft: 8,
  },
  historyItem: {
    backgroundColor: "#F7FAFC",
    borderRadius: 12,
    marginBottom: 16, // Increased from 12 to 16
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  currentHistoryItem: {
    borderColor: "#38A169", // Green border for current item
    borderWidth: 2,
    backgroundColor: "#F0FFF4", // Light green background
    ...Platform.select({
      ios: {
        shadowColor: "#38A169",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  newHistoryItem: {
    borderColor: "#3182CE", // Blue border for new item
    borderWidth: 2,
    backgroundColor: "#EBF8FF", // Light blue background
    ...Platform.select({
      ios: {
        shadowColor: "#3182CE",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  historyItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14, // Increased from 12 to 14
    backgroundColor: "#EDF2F7",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  historyItemHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    width: "30%", // Fixed width to prevent overlap
  },
  historyItemDate: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "40%", // Fixed width for date/time
  },
  historyDateText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    textAlign: "center",
  },
  historyTimeText: {
    fontSize: 13,
    color: "#718096",
    marginLeft: 6,
    textAlign: "center",
  },
  doctorName: {
    fontSize: 12,
    color: "#4A5568",
    fontStyle: "italic",
    textAlign: "right",
    width: "30%", // Fixed width for doctor name
  },
  historyItemContent: {
    padding: 16, // Increased from 12 to 16
  },
  currentHistoryItemContent: {
    backgroundColor: "#F0FFF4", // Light green background
  },
  newHistoryItemContent: {
    backgroundColor: "#EBF8FF", // Light blue background
  },
  investigationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10, // Increased from 8 to 10
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4A5568", // Regular bullet point color
    marginTop: 8, // Align with first line of text
    marginRight: 10, // Increased spacing between bullet and text
  },
  currentBulletPoint: {
    backgroundColor: "#38A169", // Green bullet point for current investigation
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  newBulletPoint: {
    backgroundColor: "#3182CE", // Blue bullet point for new investigation
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  investigationText: {
    fontSize: 15,
    lineHeight: 22, // Increased line height for better readability
    color: "#2D3748",
    flex: 1,
    letterSpacing: 0.1, // Slight letter spacing for better readability
  },
  currentBadge: {
    backgroundColor: "#38A169",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 8,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  newBadge: {
    backgroundColor: "#3182CE", // Blue color for new items
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 8,
  },
  newBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyInvestigationText: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#A0AEC0",
    textAlign: "center",
    padding: 12, // Increased from 8 to 12
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 40, // Added spacing from top
  },
  emptyHistoryText: {
    fontSize: 18, // Increased from 16 to 18
    fontWeight: "500",
    color: "#718096",
    textAlign: "center",
    marginTop: 20, // Increased from 16 to 20
  },
  emptyHistorySubtext: {
    fontSize: 15, // Increased from 14 to 15
    color: "#A0AEC0",
    textAlign: "center",
    marginTop: 12, // Increased from 8 to 12
    paddingHorizontal: 20,
    lineHeight: 22, // Added line height
  },
  closeButtonBottom: {
    backgroundColor: "#0070D6",
    borderRadius: 14, // Increased from 12 to 14
    padding: 16,
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  bottomSpacer: {
    height: 60, // Increased from 40 to 60
  },
});

export default InvestigationsHistoryModal;
