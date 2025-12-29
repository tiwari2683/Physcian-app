import React, { useState, useEffect, useCallback, useRef } from "react";
import { API_ENDPOINTS } from "../../Config";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================

// Get screen dimensions for responsive layout
const { width: screenWidth } = Dimensions.get("window");

// Enhanced logging function that formats logs as JSON
const logJson = (category, message, details = {}) => {
  const timestamp = new Date().toISOString();
  console.log(
    JSON.stringify(
      {
        timestamp,
        category,
        message,
        details,
      },
      null,
      2
    )
  );
};

// Format date for display - includes time for better differentiation
const formatDate = (dateString) => {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      logJson("DATE_ERROR", "Invalid date format", { dateString });
      return "Invalid Date";
    }
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch (error) {
    logJson("DATE_ERROR", "Error formatting date", {
      dateString,
      error: error.message,
    });
    return "Date Error";
  }
};

// Helper to compare parameter values
const areParametersEqual = (record1, record2) => {
  if (!record1 || !record2) return false;

  // Compare key clinical parameters
  return (
    record1.inr === record2.inr &&
    record1.hb === record2.hb &&
    record1.wbc === record2.wbc &&
    record1.platelet === record2.platelet &&
    record1.bilirubin === record2.bilirubin &&
    record1.sgot === record2.sgot &&
    record1.sgpt === record2.sgpt &&
    record1.alt === record2.alt &&
    record1.tprAlb === record2.tprAlb &&
    record1.ureaCreat === record2.ureaCreat &&
    record1.sodium === record2.sodium &&
    record1.fastingHBA1C === record2.fastingHBA1C &&
    record1.pp === record2.pp &&
    record1.tsh === record2.tsh &&
    record1.ft4 === record2.ft4
  );
};

// Create a hash of parameter values for comparison
const getParameterHash = (record) => {
  if (!record) return "";

  return `${record.inr || ""}_${record.hb || ""}_${record.wbc || ""}_${record.platelet || ""
    }_${record.bilirubin || ""}_${record.sgot || ""}_${record.sgpt || ""}`;
};

// Helper function to check if two dates are the same day (ignoring time)
const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;

  const d1 = new Date(date1);
  const d2 = new Date(date2);

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

// Helper function to check if a record is the specific dummy record
const isDummyRecord = (date) => {
  if (!date) return false;

  const recordDate = new Date(date);
  // Check if this is the specific dummy record date (4/2/2025 2:44 PM)
  return (
    recordDate.getFullYear() === 2025 &&
    recordDate.getMonth() === 3 && // April is month 3 (0-indexed)
    recordDate.getDate() === 2 &&
    recordDate.getHours() === 14 &&
    recordDate.getMinutes() === 44
  );
};

// ====================================================================
// PARAMETER CONFIGURATION
// ====================================================================

// Define parameter names and their display labels
const PARAMETER_CONFIG = [
  { key: "inr", label: "INR" },
  { key: "hb", label: "HB" },
  { key: "wbc", label: "WBC" },
  { key: "platelet", label: "Platelet" },
  { key: "bilirubin", label: "Bili" },
  { key: "sgot", label: "SGOT" },
  { key: "sgpt", label: "SGPT" },
  { key: "alt", label: "ALT" },
  { key: "tprAlb", label: "TPR/Alb" },
  { key: "ureaCreat", label: "Urea/Creat" },
  { key: "sodium", label: "Sodium" },
  { key: "fastingHBA1C", label: "Fast/HBA1C" },
  { key: "pp", label: "PP" },
  { key: "tsh", label: "TSH" },
  { key: "ft4", label: "FT4" },
  { key: "others", label: "Others" },
];

// ====================================================================
// DATA PROCESSING FUNCTIONS
// ====================================================================

