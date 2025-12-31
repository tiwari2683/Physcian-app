import React, { useState, useRef, useEffect } from "react";
import { API_ENDPOINTS } from "../../Config";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";

// Import the separate modal component
import InvestigationsHistoryModal from "./InvestigationsHistoryModal";

// Helper function to format log timestamp
const getLogTimestamp = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now
      .getMilliseconds()
      .toString()
      .padStart(3, "0")}`;
};

// Enhanced console log function
const log = (message, data = null) => {
  const timestamp = getLogTimestamp();
  if (data) {
    console.log(`[${timestamp}] 🔍 ${message}`, data);
  } else {
    console.log(`[${timestamp}] 🔍 ${message}`);
  }
};

// Different log types for better visual identification
const logInfo = (message, data = null) => {
  const timestamp = getLogTimestamp();
  if (data) {
    console.log(`[${timestamp}] ℹ️ ${message}`, data);
  } else {
    console.log(`[${timestamp}] ℹ️ ${message}`);
  }
};

const logSuccess = (message, data = null) => {
  const timestamp = getLogTimestamp();
  if (data) {
    console.log(`[${timestamp}] ✅ ${message}`, data);
  } else {
    console.log(`[${timestamp}] ✅ ${message}`);
  }
};

const logWarning = (message, data = null) => {
  const timestamp = getLogTimestamp();
  if (data) {
    console.log(`[${timestamp}] ⚠️ ${message}`, data);
  } else {
    console.log(`[${timestamp}] ⚠️ ${message}`);
  }
};

const logError = (message, data = null) => {
  const timestamp = getLogTimestamp();
  if (data) {
    console.error(`[${timestamp}] ❌ ${message}`, data);
  } else {
    console.error(`[${timestamp}] ❌ ${message}`);
  }
};

// New Collapsible Section Component
const CollapsibleSection = ({
  title,
  children,
  isExpanded,
  onToggle,
  icon,
}) => {
  const animatedHeight = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  return (
    <View style={styles.collapsibleContainer}>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.collapsibleTitleContainer}>
          {icon && (
            <Ionicons
              name={icon}
              size={20}
              color="#0070D6"
              style={styles.collapsibleHeaderIcon}
            />
          )}
          <Text
            style={styles.collapsibleTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </View>
        <View style={styles.chevronContainer}>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={22}
            color="#4A5568"
          />
        </View>
      </TouchableOpacity>
      <Animated.View
        style={[
          styles.collapsibleContent,
          {
            maxHeight: animatedHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 2000],
            }),
            opacity: animatedHeight,
            overflow: "hidden",
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

interface DiagnosisTabProps {
  patientData: {
    diagnosis: string;
    advisedInvestigations: string;
    name?: string; // For patient name in modal
    [key: string]: any; // Allow other fields
  };
  updateField: (field: string, value: string) => void;
  // Add new props for accessing patient ID
  patientId?: string;
  tempPatientId?: string;
  prefillMode?: boolean;
  // Add prop to detect navigation from dashboard
  navigation?: any;
  route?: any;
  // Add prop to detect save event
  onSaveComplete?: () => void;
}

interface DiagnosisHistoryItem {
  diagnosis: string;
  date: string;
  formattedDate?: string;
  formattedTime?: string; // Added for time display
}

interface InvestigationHistoryItem {
  advisedInvestigations: string;
  date: string;
  formattedDate?: string;
  formattedTime?: string;
  doctor?: string;
  source?: string; // Add a source field to identify if item is from a previous session
  entryId?: string; // Add field for unique identification
  timestamp?: number; // Add timestamp field
}

// Helper function to group diagnoses by date
const groupDiagnosesByDate = (diagnosisHistory) => {
  // Create a map to store diagnoses by date (YYYY-MM)
  const groupedDiagnoses = {};

  if (!diagnosisHistory || diagnosisHistory.length === 0) {
    // Silent return to avoid log noise
    return [];
  }

  logInfo(`Grouping ${diagnosisHistory.length} diagnosis history items`);

  // Sort history by date (newest first)
  const sortedHistory = [...diagnosisHistory].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Group by month and year
  sortedHistory.forEach((item) => {
    try {
      const date = new Date(item.date);
      // Format as "YYYY-MM" for grouping
      const yearMonth = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      // Create group if it doesn't exist
      if (!groupedDiagnoses[yearMonth]) {
        groupedDiagnoses[yearMonth] = {
          // Format a nice heading like "April 2025"
          displayDate: date.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
          }),
          items: [],
        };
      }

      // Add the diagnosis to this group
      groupedDiagnoses[yearMonth].items.push(item);
    } catch (error) {
      logError(`Error processing date ${item.date}:`, error);
      // If date is invalid, put in "Unknown Date" group
      if (!groupedDiagnoses["unknown"]) {
        groupedDiagnoses["unknown"] = {
          displayDate: "Unknown Date",
          items: [],
        };
      }
      groupedDiagnoses["unknown"].items.push(item);
    }
  });

  // Convert map to array for easier rendering
  const groupArray = Object.values(groupedDiagnoses);
  logSuccess(`Created ${groupArray.length} date groups for rendering`);
  return groupArray;
};

// Auto-Bulleting Text Area Component
// Optimized Auto-Bulleting Text Area Component to reduce re-renders
const AutoBulletTextArea = React.memo(
  ({
    value,
    onChangeText,
    placeholder,
    style,
    numberOfLines = 10,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    style?: any;
    numberOfLines?: number;
  }) => {
    const inputRef = useRef(null);
    const [internalValue, setInternalValue] = useState(value || "");

    // Update internal value when prop value changes
    useEffect(() => {
      setInternalValue(value || "");
    }, [value]);

    // Handle text changes including auto-bulleting feature
    const handleChangeText = (text: string) => {
      // Update internal state immediately for smooth typing
      setInternalValue(text);

      // Check if Enter key was pressed (by seeing if a new line was added)
      if (text.length > (value?.length || 0) && text.endsWith("\n")) {
        const lines = text.split("\n");
        const previousLine = lines[lines.length - 2] || "";

        // Check if the previous line starts with a bullet point or dash
        if (previousLine.match(/^\s*[-•*]\s/)) {
          // Extract the bullet pattern (including any leading whitespace)
          const bulletMatch = previousLine.match(/^(\s*[-•*]\s)/);
          if (bulletMatch) {
            const bulletPattern = bulletMatch[1];

            // Add the same bullet pattern to the new line
            const newText = text + bulletPattern;
            setInternalValue(newText);
            onChangeText(newText);
            return;
          }
        }
      }

      onChangeText(text);
    };

    return (
      <TextInput
        ref={inputRef}
        style={[styles.textArea, style]}
        value={internalValue}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        multiline
        numberOfLines={numberOfLines}
        textAlignVertical="top"
        placeholderTextColor="#C8C8C8"
        blurOnSubmit={false}
      />
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders
    // Only re-render if these props change
    return (
      prevProps.placeholder === nextProps.placeholder &&
      prevProps.value === nextProps.value
    );
  }
);

// Investigations Selector Component for checkboxes
const InvestigationsSelector = ({ value, onChangeText, disabled = false }) => {
  const [selectedInvestigations, setSelectedInvestigations] = useState([]);
  const [customInvestigationText, setCustomInvestigationText] = useState("");

  // Common medical investigations
  const commonInvestigations = [
    "Complete Blood Count (CBC)",
    "Blood Sugar - Fasting",
    "Blood Sugar - Post Prandial",
    "HbA1c",
    "Lipid Profile",
    "Liver Function Test (LFT)",
    "Kidney Function Test (KFT)",
    "Thyroid Profile",
    "Urine Routine",
    "X-Ray Chest",
    "X-Ray - Other",
    "Ultrasound Abdomen",
    "ECG",
    "2D Echo",
    "CT Scan",
    "MRI",
    "PFT (Pulmonary Function Test)",
    "Blood Pressure Monitoring",
  ];

  // Initialize component based on existing data
  useEffect(() => {
    logInfo(
      "InvestigationsSelector - received value change:",
      value?.length > 0 ? value.substring(0, 30) + "..." : "empty"
    );

    if (value) {
      const lines = value.split("\n");

      // Extract which common investigations are already selected
      const selected = commonInvestigations.filter((investigation) =>
        lines.some(
          (line) => line.replace(/^[-*•\s]+/, "").trim() === investigation
        )
      );

      // Extract custom investigations
      const custom = lines
        .filter((line) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return false;

          const cleanLine = trimmedLine.replace(/^[-*•\s]+/, "").trim();
          return cleanLine && !commonInvestigations.includes(cleanLine);
        })
        .map((line) => line.replace(/^[-*•\s]+/, "").trim())
        .join("\n");

      logInfo(
        `InvestigationsSelector - Parsed ${selected.length
        } selected investigations and ${custom.length > 0 ? "custom text" : "no custom text"
        }`
      );

      setSelectedInvestigations(selected);
      setCustomInvestigationText(custom);
    } else {
      // Reset state if value is empty
      logInfo("InvestigationsSelector - Resetting to empty state");
      setSelectedInvestigations([]);
      setCustomInvestigationText("");
    }
  }, [value]);

  // Function to toggle investigation selection
  const toggleInvestigation = (investigation) => {
    if (disabled) return;

    setSelectedInvestigations((prev) => {
      const newSelected = prev.includes(investigation)
        ? prev.filter((item) => item !== investigation)
        : [...prev, investigation];

      logInfo(
        `Investigation ${prev.includes(investigation) ? "deselected" : "selected"
        }: ${investigation}`
      );

      // Update the parent component's value
      updateCombinedValue(newSelected, customInvestigationText);
      return newSelected;
    });
  };

  // Function to handle custom investigation text changes
  const handleCustomTextChange = (text) => {
    if (disabled) return;

    setCustomInvestigationText(text);
    updateCombinedValue(selectedInvestigations, text);
  };

  // Helper to update the combined field value
  const updateCombinedValue = (selected, customText) => {
    // Format the selected investigations as a bulleted list
    const formattedInvestigations = selected
      .map((investigation) => `- ${investigation}`)
      .join("\n");

    // Format custom text with bullets
    let formattedCustomText = "";
    if (customText.trim()) {
      formattedCustomText = customText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => `- ${line.trim()}`)
        .join("\n");
    }

    // Combine with proper formatting
    const combinedText =
      selected.length > 0 && formattedCustomText
        ? `${formattedInvestigations}\n${formattedCustomText}`
        : selected.length > 0
          ? formattedInvestigations
          : formattedCustomText;

    // Update the parent component
    logInfo(
      `Updating parent with ${selected.length} investigations and ${customText.length > 0 ? "custom text" : "no custom text"
      }`
    );
    onChangeText(combinedText);
  };

  return (
    <View style={styles.investigationsContainer}>
      <Text style={styles.investigationsSubLabel}>
        Select Common Investigations:
      </Text>

      <View style={styles.checkboxContainer}>
        {commonInvestigations.map((investigation) => (
          <View key={investigation} style={styles.checkboxRow}>
            <TouchableOpacity
              style={[
                styles.checkbox,
                selectedInvestigations.includes(investigation) &&
                styles.checkboxSelected,
                disabled && styles.disabledCheckbox,
              ]}
              onPress={() => toggleInvestigation(investigation)}
              disabled={disabled}
            >
              {selectedInvestigations.includes(investigation) && (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
            <Text
              style={[styles.checkboxLabel, disabled && styles.disabledText]}
            >
              {investigation}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.customInvestigationsLabel}>
        Add Custom Investigations:
      </Text>
      <TextInput
        style={[styles.textArea, disabled && styles.disabledTextArea]}
        value={customInvestigationText}
        onChangeText={handleCustomTextChange}
        placeholder={
          disabled
            ? "Advised investigations cleared after save"
            : "Enter any additional investigations not listed above"
        }
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        editable={!disabled}
      />
    </View>
  );
};

// New component for displaying diagnosis history in a modal with grouping by timestamp
const DiagnosisHistoryModal = ({
  visible,
  onClose,
  currentDiagnosis,
  diagnosisHistory,
  isLoading,
}) => {
  // Get today's date formatted as string
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

  // Check if any diagnosis in history is from today
  const isTodayDiagnosisInHistory = diagnosisHistory.some((item) => {
    const itemDate = new Date(item.date);
    const todayDate = new Date();

    return (
      itemDate.getDate() === todayDate.getDate() &&
      itemDate.getMonth() === todayDate.getMonth() &&
      itemDate.getFullYear() === todayDate.getFullYear()
    );
  });

  // If current diagnosis is empty but we have a diagnosis from today in history,
  // don't show empty "Current" section
  const showCurrentSection = currentDiagnosis || !isTodayDiagnosisInHistory;

  // Group diagnoses by date - filter out today's diagnoses which will be shown separately
  const previousDiagnoses = diagnosisHistory.filter((item) => {
    const itemDate = new Date(item.date);
    const todayDate = new Date();

    return !(
      itemDate.getDate() === todayDate.getDate() &&
      itemDate.getMonth() === todayDate.getMonth() &&
      itemDate.getFullYear() === todayDate.getFullYear()
    );
  });

  // Today's diagnoses from history (apart from the current one)
  const todaysDiagnoses = diagnosisHistory.filter((item) => {
    const itemDate = new Date(item.date);
    const todayDate = new Date();

    return (
      itemDate.getDate() === todayDate.getDate() &&
      itemDate.getMonth() === todayDate.getMonth() &&
      itemDate.getFullYear() === todayDate.getFullYear()
    );
  });

  // Group previous diagnoses by date for display
  const groupedDiagnoses = groupDiagnosesByDate(previousDiagnoses);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Diagnosis History</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#4A5568" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0070D6" />
                <Text style={styles.loadingText}>
                  Loading diagnosis history...
                </Text>
              </View>
            ) : (
              <View>
                {/* Today's Section Header */}
                <View style={styles.timeGroupHeader}>
                  <Text style={styles.timeGroupHeaderText}>
                    Today ({today})
                  </Text>
                </View>

                {/* Current Diagnosis Section - Only show if not empty */}
                {showCurrentSection && (
                  <View style={styles.diagnosisSection}>
                    <View style={styles.diagnosisHeader}>
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                      <View style={styles.dateTimeContainer}>
                        <Text style={styles.diagnosisDate}>{today}</Text>
                        <Text style={styles.diagnosisTime}>{currentTime}</Text>
                      </View>
                    </View>
                    <View style={styles.diagnosisContent}>
                      <Text style={styles.diagnosisText}>
                        {currentDiagnosis || "No current diagnosis recorded."}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Other diagnoses from today (if any) */}
                {todaysDiagnoses.length > 0 && (
                  <>
                    {todaysDiagnoses.map((item, index) => (
                      <View
                        key={`today-diagnosis-${index}`}
                        style={[styles.diagnosisSection, { marginBottom: 8 }]}
                      >
                        <View style={styles.diagnosisHeader}>
                          <View style={styles.todayBadge}>
                            <Text style={styles.todayBadgeText}>Today</Text>
                          </View>
                          <View style={styles.dateTimeContainer}>
                            <Text style={styles.diagnosisDate}>
                              {item.formattedDate}
                            </Text>
                            <Text style={styles.diagnosisTime}>
                              {item.formattedTime}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.diagnosisContent}>
                          <Text style={styles.diagnosisText}>
                            {item.diagnosis}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {/* Empty state for today if nothing */}
                {!currentDiagnosis && todaysDiagnoses.length === 0 && (
                  <View style={styles.emptyDiagnosisContainer}>
                    <Text style={styles.emptyDiagnosisText}>
                      No diagnosis recorded today.
                    </Text>
                  </View>
                )}

                {/* Divider between today and previous */}
                {previousDiagnoses.length > 0 && (
                  <View style={styles.historyDivider}>
                    <Text style={styles.historyDividerText}>
                      Previous Diagnoses
                    </Text>
                  </View>
                )}

                {/* Previous Diagnoses - Grouped by date */}
                {previousDiagnoses.length > 0 ? (
                  groupedDiagnoses.map((group, groupIndex) => (
                    <View key={`group-${groupIndex}`}>
                      {/* Month/Year group header */}
                      <View style={styles.timeGroupHeader}>
                        <Text style={styles.timeGroupHeaderText}>
                          {group.displayDate}
                        </Text>
                      </View>

                      {/* Diagnoses in this group */}
                      {group.items.map((item, itemIndex) => (
                        <View
                          key={`diagnosis-${groupIndex}-${itemIndex}`}
                          style={[
                            styles.diagnosisSection,
                            // Add smaller margin for items in the same group
                            { marginBottom: 8 },
                          ]}
                        >
                          <View style={styles.diagnosisHeader}>
                            <View style={styles.dateTimeContainer}>
                              <Text style={styles.diagnosisDate}>
                                {item.formattedDate}
                              </Text>
                              <Text style={styles.diagnosisTime}>
                                {item.formattedTime}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.diagnosisContent}>
                            <Text style={styles.diagnosisText}>
                              {item.diagnosis}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                ) : (
                  <View>
                    <Text style={styles.emptyHistoryText}>
                      No previous diagnosis records found.
                    </Text>
                    <Text style={styles.hintHistoryText}>
                      Previous diagnoses will appear here after you make changes
                      and save.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const DiagnosisTab: React.FC<DiagnosisTabProps> = ({
  patientData,
  updateField,
  patientId,
  tempPatientId,
  prefillMode,
  navigation,
  route,
}) => {
  // Log component mount for tracking
  useEffect(() => {
    log("================================");
    log("DiagnosisTab COMPONENT MOUNTED");
    log("================================");
    log("Route params:", route?.params);
    log("Patient ID:", patientId);
    log("Temp Patient ID:", tempPatientId);
    log(
      "Initial advisedInvestigations:",
      patientData.advisedInvestigations || "empty"
    );

    // Return cleanup function
    return () => {
      log("================================");
      log("DiagnosisTab COMPONENT UNMOUNTED");
      log("================================");
    };
  }, []);

  // State for modal visibility
  const [modalVisible, setModalVisible] = useState(false);
  // State for investigations modal visibility
  const [investigationsModalVisible, setInvestigationsModalVisible] =
    useState(false);
  // State for diagnosis history
  const [diagnosisHistory, setDiagnosisHistory] = useState<
    DiagnosisHistoryItem[]
  >([]);

  // State for investigations history
  const [investigationsHistory, setInvestigationsHistory] = useState<
    InvestigationHistoryItem[]
  >([]);
  // State for loading indicator
  const [isLoading, setIsLoading] = useState(false);
  // Add state to track if we've already fetched history
  const [hasFetchedHistory, setHasFetchedHistory] = useState(false);
  // Add state to track if advised investigations have been cleared
  const [isInvestigationsCleared, setIsInvestigationsCleared] = useState(false);
  // Previous advised investigations before clearing
  const [previousInvestigations, setPreviousInvestigations] = useState("");
  // Track if we're coming from doctor dashboard
  const [fromDashboard, setFromDashboard] = useState(false);
  // Current investigations to be shown in history modal
  const [currentInvestigations, setCurrentInvestigations] = useState("");
  // Track if investigations have been auto-cleared during this session
  const [hasAutoCleared, setHasAutoCleared] = useState(false);
  // Track if we should show modal after save
  const [showModalAfterSave, setShowModalAfterSave] = useState(false);
  // Track if a save operation has just completed
  const [saveJustCompleted, setSaveJustCompleted] = useState(false);
  // Track if advised investigations clearing has been tried
  const [hasTriedClearingInvestigations, setHasTriedClearingInvestigations] =
    useState(false);
  // NEW STATE: Track newly added items for highlighting in the modal
  const [newItemTimestamp, setNewItemTimestamp] = useState<string | null>(null);
  // NEW STATE: Counter to force modal refresh when history changes
  const [historyUpdateCounter, setHistoryUpdateCounter] = useState(0);
  // NEW STATE: Track when diagnosis has been edited
  const [diagnosisEdited, setDiagnosisEdited] = useState(false);
  // NEW STATE: Track the current diagnosis date to determine if it's from today
  const [currentDiagnosisDate, setCurrentDiagnosisDate] = useState<Date | null>(
    null
  );
  // NEW STATE: Track if diagnosis should be blocked from refetching
  const [blockDiagnosisRefetch, setBlockDiagnosisRefetch] = useState(false);

  // New state for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    diagnosis: true, // Start with diagnosis expanded
    investigations: false,
  });

  // ENHANCED STATE: Current working patient ID
  const [currentWorkingPatientId, setCurrentWorkingPatientId] = useState(null);

  // Toggle function for collapsible sections
  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Enhanced saveToAPI function with better error handling and retries
  const saveToAPI = async (patientId, historyItem, retryCount = 0) => {
    const maxRetries = 3;

    try {
      logInfo(
        `Saving diagnosis history to API (attempt ${retryCount + 1}/${maxRetries + 1
        })`
      );
      logInfo(`Patient ID: ${patientId}`);
      logInfo(`Diagnosis: ${historyItem.diagnosis?.substring(0, 50)}...`);

      // API URL
      const apiUrl =
        API_ENDPOINTS.PATIENT_PROCESSOR;

      // Enhanced request body with additional metadata
      const requestBody = {
        action: "saveDiagnosisHistory",
        patientId: patientId,
        diagnosisItem: {
          ...historyItem,
          // Add additional metadata to help with debugging
          source: "diagnosis_tab_clear",
          clientTimestamp: new Date().toISOString(),
          retryAttempt: retryCount,
        },
        timestamp: new Date().getTime(),
        // Add client identifier to help with debugging
        clientId: `diagnosis_tab_${Date.now()}`,
      };

      logInfo("API Request:", JSON.stringify(requestBody, null, 2));

      // Make the API call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Client-Source": "diagnosis-tab",
          "X-Patient-ID": patientId,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const result = await response.json();
      logSuccess("API Response:", JSON.stringify(result, null, 2));

      // Check if the response indicates success
      let isSuccess = false;

      if (result.success === true) {
        isSuccess = true;
      } else if (result.body) {
        try {
          const bodyData =
            typeof result.body === "string"
              ? JSON.parse(result.body)
              : result.body;
          if (bodyData.success === true) {
            isSuccess = true;
          }
        } catch (parseError) {
          logError("Error parsing response body:", parseError);
        }
      }

      if (!isSuccess) {
        throw new Error(
          result.error || result.message || "API call was not successful"
        );
      }

      logSuccess("Successfully saved diagnosis history to API");

      // Update local cache immediately
      await updateDiagnosisHistoryCache(patientId, historyItem);

      return result;
    } catch (error) {
      logError(
        `Error saving diagnosis to API (attempt ${retryCount + 1}):`,
        error
      );

      // Check if we should retry
      if (retryCount < maxRetries) {
        logWarning(`Retrying API call in ${(retryCount + 1) * 2} seconds...`);

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, (retryCount + 1) * 2000)
        );

        // Retry the API call
        return saveToAPI(patientId, historyItem, retryCount + 1);
      } else {
        logError("Max retries exceeded, falling back to local cache only");

        // Fallback: Make sure it's in the local history even if API call fails
        await updateDiagnosisHistoryCache(patientId, historyItem);

        // Don't throw the error - we want the UI to continue working
        // even if the API is temporarily unavailable
        return { success: false, error: error.message, usedFallback: true };
      }
    }
  };

  // Enhanced updateDiagnosisHistoryCache function
  const updateDiagnosisHistoryCache = async (patientId, newItem) => {
    try {
      logInfo(`Updating diagnosis history cache for patient: ${patientId}`);

      // Get existing cache from multiple possible keys
      const cacheKeys = [
        `diagnosis_history_${patientId}`,
        `diagnosis_last_saved_${patientId}`,
      ];

      let existingCache = [];

      // Try to get existing cache
      for (const cacheKey of cacheKeys) {
        try {
          const cachedData = await AsyncStorage.getItem(cacheKey);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed)) {
              existingCache = parsed;
              logInfo(
                `Found existing cache with ${existingCache.length} items`
              );
              break;
            } else if (parsed.diagnosis) {
              // Single item cache
              existingCache = [parsed];
              logInfo("Found single item cache");
              break;
            }
          }
        } catch (error) {
          logError(`Error reading cache key ${cacheKey}:`, error);
        }
      }

      // Add new item to the beginning (most recent first)
      // But check for duplicates first
      const isDuplicate = existingCache.some(
        (item) =>
          item.diagnosis === newItem.diagnosis &&
          Math.abs(
            new Date(item.date).getTime() - new Date(newItem.date).getTime()
          ) < 60000 // Within 1 minute
      );

      if (!isDuplicate) {
        existingCache = [newItem, ...existingCache];
        logSuccess("Added new item to cache");
      } else {
        logInfo("Item already exists in cache, skipping duplicate");
      }

      // Limit cache size to prevent it from growing too large
      if (existingCache.length > 50) {
        existingCache = existingCache.slice(0, 50);
        logInfo("Trimmed cache to 50 most recent items");
      }

      // Save updated cache to multiple keys for redundancy
      const savePromises = [
        AsyncStorage.setItem(
          `diagnosis_history_${patientId}`,
          JSON.stringify(existingCache)
        ),
        AsyncStorage.setItem(
          `diagnosis_last_saved_${patientId}`,
          JSON.stringify(newItem)
        ),
        AsyncStorage.setItem(
          `diagnosis_backup_${patientId}_${Date.now()}`,
          JSON.stringify(newItem)
        ),
      ];

      await Promise.all(savePromises);
      logSuccess("Updated diagnosis history cache with new item");

      return existingCache;
    } catch (error) {
      logError("Error updating diagnosis history cache:", error);
      throw error;
    }
  };

  // FIXED: Enhanced clearDiagnosisAfterSave function
  const clearDiagnosisAfterSave = () => {
    log("========================================");
    logWarning("CLEARING DIAGNOSIS AFTER SAVE");
    log("========================================");

    // FIXED: Capture diagnosis value BEFORE any clearing happens
    const diagnosisToSave = patientData.diagnosis;

    log(
      "Diagnosis value to be cleared:",
      diagnosisToSave
        ? `"${diagnosisToSave.substring(0, 100)}${diagnosisToSave.length > 100 ? "..." : ""
        }"`
        : "empty"
    );

    // FIXED: Don't save to history here since Lambda function already handles it
    // This prevents duplicate history entries and conflicts
    log("Skipping diagnosis history save - already handled by server");

    // Set flag to block refetching BEFORE clearing the field
    setBlockDiagnosisRefetch(true);
    logSuccess("Set blockDiagnosisRefetch flag to TRUE");

    // Set a flag in AsyncStorage with the current timestamp
    try {
      const timestamp = Date.now().toString();
      AsyncStorage.setItem("diagnosis_cleared_timestamp", timestamp);
      AsyncStorage.setItem("block_diagnosis_refetch", "true");
      logSuccess(`Set diagnosis blocking flags in AsyncStorage`);
    } catch (error) {
      logError("Error setting diagnosis blocking flags:", error);
    }

    // Critical: Clear the diagnosis field IMMEDIATELY
    logWarning("Clearing diagnosis field IMMEDIATELY");
    updateField("diagnosis", "");
    logSuccess("Diagnosis field cleared after save");

    // Reset the diagnosis edited flag
    setDiagnosisEdited(false);

    // Make the block persist longer (10 seconds instead of 5)
    setTimeout(() => {
      logInfo("Checking if it's safe to remove blockDiagnosisRefetch flag...");
      // Only remove the flag if diagnosis is still empty
      if (!patientData.diagnosis) {
        setBlockDiagnosisRefetch(false);
        AsyncStorage.removeItem("block_diagnosis_refetch");
        logInfo("Removed blockDiagnosisRefetch flag after timeout");
      } else {
        logWarning(
          "Keeping blockDiagnosisRefetch flag active - diagnosis is not empty"
        );
        // Try clearing again if somehow diagnosis got refetched
        updateField("diagnosis", "");
        // Set another timeout
        setTimeout(() => {
          setBlockDiagnosisRefetch(false);
          AsyncStorage.removeItem("block_diagnosis_refetch");
          logInfo("Removed blockDiagnosisRefetch flag after extended timeout");
        }, 5000);
      }
    }, 10000);

    // Fetch diagnosis history to ensure it's up-to-date for the modal only
    fetchDiagnosisHistory(true);
  };

  // Enhanced patient ID management and initialization
  useEffect(() => {
    const initializePatientId = async () => {
      log("🔍 INITIALIZING PATIENT ID");

      // Try to get patient ID from multiple sources
      let effectivePatientId = null;

      // Source 1: Direct props
      if (patientId) {
        effectivePatientId = patientId;
        log(`✅ Found patient ID from props: ${patientId}`);
      }

      // Source 2: Temp patient ID (for new patients)
      if (!effectivePatientId && tempPatientId) {
        effectivePatientId = tempPatientId;
        log(`✅ Found temp patient ID: ${tempPatientId}`);
      }

      // Source 3: Route params
      if (!effectivePatientId && route?.params?.patient?.patientId) {
        effectivePatientId = route.params.patient.patientId;
        log(`✅ Found patient ID from route: ${effectivePatientId}`);
      }

      // Source 4: AsyncStorage (current patient ID)
      if (!effectivePatientId) {
        try {
          const storedPatientId = await AsyncStorage.getItem(
            "current_patient_id"
          );
          if (storedPatientId) {
            effectivePatientId = storedPatientId;
            log(`✅ Found patient ID from AsyncStorage: ${storedPatientId}`);
          }
        } catch (error) {
          log("❌ Error reading patient ID from AsyncStorage:", error);
        }
      }

      // Source 5: Session ID
      if (!effectivePatientId) {
        try {
          const sessionId = await AsyncStorage.getItem("lastSavedSessionId");
          if (sessionId) {
            effectivePatientId = sessionId;
            log(`✅ Found patient ID from session: ${sessionId}`);
          }
        } catch (error) {
          log("❌ Error reading session ID from AsyncStorage:", error);
        }
      }

      if (effectivePatientId) {
        log(`🎯 Using effective patient ID: ${effectivePatientId}`);

        // Store this as the current working patient ID
        setCurrentWorkingPatientId(effectivePatientId);

        // Also store it in AsyncStorage for future reference
        try {
          await AsyncStorage.setItem(
            "current_working_patient_id",
            effectivePatientId
          );
        } catch (error) {
          log("❌ Error storing working patient ID:", error);
        }
      } else {
        log("⚠️ No patient ID found from any source");
      }
    };

    initializePatientId();
  }, [patientId, tempPatientId, route?.params?.patient?.patientId]);

  // Enhanced effect to auto-load diagnosis history when patient ID is available
  useEffect(() => {
    if (currentWorkingPatientId && !hasFetchedHistory) {
      log(
        `🔄 Auto-loading diagnosis history for patient: ${currentWorkingPatientId}`
      );
      setTimeout(() => {
        fetchDiagnosisHistory(false);
      }, 500);
    }
  }, [currentWorkingPatientId, hasFetchedHistory]);

  // FIXED: Enhanced useEffect to prevent double-clearing
  useEffect(() => {
    const checkForSaveCompletion = async () => {
      try {
        // Check multiple save completion indicators
        const [savedSessionId, diagnosisFlag, clearedTimestamp] =
          await Promise.all([
            AsyncStorage.getItem("lastSavedSessionId"),
            AsyncStorage.getItem("clearDiagnosisFlag"),
            AsyncStorage.getItem("diagnosis_cleared_timestamp"),
          ]);

        const currentPatientId =
          currentWorkingPatientId || patientId || tempPatientId;

        // FIXED: Only clear if we haven't already cleared recently
        const now = Date.now();
        const recentlyClearedThreshold = 5000; // 5 seconds

        if (clearedTimestamp) {
          const timeSinceCleared = now - parseInt(clearedTimestamp);
          if (timeSinceCleared < recentlyClearedThreshold) {
            log(
              `Skipping duplicate clear - already cleared ${timeSinceCleared}ms ago`
            );
            return;
          }
        }

        // Check if save was completed for current patient
        if (savedSessionId === currentPatientId) {
          log("🔍 Save completion detected via session ID");

          // Clear the flag
          await AsyncStorage.removeItem("lastSavedSessionId");

          // If there's diagnosis text, clear it
          if (patientData.diagnosis) {
            log("🧹 Clearing diagnosis after save completion detection");
            clearDiagnosisAfterSave();
          }
        }

        // Check for diagnosis clear flag
        if (diagnosisFlag === "true") {
          log("🔍 Diagnosis clear flag detected");

          if (patientData.diagnosis) {
            log("🧹 Clearing diagnosis based on flag");
            clearDiagnosisAfterSave();
          }

          // Clear the flag
          await AsyncStorage.removeItem("clearDiagnosisFlag");
        }

        // FIXED: Remove old logic that was causing premature clearing
      } catch (error) {
        log("❌ Error checking save completion:", error);
      }
    };

    // Check on component mount and when working patient ID changes
    if (currentWorkingPatientId) {
      checkForSaveCompletion();
    }
  }, [currentWorkingPatientId, patientData.diagnosis]);

  // Expose this method so the parent component can call it
  useEffect(() => {
    // Add this method to a ref so parent component can access it
    if (route?.params?.diagnosisTabRef) {
      route.params.diagnosisTabRef.current = {
        clearDiagnosisAfterSave,
        // Flag to indicate diagnosis was recently cleared
        wasRecentlyCleared: blockDiagnosisRefetch,
        // Method to check if refetching should be blocked
        shouldBlockRefetch: () => blockDiagnosisRefetch,
        // Enhanced method for save completion
        handleSaveCompletion: () => {
          log("handleSaveCompletion called directly from parent");
          if (patientData.diagnosis) {
            logWarning(
              "🧹 Directly clearing diagnosis via handleSaveCompletion"
            );
            clearDiagnosisAfterSave();
            return true;
          }
          return false;
        },
      };
    }
  }, [blockDiagnosisRefetch]);

  // ENHANCED: Function to handle advised investigations after save - MODIFIED
  const handleInvestigationsAfterSave = () => {
    console.log("⚙️ HANDLING INVESTIGATIONS AFTER SAVE");
    logInfo(
      JSON.stringify({
        action: "handleInvestigationsAfterSave",
        hasInvestigations: !!patientData.advisedInvestigations,
        investigationsLength: patientData.advisedInvestigations?.length || 0,
        historyUpdateCount: historyUpdateCounter,
      })
    );

    // Always capture the current investigations for display before clearing
    if (patientData.advisedInvestigations) {
      // Store in state for current display
      setCurrentInvestigations(patientData.advisedInvestigations);

      // Create a timestamp for the new history item
      const timestamp = new Date().toISOString();

      // Create a new history item with the current investigations
      const newHistoryItem = {
        advisedInvestigations: patientData.advisedInvestigations,
        date: timestamp,
        formattedDate: formatDate(timestamp),
        formattedTime: formatTime(timestamp),
        doctor: "Dr. Dipak Gawli", // Default doctor name
        source: "current", // Mark as current source for special handling
      };

      // *** IMPORTANT: Add to history without removing previous entries ***
      setInvestigationsHistory((prevHistory) => {
        // Check if this is a completely new set of investigations
        const isDifferentFromPrevious =
          prevHistory.length === 0 ||
          prevHistory[0]?.advisedInvestigations !==
          patientData.advisedInvestigations;

        if (isDifferentFromPrevious) {
          console.log(
            `🔄 Adding new investigation to history (now ${prevHistory.length + 1
            } items)`
          );
          logInfo(
            JSON.stringify({
              action: "addingNewHistoryItem",
              timestamp: timestamp,
              newContentLength: patientData.advisedInvestigations.length,
              previousHistoryCount: prevHistory.length,
            })
          );

          // Store the timestamp of the newly added item for highlighting
          setNewItemTimestamp(timestamp);

          // Add the new item at the beginning without removing previous entries
          return [newHistoryItem, ...prevHistory];
        } else {
          console.log(
            "📝 No changes to investigation history - content is the same"
          );
          return prevHistory;
        }
      });

      // Store original investigations before clearing
      setPreviousInvestigations(patientData.advisedInvestigations);
    }

    // Show the modal with both current and history BEFORE clearing
    logSuccess("Opening investigations history modal BEFORE clearing");

    // Fetch the latest history first, then show modal
    fetchInvestigationsHistory(true).then(() => {
      setInvestigationsModalVisible(true);

      // Increment history update counter to force refresh
      setHistoryUpdateCounter((prev) => prev + 1);
    });

    // Only clear the field AFTER showing modal with a delay
    // This ensures you see both current and previous investigations in the modal
    setTimeout(() => {
      console.log("🧹 Clearing advisedInvestigations AFTER showing history");
      logWarning(
        JSON.stringify({
          action: "delayedInvestigationsClear",
          timing: "1000ms after modal open",
          originalValue:
            patientData.advisedInvestigations?.substring(0, 30) + "...",
        })
      );

      // Clear the field via updateField - only AFTER the modal is shown
      updateField("advisedInvestigations", "");

      // Set flags to track the clearing
      setIsInvestigationsCleared(true);
      setHasAutoCleared(true);

      logSuccess(
        "Investigations cleared with delay after showing history modal"
      );
    }, 1000); // Increased delay to ensure modal is fully visible with data
  };

  // NEW FUNCTION: Clear advised investigations with better logging
  const clearAdvisedInvestigations = () => {
    log("================================================");
    logWarning("CLEARING ADVISED INVESTIGATIONS - OPERATION STARTING");
    log("================================================");

    log(
      "Current advisedInvestigations state:",
      patientData.advisedInvestigations
        ? `"${patientData.advisedInvestigations.substring(0, 100)}${patientData.advisedInvestigations.length > 100 ? "..." : ""
        }"`
        : "empty"
    );

    // Use the enhanced handler instead of direct clearing
    handleInvestigationsAfterSave();
  };

  // Enhanced updateField specifically for diagnosis tracking
  // Enhanced updateField with debouncing and local state to prevent flickering
  const [localDiagnosis, setLocalDiagnosis] = useState("");
  const [blockChecked, setBlockChecked] = useState(false);
  const blockCheckTimeoutRef = useRef(null);

  // Only check AsyncStorage once on component mount
  useEffect(() => {
    AsyncStorage.getItem("block_diagnosis_refetch")
      .then((blockFlag) => {
        if (blockFlag === "true") {
          setBlockDiagnosisRefetch(true);
        }
        setBlockChecked(true);
      })
      .catch((error) => {
        logError("Error checking block flag on mount:", error);
        setBlockChecked(true);
      });
  }, []);

  // Optimized diagnosis change handler that doesn't check AsyncStorage on every keystroke
  const handleDiagnosisChange = (text) => {
    // Update local state immediately for smooth typing
    setLocalDiagnosis(text);

    // Clear any pending timeouts
    if (blockCheckTimeoutRef.current) {
      clearTimeout(blockCheckTimeoutRef.current);
    }

    // Use timeout to debounce the actual update to parent
    blockCheckTimeoutRef.current = setTimeout(() => {
      if (blockDiagnosisRefetch) {
        logWarning("BLOCKED diagnosis field update due to refetch blocking");
        setLocalDiagnosis("");
        updateField("diagnosis", "");
        return;
      }

      // Update parent state with debounced value
      updateField("diagnosis", text);

      // Update tracking flags only once when needed
      if (!diagnosisEdited && text) {
        setDiagnosisEdited(true);
        setCurrentDiagnosisDate(new Date());
      }
    }, 300); // 300ms debounce
  };

  // Update component unmount cleanup
  useEffect(() => {
    return () => {
      if (blockCheckTimeoutRef.current) {
        clearTimeout(blockCheckTimeoutRef.current);
      }
    };
  }, []);

  // Log when patientData changes, especially advisedInvestigations
  useEffect(() => {
    log("Patient data changed:");
    log(
      "- advisedInvestigations: ",
      patientData.advisedInvestigations
        ? `${patientData.advisedInvestigations.length} chars`
        : "empty"
    );

    // NEW CODE: Add diagnosis data monitoring
    log(
      "- diagnosis: ",
      patientData.diagnosis ? `${patientData.diagnosis.length} chars` : "empty"
    );

    // If diagnosis is being refetched when it should be blocked, clear it again
    if (blockDiagnosisRefetch && patientData.diagnosis) {
      logWarning("🚨 BLOCKING DIAGNOSIS REFETCH - clearing field again");
      // Set a small timeout to ensure this happens after the state update
      setTimeout(() => {
        updateField("diagnosis", "");
        log("Forced diagnosis clear due to blockDiagnosisRefetch flag");
      }, 100);
    }
  }, [patientData, blockDiagnosisRefetch]);

  // Add effect to ensure refetch blocking is checked at component load
  // Add effect to ensure refetch blocking AND ensure diagnosis field starts empty
  useEffect(() => {
    const checkBlockRefetch = async () => {
      try {
        const blockFlag = await AsyncStorage.getItem("block_diagnosis_refetch");
        if (blockFlag === "true") {
          log("Found block_diagnosis_refetch flag in AsyncStorage on mount");
          setBlockDiagnosisRefetch(true);

          // Auto-clear the flag after 10 seconds
          setTimeout(() => {
            setBlockDiagnosisRefetch(false);
            AsyncStorage.removeItem("block_diagnosis_refetch");
            log("Removed blockDiagnosisRefetch flag after timeout on mount");
          }, 10000);
        }

        // REMOVED: Always clear diagnosis field on component mount
        // This was causing data loss when switching tabs (draft system)
        /*
        if (patientData.diagnosis) {
          logWarning("🧹 Clearing diagnosis on mount - should start empty");
          updateField("diagnosis", "");
        }
        */
      } catch (error) {
        logError("Error checking block_diagnosis_refetch on mount:", error);
      }
    };

    checkBlockRefetch();
  }, []);

  // NEW EFFECT: Check if we're in prescribe mode
  useEffect(() => {
    log("------------------------------------------------");
    log("PRESCRIBE MODE CHECK EFFECT TRIGGERED");
    log("hasTriedClearingInvestigations:", hasTriedClearingInvestigations);
    log(
      "advisedInvestigations value:",
      patientData.advisedInvestigations
        ? `"${patientData.advisedInvestigations.substring(0, 30)}${patientData.advisedInvestigations.length > 30 ? "..." : ""
        }"`
        : "empty"
    );
    log("------------------------------------------------");

    const checkPrescribeModeAndClear = async () => {
      logWarning("Checking if we should clear advised investigations...");

      // First check route params
      let shouldClear = isPrescribeMode();
      log("Route params prescribe check result:", shouldClear);

      // If route params don't indicate prescribe mode, check AsyncStorage
      if (!shouldClear) {
        shouldClear = await checkAsyncStoragePrescribeMode();
        log("AsyncStorage prescribeMode check result:", shouldClear);
      }

      // If we're in prescribe mode, set it in AsyncStorage for persistence
      if (shouldClear) {
        try {
          log("Setting prescribeMode=true in AsyncStorage for persistence");
          await AsyncStorage.setItem("prescribeMode", "true");
          logSuccess("prescribeMode=true saved to AsyncStorage");
        } catch (error) {
          logError("Error saving prescribe mode to AsyncStorage:", error);
        }

        // Now clear the investigations if we have them
        if (
          patientData.advisedInvestigations &&
          !hasTriedClearingInvestigations
        ) {
          logWarning("🚨 In prescribe mode with investigations - CLEARING NOW");
          clearAdvisedInvestigations();
        } else if (hasTriedClearingInvestigations) {
          logInfo(
            "In prescribe mode, but already tried clearing investigations"
          );
          setIsInvestigationsCleared(true);
        } else {
          logInfo("In prescribe mode, but no investigations to clear");
          setIsInvestigationsCleared(true);
        }
      } else {
        logInfo("Not in prescribe mode, keeping existing investigations");
      }
    };

    checkPrescribeModeAndClear();
    log("------------------------------------------------");
  }, [patientData.advisedInvestigations]); // Added patientData dependency to handle late-loading data

  // NEW FUNCTION: Detect if we're in "Prescribe" mode by checking parent route params
  const isPrescribeMode = () => {
    log("CHECKING IF IN PRESCRIBE MODE");

    // Check if we're running in a context where route exists
    if (!route || !route.params) {
      log("No route or route params available");
      return false;
    }

    // Check direct route params - immediate
    if (
      route.params.initialTab === "prescription" &&
      route.params.prefillMode === true
    ) {
      logSuccess(
        "DIRECT Route params indicate Prescribe mode: initialTab=prescription, prefillMode=true"
      );
      return true;
    } else {
      log("Direct route params check: ", route.params);
    }

    // Try to check parent route if available
    if (
      navigation &&
      navigation.getParent &&
      navigation.getParent()?.getState
    ) {
      try {
        // Get parent route info
        const parentState = navigation.getParent().getState();
        log("Parent navigation state:", parentState);

        if (parentState && parentState.routes) {
          const currentRoute = parentState.routes[parentState.index];
          log("Current parent route:", currentRoute);

          if (currentRoute && currentRoute.params) {
            if (
              currentRoute.params.initialTab === "prescription" &&
              currentRoute.params.prefillMode === true
            ) {
              logSuccess("PARENT Route params indicate Prescribe mode");
              return true;
            } else {
              log(
                "Parent route params don't indicate prescribe mode:",
                currentRoute.params
              );
            }
          } else {
            log("No params in parent route");
          }
        } else {
          log("No routes in parent navigation state");
        }
      } catch (error) {
        logError("Error checking parent route:", error);
      }
    } else {
      log("Parent navigation not available");
    }

    logInfo("Not in prescribe mode based on route params");
    return false;
  };

  // NEW FUNCTION: Check AsyncStorage for prescribe mode flag
  const checkAsyncStoragePrescribeMode = async () => {
    try {
      log("Checking AsyncStorage for prescribeMode flag");
      const isPrescribe = await AsyncStorage.getItem("prescribeMode");
      logInfo(`AsyncStorage prescribeMode value: ${isPrescribe}`);
      return isPrescribe === "true";
    } catch (error) {
      logError("Error checking AsyncStorage for prescribe mode:", error);
      return false;
    }
  };

  // Enhanced fetchDiagnosisHistory function with better patient ID handling
  const fetchDiagnosisHistory = async (forceRefresh = false) => {
    // Start loading state
    setIsLoading(true);

    log("Fetching diagnosis history...");

    // ENHANCED: Try multiple patient ID sources
    let effectivePatientId = null;
    const possibleIds = [
      patientId,
      tempPatientId,
      currentWorkingPatientId,
      route?.params?.patient?.patientId,
    ].filter(Boolean); // Remove null/undefined values

    effectivePatientId = possibleIds[0]; // Use the first valid ID

    log(`Patient ID candidates: ${JSON.stringify(possibleIds)}`);
    log(`Using effective patient ID: ${effectivePatientId || "not found"}`);
    log(`blockDiagnosisRefetch: ${blockDiagnosisRefetch}`);

    try {
      if (!effectivePatientId) {
        logError("No patient ID available to fetch diagnosis history");
        setIsLoading(false);
        return;
      }

      // When viewing history, always force refresh to get the latest edits
      const shouldForceRefresh = forceRefresh || diagnosisEdited;

      // ENHANCED: Check multiple cache keys for better retrieval
      let cachedData = null;
      if (!shouldForceRefresh) {
        const cacheKeys = [
          `diagnosis_history_${effectivePatientId}`,
          // Also check if there are any backup entries
          ...possibleIds.map((id) => `diagnosis_history_${id}`),
        ];

        for (const cacheKey of cacheKeys) {
          try {
            const data = await AsyncStorage.getItem(cacheKey);
            if (data) {
              cachedData = data;
              log(`Found cached data with key: ${cacheKey}`);
              break;
            }
          } catch (error) {
            log(`Error checking cache key ${cacheKey}:`, error);
          }
        }
      }

      if (cachedData && !shouldForceRefresh) {
        logSuccess("Found cached diagnosis history");
        try {
          const parsedData = JSON.parse(cachedData);

          // Format dates for display
          const formattedData = parsedData.map((item) => ({
            ...item,
            formattedDate: formatDate(item.date),
            formattedTime: formatTime(item.date),
          }));

          // IMPORTANT FIX: Always update the history state
          setDiagnosisHistory(formattedData);
          setHasFetchedHistory(true);
          setIsLoading(false);

          // Log the history items for debugging
          log(
            `Loaded ${formattedData.length} diagnosis history items from cache`
          );
          if (formattedData.length > 0) {
            log("First cached history item:", formattedData[0]);
          }

          return;
        } catch (error) {
          logError("Error parsing cached diagnosis history:", error);
          // Continue to fetch from API if cache parsing fails
        }
      }

      // STEP 1: First try to get diagnosis history from the dedicated history API
      let diagnosisHistoryData = [];

      try {
        // Get API URL
        const apiUrl =
          API_ENDPOINTS.PATIENT_PROCESSOR;

        // Create the request body with multiple patient ID attempts
        const requestBody = {
          action: "getDiagnosisHistory",
          patientId: effectivePatientId,
          // ADDED: Include alternative patient IDs for backend to search
          alternativePatientIds: possibleIds,
          timestamp: new Date().getTime(),
        };

        log(
          "Fetching fresh diagnosis history with request:",
          JSON.stringify(requestBody)
        );

        // Make the API call
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
          body: JSON.stringify(requestBody),
        });

        // Parse the response
        const result = await response.json();

        // Log the entire response for debugging
        log("Diagnosis History API Response:", JSON.stringify(result));

        // Better handling for nested response formats
        // Try multiple paths to find the data
        if (
          result.success &&
          result.diagnosisHistory &&
          Array.isArray(result.diagnosisHistory)
        ) {
          diagnosisHistoryData = result.diagnosisHistory;
          log(
            "Found diagnosis history in direct result.diagnosisHistory",
            diagnosisHistoryData.length
          );
        }
        // Then check for nested body format (common in Lambda responses)
        else if (result.body) {
          try {
            const bodyObject =
              typeof result.body === "string"
                ? JSON.parse(result.body)
                : result.body;

            if (
              bodyObject.diagnosisHistory &&
              Array.isArray(bodyObject.diagnosisHistory)
            ) {
              diagnosisHistoryData = bodyObject.diagnosisHistory;
              log(
                "Found diagnosis history in nested bodyObject.diagnosisHistory",
                diagnosisHistoryData.length
              );
            } else if (bodyObject.data && Array.isArray(bodyObject.data)) {
              diagnosisHistoryData = bodyObject.data;
              log(
                "Found diagnosis history in nested bodyObject.data",
                diagnosisHistoryData.length
              );
            }
          } catch (parseError) {
            logError("Error parsing nested body response:", parseError);
          }
        } else if (result.data && Array.isArray(result.data)) {
          diagnosisHistoryData = result.data;
          log(
            "Found diagnosis history in result.data",
            diagnosisHistoryData.length
          );
        }
      } catch (apiError) {
        logError("Diagnosis History API fetch error:", apiError);
      }

      // STEP 2: If no dedicated history found, try to get the current patient record
      let currentPatientDiagnosis = null;
      if (diagnosisHistoryData.length === 0) {
        log(
          "No dedicated diagnosis history found, fetching current patient record"
        );

        try {
          const apiUrl =
            API_ENDPOINTS.PATIENT_PROCESSOR;

          const patientRequestBody = {
            action: "getPatient", // Use the action to get the full patient record
            patientId: effectivePatientId,
            timestamp: new Date().getTime(),
          };

          log(
            "Fetching current patient record:",
            JSON.stringify(patientRequestBody)
          );

          const patientResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            body: JSON.stringify(patientRequestBody),
          });

          const patientResult = await patientResponse.json();
          log("Patient Record API Response:", JSON.stringify(patientResult));

          // Parse the patient response
          let patientData = null;

          if (patientResult.success && patientResult.patient) {
            patientData = patientResult.patient;
          } else if (patientResult.body) {
            try {
              const bodyObject =
                typeof patientResult.body === "string"
                  ? JSON.parse(patientResult.body)
                  : patientResult.body;

              if (bodyObject.success && bodyObject.patient) {
                patientData = bodyObject.patient;
              } else if (
                bodyObject.patients &&
                Array.isArray(bodyObject.patients)
              ) {
                // Find the patient by ID
                patientData = bodyObject.patients.find(
                  (p) => p.patientId === effectivePatientId
                );
              }
            } catch (parseError) {
              logError("Error parsing patient response body:", parseError);
            }
          }

          // Extract diagnosis from patient record
          if (
            patientData &&
            patientData.diagnosis &&
            patientData.diagnosis.trim()
          ) {
            log(
              `Found current diagnosis in patient record: "${patientData.diagnosis}"`
            );

            // Create a history item from the current diagnosis
            currentPatientDiagnosis = {
              diagnosis: patientData.diagnosis.trim(),
              date:
                patientData.updatedAt ||
                patientData.createdAt ||
                new Date().toISOString(),
              source: "current_patient_record",
            };

            log(
              "Created history item from current diagnosis:",
              currentPatientDiagnosis
            );
          } else {
            log("No diagnosis found in current patient record");
          }
        } catch (patientApiError) {
          logError("Error fetching current patient record:", patientApiError);
        }
      }

      // STEP 3: Combine history data with current diagnosis
      let combinedHistoryData = [...diagnosisHistoryData];

      if (currentPatientDiagnosis) {
        // Check if this diagnosis is already in the history to avoid duplicates
        const isDuplicate = combinedHistoryData.some(
          (item) =>
            item.diagnosis === currentPatientDiagnosis.diagnosis &&
            Math.abs(
              new Date(item.date).getTime() -
              new Date(currentPatientDiagnosis.date).getTime()
            ) < 60000 // Within 1 minute
        );

        if (!isDuplicate) {
          log("Adding current diagnosis to history (not a duplicate)");
          combinedHistoryData.unshift(currentPatientDiagnosis); // Add to beginning
        } else {
          log(
            "Current diagnosis already exists in history, skipping duplicate"
          );
        }
      }

      // STEP 4: Also check AsyncStorage for backup entries
      if (combinedHistoryData.length === 0) {
        log("Still no diagnosis history found, checking AsyncStorage backups");

        const backupHistory = [];

        // Check all possible patient IDs for saved items
        for (const patId of possibleIds) {
          try {
            // Check main saved item
            const lastSavedItem = await AsyncStorage.getItem(
              `diagnosis_last_saved_${patId}`
            );
            if (lastSavedItem) {
              const savedItemData = JSON.parse(lastSavedItem);
              backupHistory.push(savedItemData);
              log(`Found last saved item for patient ID: ${patId}`);
            }

            // Check for backup entries
            const allKeys = await AsyncStorage.getAllKeys();
            const backupKeys = allKeys.filter((key) =>
              key.startsWith(`diagnosis_backup_${patId}_`)
            );

            for (const backupKey of backupKeys) {
              try {
                const backupItem = await AsyncStorage.getItem(backupKey);
                if (backupItem) {
                  const backupData = JSON.parse(backupItem);
                  backupHistory.push(backupData);
                  log(`Found backup item: ${backupKey}`);
                }
              } catch (error) {
                log(`Error reading backup key ${backupKey}:`, error);
              }
            }
          } catch (error) {
            log(`Error checking AsyncStorage for patient ID ${patId}:`, error);
          }
        }

        if (backupHistory.length > 0) {
          // Remove duplicates and sort by date
          const uniqueHistory = Array.from(
            new Map(
              backupHistory.map((item) => [item.diagnosis + item.date, item])
            ).values()
          ).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );

          combinedHistoryData = uniqueHistory;
          log(`Found ${combinedHistoryData.length} backup history items`);
        }
      }

      // Process combined history if found
      if (combinedHistoryData.length > 0) {
        logSuccess(
          `Found ${combinedHistoryData.length} diagnosis history items in total`
        );

        // Sort by date (newest first)
        const sortedHistoryData = combinedHistoryData.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        // Format dates for display
        const formattedData = sortedHistoryData.map((item) => ({
          ...item,
          formattedDate: formatDate(item.date),
          formattedTime: formatTime(item.date),
        }));

        // IMPORTANT: Update the history state with the new data
        setDiagnosisHistory(formattedData);

        // Cache the data for future use with all possible patient IDs
        for (const patId of possibleIds) {
          try {
            const cacheKey = `diagnosis_history_${patId}`;
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify(sortedHistoryData)
            );
            log(`Cached diagnosis history with key: ${cacheKey}`);
          } catch (error) {
            log(`Error caching with key diagnosis_history_${patId}:`, error);
          }
        }

        // Log first item for debugging
        if (formattedData.length > 0) {
          log("First history item:", formattedData[0]);
        }
      } else {
        log("No diagnosis history found anywhere");
        setDiagnosisHistory([]);
      }

      setHasFetchedHistory(true);
      setIsLoading(false);
    } catch (error) {
      logError("Error fetching diagnosis history:", error);
      setDiagnosisHistory([]);
      setHasFetchedHistory(true);
      setIsLoading(false);
    }
  };

  // Function to fetch advised investigations history
  const fetchInvestigationsHistory = async (forceRefresh = false) => {
    // Start loading state
    setIsLoading(true);

    log("Fetching advised investigations history...");
    log(
      JSON.stringify({
        action: "fetchInvestigationsHistory",
        patientId: patientId || "not set",
        tempPatientId: tempPatientId || "not set",
        forceRefresh: forceRefresh,
        historyCount: investigationsHistory.length,
      })
    );

    try {
      // First check if we have this cached in AsyncStorage
      const effectivePatientId = patientId || tempPatientId;
      if (!effectivePatientId) {
        logError("No patient ID available to fetch investigations history");
        setIsLoading(false);
        return;
      }

      // Try to get from cache first (unless forceRefresh is true)
      const cacheKey = `investigations_history_${effectivePatientId}`;
      let cachedData = null;

      if (!forceRefresh) {
        cachedData = await AsyncStorage.getItem(cacheKey);
      }

      if (cachedData && !forceRefresh) {
        logSuccess("Found cached investigations history");
        try {
          const parsedData = JSON.parse(cachedData);
          log(
            JSON.stringify({
              source: "cache",
              itemCount: parsedData.length,
              firstItem:
                parsedData.length > 0
                  ? {
                    date: parsedData[0].date,
                    content:
                      parsedData[0].advisedInvestigations?.substring(0, 30) +
                      "...",
                  }
                  : null,
            })
          );

          // Format dates for display
          const formattedData = parsedData.map((item) => ({
            ...item,
            formattedDate: formatDate(item.date),
            formattedTime: formatTime(item.date),
            doctor: item.doctor || "Dr. Dipak Gawli", // Default doctor name if not in data
          }));

          setInvestigationsHistory(formattedData);
          setIsLoading(false);

          // Increment counter to force modal refresh
          setHistoryUpdateCounter((prev) => prev + 1);
          return;
        } catch (error) {
          logError("Error parsing cached investigations history:", error);
          // Continue to fetch from API if cache parsing fails
        }
      }

      // API fetch logic for investigations history
      try {
        // Get API URL
        const apiUrl =
          API_ENDPOINTS.PATIENT_PROCESSOR;

        // Create the request body
        const requestBody = {
          action: "getInvestigationsHistory",
          patientId: effectivePatientId,
        };

        // Add a timestamp to prevent caching
        requestBody["timestamp"] = new Date().getTime();

        log(
          JSON.stringify({
            action: "fetchingInvestigationsFromAPI",
            requestBody: requestBody,
          })
        );

        // Make the API call
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
          body: JSON.stringify(requestBody),
        });

        // Parse the response
        const result = await response.json();

        // *** CRITICAL FIX: PROPERLY HANDLE NESTED JSON RESPONSE ***
        // The API returns data in a nested body field that is a JSON string
        let investigationsHistoryData = [];

        // First try to look directly in result
        if (
          result.investigationsHistory &&
          result.investigationsHistory.length > 0
        ) {
          investigationsHistoryData = result.investigationsHistory;
          logSuccess(
            `Found ${investigationsHistoryData.length} investigations history items in direct result`
          );
        }
        // Then try to parse from nested body if it exists
        else if (result.body) {
          try {
            // Check if body is a string that needs parsing
            let bodyData =
              typeof result.body === "string"
                ? JSON.parse(result.body)
                : result.body;

            if (
              bodyData.investigationsHistory &&
              bodyData.investigationsHistory.length > 0
            ) {
              investigationsHistoryData = bodyData.investigationsHistory;
              logSuccess(
                `Found ${investigationsHistoryData.length} investigations history items in nested result body`
              );
            }
          } catch (parseError) {
            logError("Error parsing nested body:", parseError);
          }
        }

        // Process history data if found
        if (investigationsHistoryData.length > 0) {
          // Format dates for display
          const formattedData = investigationsHistoryData.map((item) => ({
            ...item,
            formattedDate: formatDate(item.date),
            formattedTime: formatTime(item.date),
            doctor: item.doctor || "Dr. Dipak Gawli", // Default doctor name if not present
          }));

          // Log history for debugging
          log(
            JSON.stringify({
              source: "api",
              totalItems: formattedData.length,
              sampleItems: formattedData.slice(0, 2).map((item) => ({
                date: item.date,
                formatted: item.formattedDate,
                time: item.formattedTime,
                contentLength: item.advisedInvestigations?.length || 0,
              })),
            })
          );

          // Update state
          setInvestigationsHistory(formattedData);

          // Cache the data for future use
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify(investigationsHistoryData)
          );
        } else {
          // For debugging, log the raw API response
          log("No investigations history found in API response");
          log(
            JSON.stringify({
              apiResponse: result,
            })
          );

          // Keep existing history if we couldn't find any in the response
          logWarning(
            "Keeping existing history - couldn't find new history in response"
          );
        }
      } catch (apiError) {
        logError("API fetch error:", apiError);
      }

      setIsLoading(false);

      // Increment counter to force modal refresh
      setHistoryUpdateCounter((prev) => prev + 1);
    } catch (error) {
      logError("Error fetching investigations history:", error);
      setIsLoading(false);
    }
  };

  // Helper function to format dates
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (error) {
      logError("Error formatting date:", error);
      return dateString;
    }
  };

  // Helper function to format time
  const formatTime = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      logError("Error formatting time:", error);
      return "";
    }
  };

  // Update handleViewDiagnosis to only load history for the modal
  const handleViewDiagnosis = async () => {
    // If the diagnosis has been edited, update current diagnosis date to today
    if (diagnosisEdited) {
      setCurrentDiagnosisDate(new Date());
    }

    // Show loading state immediately for better UX
    setIsLoading(true);
    setModalVisible(true);

    try {
      // Ensure we have the latest history - ONLY for the modal
      await fetchDiagnosisHistory(true);

      // Log current state
      log(
        `Showing diagnosis modal with ${diagnosisHistory.length} history items`
      );
      log(`Current diagnosis: ${patientData.diagnosis ? "present" : "empty"}`);

      // Add current diagnosis to history if needed, but don't update the input field
      if (diagnosisHistory.length === 0 && patientData.diagnosis) {
        log(
          "No history found but we have current diagnosis - adding it to history"
        );
        const timestamp = new Date().toISOString();

        // Create a new history item
        const currentItem = {
          diagnosis: patientData.diagnosis,
          date: timestamp,
          formattedDate: formatDate(timestamp),
          formattedTime: formatTime(timestamp),
        };

        // Update state directly for modal display only
        setDiagnosisHistory([currentItem]);

        // Also save to storage
        const effectivePatientId =
          currentWorkingPatientId || patientId || tempPatientId;
        if (effectivePatientId) {
          const cacheKey = `diagnosis_history_${effectivePatientId}`;
          await AsyncStorage.setItem(cacheKey, JSON.stringify([currentItem]));
          log("Saved current diagnosis as history item");
        }
      }
    } catch (error) {
      logError("Error in handleViewDiagnosis:", error);
    } finally {
      // Reset diagnosis edited flag after viewing
      setDiagnosisEdited(false);
      setIsLoading(false);
    }
  };

  // Function to handle the View Advised Investigations button press
  const handleViewInvestigations = async () => {
    // Always set current investigations for consistency
    if (patientData.advisedInvestigations) {
      // If we have current investigations, use them
      logInfo(
        JSON.stringify({
          action: "handleViewInvestigations",
          useCurrentValue: true,
          currentLength: patientData.advisedInvestigations.length,
        })
      );
      setCurrentInvestigations(patientData.advisedInvestigations);
    } else if (previousInvestigations) {
      // If current is empty but we have previous, use those
      logInfo(
        JSON.stringify({
          action: "handleViewInvestigations",
          useCurrentValue: false,
          usePreviousValue: true,
          previousLength: previousInvestigations.length,
        })
      );
      setCurrentInvestigations(previousInvestigations);
    } else {
      // Set empty if we have nothing
      logInfo(
        JSON.stringify({
          action: "handleViewInvestigations",
          useCurrentValue: false,
          usePreviousValue: false,
          setEmpty: true,
        })
      );
      setCurrentInvestigations("");
    }

    // Force refresh to get the latest history from the server BEFORE showing the modal
    setIsLoading(true);
    await fetchInvestigationsHistory(true);

    // Only show the modal after history is refreshed
    logSuccess("Opening investigations history modal after fetching history");
    setInvestigationsModalVisible(true);

    // Increment counter to force modal refresh
    setHistoryUpdateCounter((prev) => prev + 1);
  };

  // Check navigation source and clear investigations if coming from dashboard
  useEffect(() => {
    const checkNavigationSource = async () => {
      try {
        // Check if there's a flag in AsyncStorage indicating we're from dashboard
        const source = await AsyncStorage.getItem("navigationSource");
        log("Navigation source:", source);

        if (source === "doctorDashboard") {
          logWarning("Coming from Doctor Dashboard - clearing investigations");
          setFromDashboard(true);

          // Wait a moment to ensure patientData is loaded
          setTimeout(() => {
            if (patientData.advisedInvestigations) {
              logWarning(
                "🧹 Dashboard trigger - clearing investigations after timeout"
              );
              clearAdvisedInvestigations();
              // Show investigations modal automatically when coming from dashboard
              setInvestigationsModalVisible(true);
            } else {
              log("No investigations to clear from dashboard");
              setIsInvestigationsCleared(true);
              // Still show the modal even if there are no investigations
              setInvestigationsModalVisible(true);
            }
          }, 500);

          // Clear the navigation source flag
          await AsyncStorage.removeItem("navigationSource");
        }
      } catch (error) {
        logError("Error checking navigation source:", error);
      }
    };

    checkNavigationSource();

    // Also check route params if available
    if (route?.params?.from === "dashboard") {
      logWarning("Route params indicate coming from Dashboard");
      setFromDashboard(true);

      // Clear investigations after a short delay
      setTimeout(() => {
        if (patientData.advisedInvestigations) {
          logWarning(
            "🧹 Dashboard route params - clearing investigations after timeout"
          );
          clearAdvisedInvestigations();
          // Show investigations modal automatically
          setInvestigationsModalVisible(true);
        } else {
          log("No investigations to clear from dashboard route params");
          setIsInvestigationsCleared(true);
          // Still show the modal even if there are no investigations
          setInvestigationsModalVisible(true);
        }
      }, 500);
    }
  }, []);

  // Listen for saving events from parent component
  useEffect(() => {
    // Create a listener to handle save events
    const handleAppStateChange = async (nextAppState) => {
      // This is a placeholder for real event handling - in a real app,
      // you would listen for a specific event from the parent component
      if (nextAppState === "active" && patientData.advisedInvestigations) {
        // Check AsyncStorage for a saved flag
        const wasSavedRecently = await AsyncStorage.getItem(
          "diagnosisSaveFlag"
        );

        if (wasSavedRecently === "true") {
          // Clear the flag
          await AsyncStorage.removeItem("diagnosisSaveFlag");

          logInfo(
            JSON.stringify({
              action: "handleAppStateChange_saveDetected",
              advisedInvestigationsLength:
                patientData.advisedInvestigations.length,
              hasPreviousValue: !!previousInvestigations,
              diagnosisSaveFlag: wasSavedRecently,
            })
          );

          // Use the enhanced handler instead of directly clearing
          handleInvestigationsAfterSave();
          setSaveJustCompleted(true);
        }
      }
    };

    // Set up listener
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Cleanup
    return () => {
      subscription.remove();
    };
  }, [patientData.advisedInvestigations]);

  // Method to be called from parent after saving
  useEffect(() => {
    const checkForSaveCompletion = async () => {
      // For demonstration: check if there's a saved session flag
      const savedSessionId = await AsyncStorage.getItem("lastSavedSessionId");
      const currentSessionId =
        currentWorkingPatientId || patientId || tempPatientId;

      if (savedSessionId === currentSessionId) {
        logWarning("Save operation detected - clearing investigations");
        // Clear the flag
        await AsyncStorage.removeItem("lastSavedSessionId");
        // Set a flag to show that save is completed
        setSaveJustCompleted(true);

        // If there's a saved session and investigations, clear them
        if (patientData.advisedInvestigations) {
          logWarning(
            "🧹 Saved session - clearing investigations after save completion"
          );
          // Use enhanced handler instead of direct clearing
          handleInvestigationsAfterSave();
        }
      }
    };

    checkForSaveCompletion();
  }, []);

  // New effect to handle save completion and auto-show modal
  useEffect(() => {
    // Check if we need to show the modal after save
    if (saveJustCompleted && showModalAfterSave) {
      log("Save completed - showing investigations modal");
      // Fetch the latest history
      fetchInvestigationsHistory(true);
      // Show the modal
      setInvestigationsModalVisible(true);
      // Reset flags
      setSaveJustCompleted(false);
      setShowModalAfterSave(false);
    }
  }, [saveJustCompleted, showModalAfterSave]);

  // When component unmounts, clean up prescribe mode flag
  useEffect(() => {
    return () => {
      // When the component unmounts, remove the prescribe mode flag
      AsyncStorage.removeItem("prescribeMode")
        .then(() => log("Cleaned up prescribeMode flag on unmount"))
        .catch((error) =>
          logError("Error cleaning up prescribeMode flag:", error)
        );
    };
  }, []);

  // Added effect to detect and highlight new items when history changes
  useEffect(() => {
    // Detection logic for newItemTimestamp
    if (investigationsHistory.length > 0 && !newItemTimestamp) {
      // Find the most recent item and use its timestamp for highlighting
      const mostRecent = [...investigationsHistory].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];

      if (mostRecent) {
        logInfo(
          JSON.stringify({
            action: "autoDetectingNewItem",
            date: mostRecent.date,
            formattedDate: mostRecent.formattedDate,
            updateCounter: historyUpdateCounter,
          })
        );

        setNewItemTimestamp(mostRecent.date);

        // Clear the highlight after 5 seconds
        const timer = setTimeout(() => {
          setNewItemTimestamp(null);
        }, 5000);

        return () => clearTimeout(timer);
      }
    }
  }, [investigationsHistory, historyUpdateCounter]);

  // Only track diagnosis edits, don't assume initial diagnosis is valid
  useEffect(() => {
    // Only set the date if user makes an edit to the diagnosis
    if (patientData.diagnosis && diagnosisEdited && !currentDiagnosisDate) {
      setCurrentDiagnosisDate(new Date());
      log("Set current diagnosis date to today after user edit");
    }
  }, [patientData.diagnosis, diagnosisEdited]);

  // Added effect to monitor diagnosis data and prevent refetching after saving
  useEffect(() => {
    // This effect runs when patientData.diagnosis changes
    log(
      "Diagnosis field changed:",
      patientData.diagnosis ? "has content" : "empty"
    );

    // Check if this change should be blocked
    if (blockDiagnosisRefetch && patientData.diagnosis) {
      logWarning(
        "🚨 BLOCKING DIAGNOSIS REFETCH - diagnosis has content when it should be empty"
      );
      // Set a small timeout to ensure this happens after the state update
      setTimeout(() => {
        updateField("diagnosis", "");
        log("Forced diagnosis clear due to blockDiagnosisRefetch flag");
      }, 50);
    }

    // Also check AsyncStorage flag
    AsyncStorage.getItem("block_diagnosis_refetch")
      .then((blockFlag) => {
        if (blockFlag === "true" && patientData.diagnosis) {
          logWarning("🚨 BLOCKING DIAGNOSIS REFETCH via AsyncStorage flag");
          setTimeout(() => {
            updateField("diagnosis", "");
            log("Forced diagnosis clear due to AsyncStorage block flag");
          }, 50);
        }
      })
      .catch((error) => {
        // Log error but don't block based on AsyncStorage error
        logError(
          "Error checking block_diagnosis_refetch in AsyncStorage:",
          error
        );
      });
  }, [patientData.diagnosis]);

  // Added effect to check AsyncStorage for diagnosis cleared timestamp
  useEffect(() => {
    const checkDiagnosisClearedTimestamp = async () => {
      try {
        const timestamp = await AsyncStorage.getItem(
          "diagnosis_cleared_timestamp"
        );
        if (timestamp) {
          const clearedTime = parseInt(timestamp);
          const currentTime = Date.now();
          const timeDiff = currentTime - clearedTime;

          // If cleared within the last 5 seconds, block refetching
          if (timeDiff < 5000) {
            logWarning(
              `Diagnosis was cleared ${timeDiff}ms ago, blocking refetch`
            );
            setBlockDiagnosisRefetch(true);

            // Clear the block after the remaining time (up to 5 seconds total)
            const remainingTime = 5000 - timeDiff;
            setTimeout(() => {
              setBlockDiagnosisRefetch(false);
              logInfo(
                "Reset blockDiagnosisRefetch flag after remaining timeout"
              );
            }, remainingTime);
          }
        }
      } catch (error) {
        logError("Error checking diagnosis cleared timestamp:", error);
      }
    };

    checkDiagnosisClearedTimestamp();
  }, []);

  // Add listener to check AsyncStorage for diagnosis clear flag
  useEffect(() => {
    // Function to check if diagnosis should be cleared
    const checkForDiagnosisClearFlag = async () => {
      try {
        const shouldClear = await AsyncStorage.getItem("clearDiagnosisFlag");

        if (shouldClear === "true") {
          log("🚩 Detected clearDiagnosisFlag = true in AsyncStorage");

          // Clear the diagnosis field
          if (patientData.diagnosis) {
            log("🧹 Clearing diagnosis field based on AsyncStorage flag");

            // Store current diagnosis in history before clearing
            const timestamp = new Date().toISOString();

            // Create a new history item
            const newHistoryItem = {
              diagnosis: patientData.diagnosis,
              date: timestamp,
              formattedDate: formatDate(timestamp),
              formattedTime: formatTime(timestamp),
            };

            // Add to history first
            setDiagnosisHistory((prevHistory) => [
              newHistoryItem,
              ...prevHistory,
            ]);

            // Set the block refetch flag
            setBlockDiagnosisRefetch(true);

            // Clear the field IMMEDIATELY (no setTimeout)
            updateField("diagnosis", "");
            log("✅ Diagnosis field cleared via AsyncStorage flag mechanism");

            // Reset the diagnosis edited flag
            setDiagnosisEdited(false);

            // Clear the flag
            AsyncStorage.removeItem("clearDiagnosisFlag");

            // Reset block flag after delay
            setTimeout(() => {
              setBlockDiagnosisRefetch(false);
            }, 5000);
          }
        }
      } catch (error) {
        logError("Error checking diagnosis clear flag:", error);
      }
    };

    // Check for diagnosis clear flag when component mounts or when active
    checkForDiagnosisClearFlag();

    // Also listen for AppState changes to detect when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        log("App came to foreground, checking if diagnosis should be cleared");
        checkForDiagnosisClearFlag();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Listen for save completion through route params
  useEffect(() => {
    if (route?.params?.saveCompleted) {
      log("Detected saveCompleted flag in route params");

      // Clear diagnosis if we just saved
      if (patientData.diagnosis) {
        log("🧹 Clearing diagnosis after save (route params trigger)");

        // Call the clearing function
        clearDiagnosisAfterSave();

        // Reset the route param to prevent multiple clears
        if (navigation && navigation.setParams) {
          navigation.setParams({ saveCompleted: false });
        }
      }
    }
  }, [route?.params?.saveCompleted]);

  return (
    <View style={styles.formSection}>
      <Text style={styles.sectionTitle}>Diagnosis</Text>

      {/* Diagnosis field with auto-bulleting - WRAPPED IN COLLAPSIBLE SECTION */}
      <CollapsibleSection
        title="Diagnosis Details"
        isExpanded={expandedSections.diagnosis}
        onToggle={() => toggleSection("diagnosis")}
        icon="document-text-outline"
      >
        <View style={styles.inputWrapper}>
          <AutoBulletTextArea
            value={localDiagnosis || patientData.diagnosis} // Use local state for rendering
            onChangeText={(text) => handleDiagnosisChange(text)}
            placeholder="Enter diagnosis details. Use dash (-) or bullet (•) at the beginning of a line for auto-bulleting."
            numberOfLines={15}
            style={[styles.textArea, { minHeight: 200 }]} // Reduced height slightly
          />
          <Text style={styles.hintText}>
            Tip: Start a line with "-" to create a bulleted list
          </Text>

          {/* View Diagnosis button */}
          {prefillMode && (
            <TouchableOpacity
              style={styles.viewButton}
              onPress={handleViewDiagnosis}
            >
              <Text style={styles.viewButtonText}>View Diagnosis History</Text>
            </TouchableOpacity>
          )}
        </View>
      </CollapsibleSection>

      {/* Advised Investigations field with checkboxes - WRAPPED IN COLLAPSIBLE SECTION */}
      <CollapsibleSection
        title="Advised Investigations"
        isExpanded={expandedSections.investigations}
        onToggle={() => toggleSection("investigations")}
        icon="flask-outline"
      >
        <View style={styles.inputWrapper}>
          {/* Show banner if coming from dashboard */}
          {fromDashboard && (
            <View style={styles.fromDashboardBanner}>
              <Ionicons name="information-circle" size={20} color="#FFFFFF" />
              <Text style={styles.fromDashboardText}>
                Advised investigations cleared for new entry
              </Text>
            </View>
          )}

          {/* Show banner if investigations were cleared after save */}
          {isInvestigationsCleared && !fromDashboard && hasAutoCleared && (
            <View style={styles.saveCompleteBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.saveCompleteText}>
                Advised investigations saved and cleared
              </Text>
            </View>
          )}

          {/* Show banner if we're in prescribe mode */}
          {isInvestigationsCleared && !fromDashboard && !hasAutoCleared && (
            <View style={styles.prescribeModeBanner}>
              <Ionicons name="medkit" size={20} color="#FFFFFF" />
              <Text style={styles.prescribeModeText}>
                Ready for new advised investigations
              </Text>
            </View>
          )}

          {/* Always keep investigations selectable */}
          <InvestigationsSelector
            value={patientData.advisedInvestigations}
            onChangeText={(text) => updateField("advisedInvestigations", text)}
            disabled={false} // Always keep enabled so user can select again after clearing
          />

          {/* Always show View Investigations button */}
          {prefillMode && (
            <TouchableOpacity
              style={styles.viewButton}
              onPress={handleViewInvestigations}
            >
              <Text style={styles.viewButtonText}>
                View Advised Investigations History
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </CollapsibleSection>

      {/* Diagnosis History Modal */}
      <DiagnosisHistoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        currentDiagnosis={patientData.diagnosis}
        diagnosisHistory={diagnosisHistory}
        isLoading={isLoading}
      />

      {/* Investigations History Modal - Using the external component with enhanced props */}
      <InvestigationsHistoryModal
        visible={investigationsModalVisible}
        onClose={() => setInvestigationsModalVisible(false)}
        currentInvestigations={currentInvestigations}
        investigationsHistory={investigationsHistory}
        isLoading={isLoading}
        patientName={patientData.name || "Patient"}
        newItemTimestamp={newItemTimestamp} // Pass the timestamp for highlighting
        key={`inv-modal-${historyUpdateCounter}`} // Force remount when historyUpdateCounter changes
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // Original styles
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 16,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 6,
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
  hintHistoryText: {
    fontSize: 13,
    textAlign: "center",
    color: "#718096",
    fontStyle: "italic",
    marginTop: 4,
    marginBottom: 16,
  },
  viewButton: {
    backgroundColor: "#0070D6",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  viewButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  investigationsContainer: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
  },
  investigationsSubLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 12,
  },
  checkboxContainer: {
    marginTop: 8,
    marginBottom: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "48%", // Two columns layout
    marginBottom: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#0070D6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "#FFFFFF",
  },
  checkboxSelected: {
    backgroundColor: "#0070D6",
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#2D3748",
    flex: 1,
  },
  customInvestigationsLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 8,
    marginTop: 8,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxHeight: "90%",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2D3748",
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    padding: 16,
    maxHeight: 500,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#4A5568",
  },
  diagnosisSection: {
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  diagnosisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#EDF2F7",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  currentBadge: {
    backgroundColor: "#38A169",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // New style for "Today" badge
  todayBadge: {
    backgroundColor: "#3182CE", // Blue color to differentiate from Current
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  dateTimeContainer: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  diagnosisDate: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
  },
  diagnosisTime: {
    fontSize: 12,
    color: "#718096",
    marginTop: 2,
  },
  diagnosisContent: {
    padding: 12,
  },
  diagnosisText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#2D3748",
  },
  emptyDiagnosisText: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#718096",
  },
  emptyDiagnosisContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  historyDivider: {
    marginVertical: 16,
    alignItems: "center",
  },
  historyDividerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#718096",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  emptyHistoryText: {
    fontSize: 15,
    textAlign: "center",
    color: "#718096",
    fontStyle: "italic",
    marginTop: 16,
    marginBottom: 8,
  },
  modalCloseButton: {
    backgroundColor: "#0070D6",
    padding: 16,
    alignItems: "center",
    margin: 16,
    borderRadius: 8,
  },
  modalCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  // Styles for timestamp grouping
  timeGroupHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#EBF8FF", // Light blue background
    borderRadius: 8,
    marginVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#0070D6",
  },
  timeGroupHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C5282", // Dark blue text
  },

  // Styles for disabled state
  disabledCheckbox: {
    borderColor: "#A0AEC0",
    backgroundColor: "#EDF2F7",
  },
  disabledText: {
    color: "#A0AEC0",
  },
  disabledTextArea: {
    backgroundColor: "#EDF2F7",
    color: "#A0AEC0",
  },

  // Styles for from dashboard banner
  fromDashboardBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4299E1",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  fromDashboardText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  },

  // Styles for save complete banner
  saveCompleteBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#38A169", // Green
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  saveCompleteText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  },

  // New styles for prescribe mode banner
  prescribeModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8B5CF6", // Purple
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  prescribeModeText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  },

  // Debug banner styles
  debugBanner: {
    backgroundColor: "#FEF3C7", // Light yellow
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  debugText: {
    color: "#92400E",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  // New Collapsible Section styles
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
});

export default DiagnosisTab;