// Helper function to ensure only the most recent record is marked as current
const ensureOnlyOneCurrentRecord = (records) => {
  if (!records || records.length === 0) return [];

  // Sort by date (newest first)
  const sortedRecords = [...records].sort((a, b) => {
    const dateA = a.date instanceof Date ? a.date : new Date(a.date);
    const dateB = b.date instanceof Date ? b.date : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  // Mark only the first (most recent) record as current
  return sortedRecords.map((record, index) => ({
    ...record,
    isCurrent: index === 0,
  }));
};

// ====================================================================
// MAIN COMPONENT
// ====================================================================

const ViewParametersModal = ({
  isVisible,
  onClose,
  clinicalParameters,
  patientId,
  unmarshallDynamoDBObject,
  initialHistoricalData = null as any[] | null, // Accept array or null
}) => {
  // Debug initial conditions - only when visible to avoid console spam
  if (isVisible) {
    logJson("INITIALIZATION", "ViewParametersModal initializing", {
      isVisible,
      patientId,
      hasInitialData: initialHistoricalData?.length ?? 0 > 0,
    });

    if (clinicalParameters) {
      logJson("INITIALIZATION", "Initial clinical parameters", {
        date: clinicalParameters.date,
        inr: clinicalParameters.inr,
        hb: clinicalParameters.hb,
      });
    }
  }

  // ====================================================================
  // STATE INITIALIZATION
  // ====================================================================

  // First filter out any dummy records from the initialHistoricalData
  const filteredInitialData = initialHistoricalData
    ? initialHistoricalData.filter((record) => !isDummyRecord(record.date))
    : [];

  // Ensure only one record is marked as current
  const processedInitialData = ensureOnlyOneCurrentRecord(filteredInitialData);

  // Only log when visible to reduce console spam
  if (isVisible) {
    logJson("DATA_PROCESSING", "Filtered initial data", {
      initialCount: initialHistoricalData?.length || 0,
      filteredCount: filteredInitialData.length,
      processedCount: processedInitialData.length,
    });
  }

  // State to store historical clinical parameters data
  const [historicalData, setHistoricalData] = useState(
    processedInitialData || []
  );
  // State to track if data is loading
  const [isLoading, setIsLoading] = useState(
    processedInitialData.length > 0 ? false : true
  );
  // State to track if error occurred
  const [error, setError] = useState(null);
  // Add state to track if initial load is complete
  const [initialLoadComplete, setInitialLoadComplete] = useState(
    processedInitialData.length > 0 ? true : false
  );
  // Reference to track if component is mounted
  const isMounted = useRef(true);

  // Ref for synced scrolling
  const paramNamesScrollViewRef = useRef(null);
  const valuesScrollViewRef = useRef(null);
  // Add these new refs to track programmatic scrolling
  const isParamScrolling = useRef(false);
  const isValuesScrolling = useRef(false);

  // ====================================================================
  // LIFECYCLE MANAGEMENT
  // ====================================================================

  // Set isMounted to false when component unmounts
  useEffect(() => {
    return () => {
      logJson("LIFECYCLE", "Component unmounting");
      isMounted.current = false;
    };
  }, []);

  // ====================================================================
  // DATA TRANSFORMATION FUNCTIONS
  // ====================================================================

  // Function to ensure demonstration data is available
  const ensureDemonstrationData = useCallback(
    (currentData) => {
      logJson("DATA_PROCESSING", "Ensuring demonstration data", {
        recordCount: currentData?.length || 0,
      });

      // First, filter out the dummy record (4/2/2025 2:44 PM)
      const filteredData =
        currentData?.filter((record) => !isDummyRecord(record.date)) || [];

      logJson("DATA_PROCESSING", "After filtering dummy records", {
        remainingCount: filteredData.length,
      });

      if (!filteredData || filteredData.length === 0) {
        // If no data at all, create a sample with current parameters
        if (clinicalParameters) {
          logJson(
            "DATA_PROCESSING",
            "Creating demonstration data from current parameters"
          );
          const currentRecord = {
            ...clinicalParameters,
            date: clinicalParameters.date || new Date(),
            // Don't set isCurrent here, it will be set by ensureOnlyOneCurrentRecord
          };

          logJson("DATA_PROCESSING", "Demonstration data created", {
            recordCount: 1,
            date: currentRecord.date,
          });
          return ensureOnlyOneCurrentRecord([currentRecord]);
        }
        logJson("DATA_PROCESSING", "Could not create demonstration data", {
          reason: "No current parameters available",
        });
        return [];
      }

      // Apply the current record marking logic to ensure only one record is current
      return ensureOnlyOneCurrentRecord(filteredData);
    },
    [clinicalParameters]
  );

  // ====================================================================
  // INITIALIZATION EFFECT
  // ====================================================================

  // Initialize historicalData with current parameters immediately upon component creation
  useEffect(() => {
    if (clinicalParameters && !filteredInitialData.length) {
      logJson("INITIALIZATION", "Initializing with current record");

      // Create a record from current parameters immediately
      const initialRecord = {
        ...clinicalParameters,
        date: clinicalParameters.date || new Date(),
        // Don't set isCurrent here, it will be set by ensureOnlyOneCurrentRecord
      };

      logJson("INITIALIZATION", "Initial record created", {
        record: initialRecord,
      });

      // Set initial data with at least the current record
      const initialData = ensureDemonstrationData([initialRecord]);
      logJson("INITIALIZATION", "Setting initial data", {
        recordCount: initialData.length,
      });

      // Validate data before setting state
      if (initialData && initialData.length > 0) {
        setHistoricalData(initialData);
        setIsLoading(false);
        setInitialLoadComplete(true);
        logJson("INITIALIZATION", "Initial state set successfully");
      } else {
        logJson("INITIALIZATION", "Failed to create initial data", {
          error: "No valid records after processing",
        });
      }
    }
  }, []);

  // ====================================================================
  // MODAL VISIBILITY EFFECT
  // ====================================================================

  // Process current parameters and fetch historical data when modal is opened
  useEffect(() => {
    if (isVisible && clinicalParameters) {
      logJson("MODAL", "Modal is visible, processing parameters");

      // Only set loading if we don't already have data
      if (historicalData.length === 0) {
        logJson("LOADING", "Setting loading state (no existing data)");
        setIsLoading(true);
      } else {
        logJson("LOADING", "Skipping loading state", {
          existingRecordCount: historicalData.length,
        });
      }

      setError(null);

      // Create a record from current parameters with explicit date handling
      let paramDate = clinicalParameters.date;
      if (typeof paramDate === "string") {
        paramDate = new Date(paramDate);
      } else if (!(paramDate instanceof Date)) {
        paramDate = new Date();
      }

      const currentRecord = {
        ...clinicalParameters,
        date: paramDate,
        // Don't set isCurrent here, it will be properly set later
      };

      // Log current parameters to verify data
      logJson("DATA_PROCESSING", "Current parameters record", {
        date: currentRecord.date?.toISOString?.() || currentRecord.date,
        inr: currentRecord.inr,
        hb: currentRecord.hb,
        sgot: currentRecord.sgot,
        sgpt: currentRecord.sgpt,
      });

      // Set initial data with demonstration data
      const initialData = ensureDemonstrationData([currentRecord]);

      if (initialData && initialData.length > 0) {
        logJson("DATA_PROCESSING", "Setting initial data", {
          recordCount: initialData.length,
        });
        setHistoricalData(initialData);

        // IMPORTANT: Set loading to false immediately to show initial data
        setIsLoading(false);
        setInitialLoadComplete(true);

        // Then fetch additional historical data in the background
        fetchHistoricalData();
      } else {
        logJson("DATA_PROCESSING", "Failed to create initial data", {
          error: "Data processing error",
        });
        setError("Failed to prepare clinical parameters data");
        setIsLoading(false);
      }
    }
  }, [isVisible, clinicalParameters, ensureDemonstrationData]);

  // ====================================================================
  // DATA FETCHING
  // ====================================================================

  // Function to fetch historical clinical data
  const fetchHistoricalData = async () => {
    if (!patientId || !isVisible) return;

    logJson("FETCH", "Fetching all historical clinical data", {
      patientId,
      noDateLimitations: true,
    });

    try {
      // Don't set loading to true here since we already have initial data to display

      // Ensure current parameters have a date
      let paramDate = clinicalParameters.date;
      if (typeof paramDate === "string") {
        paramDate = new Date(paramDate);
      } else if (!(paramDate instanceof Date)) {
        paramDate = new Date();
      }

      // Start with the current record
      const currentRecord = {
        ...clinicalParameters,
        date: paramDate,
        // Don't set isCurrent here, it will be set after all data is gathered
      };

      // Create a unique hash for current parameters
      const currentHash = getParameterHash(currentRecord);
      logJson("FETCH", "Current parameter hash generated", {
        hash: currentHash,
      });

      let updatedHistoricalData = [currentRecord];

      // ====================================================================
      // STORAGE FETCHING
      // ====================================================================

      // Try to get data from AsyncStorage first (for faster loading)
      const storageKey = `clinical_history_${patientId}`;

      try {
        logJson("STORAGE", "Fetching data from AsyncStorage", { storageKey });
        const storedData = await AsyncStorage.getItem(storageKey);

        if (storedData) {
          logJson("STORAGE", "Found stored historical data");
          let parsedData;
          try {
            parsedData = JSON.parse(storedData);
            logJson("STORAGE", "Parsed stored data", {
              recordCount: parsedData.length,
            });

            // Add extra validation to ensure we have proper date objects
            parsedData = parsedData.filter((item) => {
              if (!item || !item.date) {
                logJson("STORAGE", "Filtering out record with no date");
                return false;
              }
              // Also filter out the dummy record
              if (isDummyRecord(item.date)) {
                logJson("STORAGE", "Filtering out dummy record", {
                  date: "4/2/2025 2:44 PM",
                });
                return false;
              }
              return true;
            });

            // Ensure dates are converted to Date objects if they're strings
            parsedData = parsedData.map((item) => ({
              ...item,
              date:
                typeof item.date === "string" ? new Date(item.date) : item.date,
              // Remove any isCurrent flags as they'll be set later
              isCurrent: undefined,
            }));

            logJson("STORAGE", "Processed stored data", {
              recordCount: parsedData.length,
            });
          } catch (parseError) {
            logJson("STORAGE", "Error parsing stored data", {
              error: parseError.message,
              storedData: storedData.substring(0, 200) + "...", // Truncate for logging
            });
            // Continue with just the current record
          }

          if (parsedData && Array.isArray(parsedData)) {
            // Improved filtering logic to keep records with unique dates
            const filteredStoredData = parsedData.filter((item) => {
              if (!item.date) return false;

              // Skip the dummy record
              if (isDummyRecord(item.date)) {
                logJson("STORAGE", "Filtering out dummy record", {
                  date: "4/2/2025 2:44 PM",
                });
                return false;
              }

              // If different day, keep the record
              if (!isSameDay(item.date, currentRecord.date)) {
                return true;
              }

              // For same day entries, we'll keep the current record and filter out
              // existing records for the same day
              return false;
            });

            logJson("STORAGE", "Filtered stored data", {
              beforeFilterCount: parsedData.length,
              afterFilterCount: filteredStoredData.length,
            });

            if (filteredStoredData.length > 0) {
              updatedHistoricalData = [currentRecord, ...filteredStoredData];

              // Update UI immediately with storage data - ensuring only one current record
              logJson("UI_UPDATE", "Updating UI with storage data", {
                recordCount: updatedHistoricalData.length,
              });

              if (isMounted.current) {
                const processedData = ensureOnlyOneCurrentRecord(
                  updatedHistoricalData
                );
                setHistoricalData(processedData);
                logJson("UI_UPDATE", "UI updated with storage data");
              }
            }
          }
        } else {
          logJson("STORAGE", "No stored data found");
        }
      } catch (storageError) {
        logJson("STORAGE", "Storage error", {
          error: storageError.message,
        });
        // Continue to API fetch even if storage fails
      }

      // ====================================================================
      // API FETCHING
      // ====================================================================

      // Fetch from API (even if we already have storage data)
      try {
        logJson("API", "Fetching data from API");
        const apiUrl =
          API_ENDPOINTS.PATIENT_PROCESSOR;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify({
            action: "getPatient",
            patientId: patientId,
          }),
        });

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const responseText = await response.text();
        let result;
        try {
          result = JSON.parse(responseText);
          logJson("API", "Successfully parsed API response");
        } catch (parseError) {
          logJson("API", "Error parsing API response", {
            error: parseError.message,
            responsePreview: responseText.substring(0, 200) + "...", // Truncate for logging
          });
          throw new Error("Failed to parse API response");
        }

        // Extract data from response
        const data = result.body
          ? typeof result.body === "string"
            ? JSON.parse(result.body)
            : result.body
          : result;

        // ====================================================================
        // PROCESS CURRENT PARAMETERS FROM API
        // ====================================================================

        if (data.success && data.patient && data.patient.clinicalParameters) {
          logJson("API", "Received clinical parameters from API");

          // Process the parameters from the API
          let apiParams = data.patient.clinicalParameters;

          // Log to verify the API response
          logJson("API", "Raw clinical parameters from API", {
            parameters: apiParams,
          });

          // Convert from DynamoDB format if needed
          if (apiParams.M) {
            try {
              apiParams = unmarshallDynamoDBObject(apiParams);
              logJson("API", "Successfully converted from DynamoDB format");
            } catch (conversionError) {
              logJson("API", "Error converting from DynamoDB format", {
                error: conversionError.message,
              });
              // Continue with the unprocessed data
            }
          }

          // Ensure the API parameters have a date
          if (!apiParams.date) {
            apiParams.date = new Date();
          } else if (typeof apiParams.date === "string") {
            apiParams.date = new Date(apiParams.date);
          }

          // Skip if this is the dummy record we're trying to remove
          if (isDummyRecord(apiParams.date)) {
            logJson("API", "Skipping dummy record from API", {
              date: "4/2/2025 2:44 PM",
            });
          } else {
            // Instead of comparing exact timestamps, check if same day
            if (!isSameDay(apiParams.date, currentRecord.date)) {
              logJson("API", "Adding API data to history (different date)");
              updatedHistoricalData.push({
                ...apiParams,
                // Don't set isCurrent here, it will be properly set later
              });
            } else {
              logJson(
                "API",
                "Updating current record with API data (same date)"
              );
              // Update current record with API data if it's for the same day
              // This will make sure we keep only one entry per day
              currentRecord = {
                ...apiParams,
                date: currentRecord.date, // Keep the current timestamp
                isCurrent: true,
              };
              // Replace the first entry with the updated one
              updatedHistoricalData[0] = currentRecord;
            }
          }
        }

        // ====================================================================
        // PROCESS CLINICAL HISTORY FROM API
        // ====================================================================

        if (
          data.success &&
          data.clinicalHistory &&
          Array.isArray(data.clinicalHistory)
        ) {
          logJson("API", "Received clinical history records from API", {
            recordCount: data.clinicalHistory.length,
            retrievingAllHistory: true,
          });

          // Process each history record
          const historyRecords = data.clinicalHistory
            .map((record) => {
              // Convert from DynamoDB format if needed
              let processedRecord = record;
              if (record.M) {
                try {
                  processedRecord = unmarshallDynamoDBObject(record);
                } catch (error) {
                  logJson("API", "Error converting history record", {
                    error: error.message,
                  });
                }
              }

              // Ensure date is properly formatted
              if (!processedRecord.date) {
                processedRecord.date = new Date();
              } else if (typeof processedRecord.date === "string") {
                processedRecord.date = new Date(processedRecord.date);
              }

              return {
                ...processedRecord,
                // Don't set isCurrent here, it will be properly set later
              };
            })
            // Filter out dummy records
            .filter((record) => !isDummyRecord(record.date));

          logJson("API", "Processed history records", {
            recordCount: historyRecords.length,
          });

          // Filter history records to avoid duplicates by date
          const uniqueHistoryRecords = historyRecords.filter((record) => {
            // For each history record, check if there's already a record for the same day
            return !updatedHistoricalData.some((existingRecord) =>
              isSameDay(existingRecord.date, record.date)
            );
          });

          logJson("API", "Identified unique history records", {
            totalCount: historyRecords.length,
            uniqueCount: uniqueHistoryRecords.length,
          });

          if (uniqueHistoryRecords.length > 0) {
            logJson("API", "Adding unique history records", {
              count: uniqueHistoryRecords.length,
            });
            updatedHistoricalData = [
              ...updatedHistoricalData,
              ...uniqueHistoryRecords,
            ];
          }
        }

        // ====================================================================
        // FINAL DATA PROCESSING AND STORAGE
        // ====================================================================

        // Final filter to ensure no dummy records
        updatedHistoricalData = updatedHistoricalData.filter(
          (record) => !isDummyRecord(record.date)
        );
        logJson("DATA_PROCESSING", "Final filtered data", {
          recordCount: updatedHistoricalData.length,
        });

        // Ensure only one record is marked as current before saving to storage
        const processedDataForStorage = ensureOnlyOneCurrentRecord(
          updatedHistoricalData
        );

        // Save to storage for next time
        try {
          await AsyncStorage.setItem(
            storageKey,
            JSON.stringify(processedDataForStorage)
          );
          logJson("STORAGE", "Saved historical data to AsyncStorage", {
            recordCount: processedDataForStorage.length,
          });
        } catch (saveError) {
          logJson("STORAGE", "Error saving to AsyncStorage", {
            error: saveError.message,
          });
        }

        // Ensure we have at least the current record for display and properly mark current
        const finalData = ensureDemonstrationData(updatedHistoricalData);
        logJson("DATA_PROCESSING", "Final data prepared", {
          recordCount: finalData.length,
        });

        // Update UI with final data
        if (isMounted.current) {
          setHistoricalData(finalData);
          logJson("UI_UPDATE", "Updated UI with final data");
        }
      } catch (apiError) {
        logJson("API", "API error occurred", {
          error: apiError.message,
        });

        // If API call failed, ensure we still have some data to show
        const fallbackData = ensureDemonstrationData(updatedHistoricalData);

        if (isMounted.current) {
          setHistoricalData(fallbackData);
          logJson("UI_UPDATE", "Updated UI with fallback data", {
            recordCount: fallbackData.length,
          });

          // Only set error if we have no data at all
          if (fallbackData.length === 0) {
            setError("Failed to load data. Please try again.");
            logJson("ERROR", "Set error state", {
              message: "Failed to load data",
            });
          }
        }
      }
    } catch (error) {
      logJson("ERROR", "Error in fetchHistoricalData", {
        error: error.message,
      });

      // Only set error if we don't already have data
      if (historicalData.length === 0 && isMounted.current) {
        setError("Failed to load clinical parameters. Please try again.");
        logJson("ERROR", "Set error state", {
          message: "Failed to load clinical parameters",
        });
      }

      // Ensure we at least have current data
      if (clinicalParameters && isMounted.current) {
        const currentRecord = {
          ...clinicalParameters,
          date: clinicalParameters.date || new Date(),
        };
        const fallbackData = ensureDemonstrationData([currentRecord]);
        setHistoricalData(fallbackData);
        logJson("UI_UPDATE", "Set minimal fallback data", {
          recordCount: fallbackData.length,
        });
      }
    } finally {
      // Always ensure loading is set to false when we're done
      if (isMounted.current) {
        setIsLoading(false);
        logJson("LOADING", "Set loading state to false");
      }
    }
  };

  // ====================================================================
  // RENDERING
  // ====================================================================

  // Function to render transposed table with parameters as rows and dates as columns
  const renderTransposedTable = () => {
    // Filter out the dummy record from historicalData before rendering
    const displayData = historicalData.filter(
      (record) => !isDummyRecord(record.date)
    );

    logJson("RENDER", "Rendering transposed table", {
      recordCount: displayData.length,
      showingAllHistory: true,
    });

    // Sort dates from newest to oldest - making sure we show ALL historical dates
    const sortedData = [...displayData].sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    // Handle synced scrolling
    const handleParamScrollSync = (event) => {
      // Skip if this is a programmatic scroll
      if (isParamScrolling.current) return;

      if (valuesScrollViewRef.current) {
        isValuesScrolling.current = true; // Set flag before scrolling
        valuesScrollViewRef.current.scrollTo({
          y: event.nativeEvent.contentOffset.y,
          animated: false,
        });

        // Reset the flag after a short delay to ensure the scroll completes
        setTimeout(() => {
          isValuesScrolling.current = false;
        }, 10);
      }
    };

    const handleValuesScrollSync = (event) => {
      // Skip if this is a programmatic scroll
      if (isValuesScrolling.current) return;

      if (paramNamesScrollViewRef.current) {
        isParamScrolling.current = true; // Set flag before scrolling
        paramNamesScrollViewRef.current.scrollTo({
          y: event.nativeEvent.contentOffset.y,
          animated: false,
        });

        // Reset the flag after a short delay to ensure the scroll completes
        setTimeout(() => {
          isParamScrolling.current = false;
        }, 10);
      }
    };

    return (
      <View style={styles.tableWrapper}>
        <View style={styles.viewToggle}>
          <Text style={styles.viewToggleText}>
            Showing all clinical parameters
          </Text>
        </View>

        {/* Table with fixed parameter column and scrollable values */}
        <View style={styles.tableContainer}>
          {/* Fixed Column Section */}
          <View style={styles.fixedColumnContainer}>
            {/* Fixed header cell */}
            <View style={styles.tableHeaderRow}>
              <Text
                style={[
                  styles.tableHeaderCell,
                  styles.fixedHeaderCell,
                  { fontSize: 13 }, // Increased font size by one point
                ]}
              >
                Clinical Parameters
              </Text>
            </View>

            {/* Fixed parameter names column */}
            <ScrollView
              ref={paramNamesScrollViewRef}
              style={styles.tableBodyScroll}
              showsVerticalScrollIndicator={false}
              onScroll={handleParamScrollSync}
              scrollEventThrottle={16}
            >
              {PARAMETER_CONFIG.map((param, rowIndex) => (
                <View
                  key={`param-${param.key}`}
                  style={[
                    styles.tableRow,
                    rowIndex % 2 === 0
                      ? styles.tableRowEven
                      : styles.tableRowOdd,
                  ]}
                >
                  <Text style={styles.paramNameCell}>{param.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Scrollable Values Section */}
          <View style={styles.scrollableSection}>
            {/* Horizontal ScrollView for dates and values */}
            <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
              <View>
                {/* Date headers */}
                <View style={styles.tableHeaderRow}>
                  {sortedData.map((record, index) => (
                    <View
                      key={`date-${index}`}
                      style={[
                        styles.tableHeaderDateCell,
                        record.isCurrent && styles.currentHeaderCell,
                      ]}
                    >
                      <Text style={styles.tableHeaderText}>
                        {formatDate(record.date)}
                      </Text>
                      {record.isCurrent && (
                        <Text style={styles.currentHeaderLabel}>(Current)</Text>
                      )}
                    </View>
                  ))}
                </View>

                {/* Values for parameters */}
                <ScrollView
                  ref={valuesScrollViewRef}
                  style={styles.tableBodyScroll}
                  showsVerticalScrollIndicator={true}
                  onScroll={handleValuesScrollSync}
                  scrollEventThrottle={16}
                >
                  {PARAMETER_CONFIG.map((param, rowIndex) => (
                    <View
                      key={`values-${param.key}`}
                      style={[
                        styles.tableRow,
                        rowIndex % 2 === 0
                          ? styles.tableRowEven
                          : styles.tableRowOdd,
                      ]}
                    >
                      {sortedData.map((record, colIndex) => (
                        <Text
                          key={`value-${rowIndex}-${colIndex}`}
                          style={[
                            styles.tableCell,
                            record.isCurrent && styles.currentDataCell,
                          ]}
                        >
                          {record[param.key] || "-"}
                        </Text>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    );
  };

  // Add debug console log to show render state
  logJson("RENDER", "Final render state", {
    recordCount: historicalData.length,
    isLoading,
    hasError: error !== null,
  });

  // ====================================================================
  // COMPONENT RETURN
  // ====================================================================

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Clinical Parameters History</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="#4A5568" />
              </TouchableOpacity>
            </View>

            {/* Info Text */}
            <Text style={styles.infoText}>
              Displaying current values (highlighted in yellow) and ALL previous
              measurements for comparison. Scroll horizontally to see older
              dates.
            </Text>

            {/* Main Content Area - Fixed height with internal scrolling */}
            <View style={styles.mainContentArea}>
              {isLoading && !initialLoadComplete ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#4299E1" />
                  <Text style={styles.loadingText}>Loading data...</Text>
                </View>
              ) : error && historicalData.length === 0 ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={40} color="#E53E3E" />
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                      setIsLoading(true);
                      setError(null);
                      fetchHistoricalData();
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : historicalData.length > 0 ? (
                // Use the transposed table rendering
                renderTransposedTable()
              ) : (
                <View style={styles.noDataContainer}>
                  <Ionicons
                    name="document-text-outline"
                    size={40}
                    color="#A0AEC0"
                  />
                  <Text style={styles.noDataText}>
                    No clinical data available
                  </Text>
                </View>
              )}
            </View>

            {/* Fixed Footer Button */}
            <TouchableOpacity style={styles.closeModalButton} onPress={onClose}>
              <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// ====================================================================
// STYLES
// ====================================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxHeight: "90%",
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
    paddingBottom: 8,
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
  infoText: {
    fontSize: 12,
    color: "#4A5568",
    marginBottom: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  mainContentArea: {
    height: 350, // Increased height to accommodate more parameters and provide better view
    marginBottom: 12,
  },
  tableWrapper: {
    flex: 1,
  },
  viewToggle: {
    backgroundColor: "#E6FFFA",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 8,
    alignItems: "center",
  },
  viewToggleText: {
    color: "#2C7A7B",
    fontSize: 12,
    fontWeight: "500",
  },
  // New styles for fixed column layout
  tableContainer: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
  },
  fixedColumnContainer: {
    width: 100, // Width of the fixed parameter column
    borderRightWidth: 2,
    borderRightColor: "#CBD5E0",
    zIndex: 1, // Ensure it appears above scrollable content
    backgroundColor: "#F7FAFC", // Slightly different background to visually separate
  },
  scrollableSection: {
    flex: 1,
  },
  fixedHeaderCell: {
    backgroundColor: "#EBF8FF",
    width: 100,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#EBF8FF",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#BEE3F8",
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2C5282",
    textAlign: "left",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tableHeaderDateCell: {
    width: 100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderLeftWidth: 1,
    borderLeftColor: "#BEE3F8",
    justifyContent: "center",
    alignItems: "center",
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2C5282",
    textAlign: "center",
  },
  currentHeaderCell: {
    backgroundColor: "#FEFCBF", // Light yellow background
  },
  currentHeaderLabel: {
    fontSize: 10,
    fontStyle: "italic",
    color: "#DD6B20",
    textAlign: "center",
  },
  tableBodyScroll: {
    height: 280, // Increased height for the table body to show more parameters at once
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 44,
    alignItems: "center",
  },
  tableRowEven: {
    backgroundColor: "#F9FAFB",
  },
  tableRowOdd: {
    backgroundColor: "#FFFFFF",
  },
  paramNameCell: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2D3748",
    textAlign: "left",
    paddingHorizontal: 8,
    paddingVertical: 12,
    width: 100,
  },
  tableCell: {
    fontSize: 13,
    color: "#4A5568",
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    width: 100,
    borderLeftWidth: 1,
    borderLeftColor: "#E2E8F0",
  },
  currentDataCell: {
    backgroundColor: "#FEFCBF", // Light yellow background
  },
  currentLabel: {
    fontSize: 10,
    fontStyle: "italic",
    color: "#DD6B20",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#4A5568",
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    textAlign: "center",
    marginTop: 10,
    marginBottom: 15,
    color: "#E53E3E",
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: "#4299E1",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  noDataContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  noDataText: {
    textAlign: "center",
    marginTop: 10,
    color: "#718096",
    fontSize: 14,
    fontStyle: "italic",
  },
  closeModalButton: {
    backgroundColor: "#4299E1",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 0,
  },
  closeModalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
});

export default ViewParametersModal;
