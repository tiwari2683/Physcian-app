import React, { useState } from "react";
import { API_ENDPOINTS } from "../../Config";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  AlertButton,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  showPrescriptionGenerator,
  generatePrescriptionDirectly,
} from "./generateprescription";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";

// Type definitions
interface Medication {
  name: string;
  duration: string;
  timing: string;
  timingValues: string;
  unit: string;
  specialInstructions: string;
  datePrescribed: string;
}

interface MedicationCardProps {
  med: Medication;
  index: number;
  updateMedication: (index: number, field: string, value: any) => void;
  removeMedication: (index: number) => void;
  medications: Medication[];
  isCompressed?: boolean;
  toggleExpand?: (index: number) => void;
  prescriptionDate?: string | Date | null;
  isNewPrescription?: boolean;
}

interface MedicationGroupProps {
  date: string | Date;
  medications: Medication[];
  updateMedication: (index: number, field: string, value: any) => void;
  removeMedication: (index: number) => void;
  allMedications: Medication[];
  expandedGroups: string[];
  toggleExpandGroup: (date: string) => void;
  isNewPrescription?: boolean;
  newPrescriptionIndices: number[];
  setMedications: (meds: Medication[]) => void;
  onEditMedication: (medication: Medication, index: number) => void;
  onAddMedicationToGroup: (date: string | Date) => void;
  patient: any;
}

interface PrescriptionTabProps {
  patientData: any;
  patient: any;
  medications: Medication[];
  setMedications: React.Dispatch<React.SetStateAction<Medication[]>>;
  expandedMedications: number[];
  setExpandedMedications: React.Dispatch<React.SetStateAction<number[]>>;
  expandedGroups: string[];
  setExpandedGroups: React.Dispatch<React.SetStateAction<string[]>>;
  newPrescriptionIndices: number[];
  setNewPrescriptionIndices: React.Dispatch<React.SetStateAction<number[]>>;
  reportFiles: any[];
  handleSubmit: (selectedMedications?: Medication[]) => void;
  isSubmitting: boolean;
  getSubmitButtonText: () => string;
  prefillMode: boolean;
  initialTab?: string;
  permanentPatientId?: string;
  tempPatientId?: string;
}

interface ReportsModalProps {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  patientData: any;
  reportFiles: any[];
}

interface HistoryModalProps {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  patientData: any;
}

interface EnhancedDiagnosisModalProps {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  diagnosisData: {
    currentDiagnosis: string;
    diagnosisHistory: any[];
    advisedInvestigations: string;
  };
  isLoading: boolean;
}


// Common medications list with integrated units
const commonMedications = [
  "Amlodipine 5mg (BP)",
  "Amlodipine 10mg (BP)",
  "Atenolol 25mg (BP)",
  "Atenolol 50mg (BP)",
  "Lisinopril 5mg (BP)",
  "Lisinopril 10mg (BP)",
  "Metformin 500mg (Diabetes)",
  "Metformin 850mg (Diabetes)",
  "Insulin 100IU/ml (Diabetes)",
  "Glimepiride 1mg (Diabetes)",
  "Glimepiride 2mg (Diabetes)",
  "Amoxicillin 250mg (Antibiotic)",
  "Amoxicillin 500mg (Antibiotic)",
  "Paracetamol 500mg (Pain/Fever)",
  "Ibuprofen 400mg (Pain/Inflammation)",
  "Omeprazole 20mg (Gastritis)",
  "Azithromycin 250mg (Antibiotic)",
  "Azithromycin 500mg (Antibiotic)",
  "Hydrochlorothiazide 25mg (BP)",
  "Losartan 50mg (BP)",
];

// Timing options
const timingOptions = [
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening", label: "Evening" },
  { id: "night", label: "Night" },
];

// Helper function to check if a date is today
const isDateToday = (dateString: string | Date | null | undefined): boolean => {
  if (!dateString) return false;

  const date = new Date(dateString);
  const today = new Date();

  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

// Dropdown component for reuse across the form
const Dropdown = ({
  label,
  options,
  selectedValue,
  onSelect,
  placeholder = "Select an option",
}: {
  label: string;
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder?: string;
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
      >
        <Text
          style={[
            styles.dropdownButtonText,
            !selectedValue && styles.placeholderText,
          ]}
        >
          {selectedValue || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#4A5568" />
      </TouchableOpacity>

      <Modal
        transparent={true}
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{`Select ${label}`}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#2D3748" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    selectedValue === item && styles.selectedOption,
                  ]}
                  onPress={() => {
                    onSelect(item);
                    setModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedValue === item && styles.selectedOptionText,
                    ]}
                  >
                    {item}
                  </Text>
                  {selectedValue === item && (
                    <Ionicons name="checkmark" size={20} color="#0070D6" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.optionsList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

// TimingSelector component for dosage timing with input fields
const TimingSelector = ({
  timings,
  selectedTimings,
  onToggle,
  timingValues,
  onTimingValueChange,
}: {
  timings: { id: string; label: string }[];
  selectedTimings: string[];
  onToggle: (id: string) => void;
  timingValues: { [key: string]: string };
  onTimingValueChange: (id: string, value: string) => void;
}) => {
  return (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>Timing & Dosage</Text>
      <View style={styles.timingContainer}>
        {timings.map((timing) => (
          <View key={timing.id} style={styles.timingItemContainer}>
            <TouchableOpacity
              style={[
                styles.timingButton,
                selectedTimings.includes(timing.id) &&
                styles.timingButtonSelected,
              ]}
              onPress={() => onToggle(timing.id)}
            >
              <Text
                style={[
                  styles.timingButtonText,
                  selectedTimings.includes(timing.id) &&
                  styles.timingButtonTextSelected,
                ]}
              >
                {timing.label}
              </Text>
            </TouchableOpacity>

            {selectedTimings.includes(timing.id) && (
              <TextInput
                style={styles.timingInput}
                value={timingValues[timing.id] || ""}
                onChangeText={(text) => onTimingValueChange(timing.id, text)}
                placeholder="Qty"
                keyboardType="numeric"
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

const MedicationCard: React.FC<MedicationCardProps> = ({
  med,
  index,
  updateMedication,
  removeMedication,
  medications,
  isCompressed = false,
  toggleExpand = (index: number) => { },
  prescriptionDate = null, // Add prescription date parameter with fallback
  isNewPrescription = false, // Prop to indicate if this is a new prescription
}) => {
  // Local state for selected timings
  const [selectedTimings, setSelectedTimings] = useState<string[]>(
    med.timing ? med.timing.split(",") : []
  );

  // Local state for timing values
  const [timingValues, setTimingValues] = useState<{ [key: string]: string }>(
    med.timingValues ? JSON.parse(med.timingValues) : {}
  );

  // Check if prescription has been filled (using the presence of a name and timing)
  // Convert to explicit boolean to avoid type issues
  const hasName = typeof med.name === "string" && med.name.trim() !== "";
  const hasTiming = typeof med.timing === "string" && med.timing.trim() !== "";
  const isPrescriptionFilled = Boolean(hasName && hasTiming);

  // Format the prescription date to display in a readable format
  const formatDate = (dateString: string | Date): string => {
    if (!dateString) return "Not specified";

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return "Invalid date";
    }
  };

  // Get the date to display - use medication's date if available, otherwise use prescription date
  const displayDate = med.datePrescribed || prescriptionDate;
  const formattedDate = displayDate ? formatDate(displayDate as string | Date) : "Not specified";

  // Calculate remaining days function
  const calculateRemainingDays = (prescriptionDate: string | Date, duration: string): { expirationDate: Date; remainingDays: number } | null => {
    // Check if we have valid inputs
    if (!prescriptionDate || !duration) return null;

    // Parse the duration string (e.g., "7 days", "2 weeks", "1 month")
    const durationRegex = /(\d+)\s*(day|days|week|weeks|month|months)/i;
    const match = duration.match(durationRegex);

    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    // Calculate expiration date based on prescribed date and duration
    const startDate = new Date(prescriptionDate);
    let expirationDate = new Date(startDate);

    switch (unit) {
      case "day":
      case "days":
        expirationDate.setDate(startDate.getDate() + amount);
        break;
      case "week":
      case "weeks":
        expirationDate.setDate(startDate.getDate() + amount * 7);
        break;
      case "month":
      case "months":
        expirationDate.setMonth(startDate.getMonth() + amount);
        break;
      default:
        return null;
    }

    // Calculate days between now and expiration date
    const currentDate = new Date();
    const diffTime = expirationDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      expirationDate,
      remainingDays: diffDays,
    };
  };

  // Toggle timing selection
  const toggleTiming = (id: string) => {
    const newTimings = selectedTimings.includes(id)
      ? selectedTimings.filter((t) => t !== id)
      : [...selectedTimings, id];

    setSelectedTimings(newTimings);

    // Update the medication object with comma-separated timing values
    const timingString = newTimings.join(",");
    updateMedication(index, "timing", timingString);

    // If we're removing a timing, clean up its value
    if (!newTimings.includes(id) && timingValues[id]) {
      const newTimingValues = { ...timingValues };
      delete newTimingValues[id];
      setTimingValues(newTimingValues);
      updateMedication(index, "timingValues", JSON.stringify(newTimingValues));
    }
  };

  // Handle changing timing value
  const handleTimingValueChange = (id: string, value: string) => {
    const newTimingValues = { ...timingValues, [id]: value };
    setTimingValues(newTimingValues);
    updateMedication(index, "timingValues", JSON.stringify(newTimingValues));
  };

  // Get timing display text for compressed view
  const getTimingDisplayText = () => {
    if (selectedTimings.length === 0) return "Not specified";

    return selectedTimings
      .map((id) => {
        const timing = timingOptions.find((t) => t.id === id);
        const value = timingValues[id] || "";
        return value ? `${timing?.label}: ${value}` : timing?.label;
      })
      .join(", ");
  };

  // Expiration Status Component
  const ExpirationStatus = () => {
    // Calculate remaining days
    const expiration = displayDate && med.duration
      ? calculateRemainingDays(displayDate as string | Date, med.duration)
      : null;

    if (!expiration) return null;

    const { expirationDate, remainingDays } = expiration;

    // Format expiration date
    const formattedExpirationDate = expirationDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    // Determine status color based on remaining days
    let statusColor = "#4CAF50"; // Green
    let statusText = "Active";

    if (remainingDays < 0) {
      statusColor = "#E53935"; // Red
      statusText = "Expired";
    } else if (remainingDays <= 3) {
      statusColor = "#FF9800"; // Orange
      statusText = "Expiring Soon";
    }

    return (
      <View style={styles.expirationContainer}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
        <Text style={styles.expirationText}>
          {remainingDays >= 0
            ? `Expires in ${remainingDays} day${remainingDays !== 1 ? "s" : ""
            } (${formattedExpirationDate})`
            : `Expired ${Math.abs(remainingDays)} day${Math.abs(remainingDays) !== 1 ? "s" : ""
            } ago (${formattedExpirationDate})`}
        </Text>
      </View>
    );
  };

  // If displaying in compressed mode
  if (isCompressed) {
    return (
      <TouchableOpacity
        style={[
          styles.medicationCardCompressed,
          isNewPrescription && styles.newPrescriptionCard, // Apply special style for new prescriptions
        ]}
        onPress={() => (isPrescriptionFilled ? null : toggleExpand(index))}
        disabled={isPrescriptionFilled}
      >
        {/* Badge for new prescription */}
        {isNewPrescription && (
          <View style={styles.newPrescriptionBadge}>
            <Text style={styles.newPrescriptionBadgeText}>New</Text>
          </View>
        )}

        <View style={styles.medicationHeader}>
          <View style={styles.medicationTitleContainer}>
            <Text style={styles.medicationTitle}>
              {med.name || `Medication ${index + 1}`}
            </Text>
            {/* Date is now displayed next to the medication name */}
            <Text style={styles.medicationDate}>{formattedDate}</Text>
          </View>
          {medications.length > 1 &&
            !isPrescriptionFilled &&
            isDateToday(med.datePrescribed) && (
              <TouchableOpacity onPress={() => removeMedication(index)}>
                <Ionicons name="trash-outline" size={20} color="#E53935" />
              </TouchableOpacity>
            )}
        </View>

        {/* Move the expiration status directly below the medication header */}
        {med.duration && (
          <View style={styles.statusBelowNameContainer}>
            <ExpirationStatus />
          </View>
        )}

        <View style={styles.compressedContent}>
          <View style={styles.compressedRow}>
            <Text style={styles.compressedLabel}>Timing:</Text>
            <Text style={styles.compressedValue}>{getTimingDisplayText()}</Text>
          </View>

          {med.duration && (
            <View style={styles.compressedRow}>
              <Text style={styles.compressedLabel}>Duration:</Text>
              <Text style={styles.compressedValue}>{med.duration}</Text>
            </View>
          )}

          {/* Add special instructions to compressed view */}
          {med.specialInstructions && (
            <View style={styles.compressedRow}>
              <Text style={styles.compressedLabel}>Instructions:</Text>
              <Text style={styles.compressedValue}>
                {med.specialInstructions}
              </Text>
            </View>
          )}
        </View>

        {/* Only show "Tap to edit" if prescription hasn't been filled yet and is from today */}
        {!isPrescriptionFilled && isDateToday(med.datePrescribed) && (
          <View style={styles.expandButtonContainer}>
            <Text style={styles.expandButtonText}>Tap to edit</Text>
            <Ionicons name="chevron-down" size={16} color="#0070D6" />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // Original expanded view - also updated to show medication name
  return (
    <View
      style={[
        styles.medicationCard,
        isNewPrescription && styles.newPrescriptionCard,
      ]}
    >
      {/* Badge for new prescription in expanded view */}
      {isNewPrescription && (
        <View style={styles.newPrescriptionBadge}>
          <Text style={styles.newPrescriptionBadgeText}>New</Text>
        </View>
      )}

      <View style={styles.medicationHeader}>
        <View style={styles.medicationTitleContainer}>
          <Text style={styles.medicationTitle}>
            {med.name || `Medication ${index + 1}`}
          </Text>
          {/* Date is now displayed next to the medication name */}
          <Text style={styles.medicationDate}>{formattedDate}</Text>
        </View>
        {medications.length > 1 &&
          !isPrescriptionFilled &&
          isDateToday(med.datePrescribed) && (
            <TouchableOpacity onPress={() => removeMedication(index)}>
              <Ionicons name="trash-outline" size={20} color="#E53935" />
            </TouchableOpacity>
          )}
      </View>

      {/* Move expiration status directly below medication header */}
      {med.duration && (
        <View style={styles.statusBelowNameContainer}>
          <ExpirationStatus />
        </View>
      )}

      {/* Medication Name Dropdown */}
      <Dropdown
        label="Medication Name"
        options={commonMedications}
        selectedValue={med.name}
        onSelect={(value) => updateMedication(index, "name", value)}
        placeholder="Select medication"
      />

      {/* Timing Selector with input fields */}
      <TimingSelector
        timings={timingOptions}
        selectedTimings={selectedTimings}
        onToggle={toggleTiming}
        timingValues={timingValues}
        onTimingValueChange={handleTimingValueChange}
      />

      {/* Duration */}
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>Duration</Text>
        <TextInput
          style={styles.textInput}
          value={med.duration}
          onChangeText={(text) => updateMedication(index, "duration", text)}
          placeholder="e.g., 7 days"
        />
      </View>

      {/* Special Instructions for this medication */}
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>Special Instructions</Text>
        <TextInput
          style={styles.textArea}
          value={med.specialInstructions}
          onChangeText={(text) =>
            updateMedication(index, "specialInstructions", text)
          }
          placeholder="Enter specific instructions for this medication"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Compress button */}
      <TouchableOpacity
        style={styles.compressButtonContainer}
        onPress={() => toggleExpand(index)}
      >
        <Text style={styles.compressButtonText}>Show less</Text>
        <Ionicons name="chevron-up" size={16} color="#718096" />
      </TouchableOpacity>
    </View>
  );
};

// Updated MedicationGroupCard component with individual medication expiration status
const MedicationGroupCard: React.FC<MedicationGroupProps> = ({
  date,
  medications,
  updateMedication,
  removeMedication,
  allMedications,
  expandedGroups,
  toggleExpandGroup,
  isNewPrescription = false,
  newPrescriptionIndices,
  setMedications,
  onEditMedication, // New prop for handling edit medication
  onAddMedicationToGroup, // New prop for handling add to this prescription
  patient, // Added patient data for prescription generation
}) => {
  // Format the date to display in a readable format
  const formatDate = (dateString: string | Date): string => {
    if (!dateString) return "Not specified";

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return "Invalid date";
    }
  };

  const formattedDate = formatDate(date);
  const isExpanded = expandedGroups.includes(typeof date === 'string' ? date : date.toISOString().split('T')[0]);

  // Add this check to determine if this prescription group is from today
  const isPrescriptionFromToday = isDateToday(date);

  // Determine if any medication in this group is a new prescription
  const isAnyMedicationNew = medications.some((med) =>
    newPrescriptionIndices.includes(allMedications.indexOf(med))
  );

  // Calculate expiration status for a single medication
  const calculateMedicationExpiration = (prescriptionDate: string | Date, duration: string): {
    expirationDate: Date;
    remainingDays: number;
    statusColor: string;
    statusText: string;
    formattedExpirationDate: string;
  } | null => {
    // Check if we have valid inputs
    if (!prescriptionDate || !duration) return null;

    // Parse the duration string (e.g., "7 days", "2 weeks", "1 month")
    const durationRegex = /(\d+)\s*(day|days|week|weeks|month|months)/i;
    const match = duration.match(durationRegex);

    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    // Calculate expiration date based on prescribed date and duration
    const startDate = new Date(prescriptionDate);
    let expirationDate = new Date(startDate);

    switch (unit) {
      case "day":
      case "days":
        expirationDate.setDate(startDate.getDate() + amount);
        break;
      case "week":
      case "weeks":
        expirationDate.setDate(startDate.getDate() + amount * 7);
        break;
      case "month":
      case "months":
        expirationDate.setMonth(startDate.getMonth() + amount);
        break;
      default:
        return null;
    }

    // Calculate days between now and expiration date
    const currentDate = new Date();
    const diffTime = expirationDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Determine status
    let statusColor = "#4CAF50"; // Green
    let statusText = "Active";

    if (diffDays < 0) {
      statusColor = "#E53935"; // Red
      statusText = "Expired";
    } else if (diffDays <= 3) {
      statusColor = "#FF9800"; // Orange
      statusText = "Expiring Soon";
    }

    return {
      expirationDate,
      remainingDays: diffDays,
      statusColor,
      statusText,
      formattedExpirationDate: expirationDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    };
  };

  // New function to handle generating prescription for this group
  const handleGroupGeneratePrescription = async () => {
    if (medications.length === 0) {
      Alert.alert(
        "No Medications",
        "There are no medications for this date to generate a prescription."
      );
      return;
    }

    // Set up the file name
    const fileName = `Prescription_${patient.name.replace(
      /\s+/g,
      "_"
    )}_${new Date(date)
      .toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
      .replace(/,/g, "")
      .replace(/\s+/g, "_")}`;

    // Check if diagnosis or advised investigations exist
    const hasDiagnosis =
      patient.diagnosis && patient.diagnosis.trim().length > 0;
    const hasAdvisedInvestigations =
      patient.advisedInvestigations &&
      patient.advisedInvestigations.trim().length > 0;

    // If neither exists, just generate the prescription with medications only
    if (!hasDiagnosis && !hasAdvisedInvestigations) {
      generateGroupPrescriptionWithOptions(
        medications,
        date,
        false,
        false,
        fileName
      );
      return;
    }

    // Create options for selection
    const options: AlertButton[] = [];

    if (hasDiagnosis && hasAdvisedInvestigations) {
      options.push(
        {
          text: "Include Both",
          onPress: () =>
            generateGroupPrescriptionWithOptions(
              medications,
              date,
              true,
              true,
              fileName
            ),
        },
        {
          text: "Diagnosis Only",
          onPress: () =>
            generateGroupPrescriptionWithOptions(
              medications,
              date,
              true,
              false,
              fileName
            ),
        },
        {
          text: "Investigations Only",
          onPress: () =>
            generateGroupPrescriptionWithOptions(
              medications,
              date,
              false,
              true,
              fileName
            ),
        }
      );
    } else if (hasDiagnosis) {
      options.push({
        text: "Include Diagnosis",
        onPress: () =>
          generateGroupPrescriptionWithOptions(
            medications,
            date,
            true,
            false,
            fileName
          ),
      });
    } else if (hasAdvisedInvestigations) {
      options.push({
        text: "Include Investigations",
        onPress: () =>
          generateGroupPrescriptionWithOptions(
            medications,
            date,
            false,
            true,
            fileName
          ),
      });
    }

    // Always add the medications-only option
    options.push({
      text: "Medications Only",
      onPress: () =>
        generateGroupPrescriptionWithOptions(
          medications,
          date,
          false,
          false,
          fileName
        ),
    });

    // Add cancel option
    options.push({ text: "Cancel", style: "cancel" });

    // Show the alert with options
    Alert.alert(
      "Generate Prescription",
      "Select what information to include in the prescription:",
      options
    );
  };

  // Function to generate group prescription with selected options
  const generateGroupPrescriptionWithOptions = async (
    meds: Medication[],
    prescriptionDate: string | Date,
    includeDiagnosis: boolean,
    includeInvestigations: boolean,
    fileName: string
  ) => {
    try {
      // Create a copy of the patient data
      const prescriptionPatient = {
        ...patient,
        name: patient.name,
        age: patient.age,
        sex: patient.sex,
        patientId: patient?.patientId || "New Patient",
        // Only include diagnosis if selected
        diagnosis: includeDiagnosis ? patient.diagnosis : "",
        // Only include advised investigations if selected
        advisedInvestigations: includeInvestigations
          ? patient.advisedInvestigations
          : "",
      };

      // Generate the prescription
      const result = await generatePrescriptionDirectly(
        prescriptionPatient,
        meds,
        typeof prescriptionDate === 'string' ? prescriptionDate : prescriptionDate.toISOString(),
        undefined, // Use default doctor info
        patient.prescription, // Use prescription text as additional notes
        fileName
      );

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to generate prescription");
      }
    } catch (error) {
      console.error("Error generating prescription:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred while generating the prescription."
      );
    }
  };

  // If showing in compressed mode
  if (!isExpanded) {
    return (
      <TouchableOpacity
        style={[
          styles.medicationGroupCard,
          isAnyMedicationNew && styles.newPrescriptionCard,
        ]}
        onPress={() => toggleExpandGroup(typeof date === 'string' ? date : date.toISOString().split('T')[0])}
      >
        {/* Badge for new prescription */}
        {isAnyMedicationNew && (
          <View style={styles.newPrescriptionBadge}>
            <Text style={styles.newPrescriptionBadgeText}>New</Text>
          </View>
        )}

        {/* Badge for today's prescription */}
        {isPrescriptionFromToday && (
          <View style={styles.todayPrescriptionBadge}>
            <Text style={styles.todayPrescriptionBadgeText}>Today</Text>
          </View>
        )}

        {/* Header with date */}
        <View style={styles.medicationGroupHeader}>
          <View style={styles.medicationTitleContainer}>
            <Text style={styles.medicationGroupTitle}>
              Prescription: {formattedDate}
            </Text>
            <Text style={styles.medicationCount}>
              {medications.length} medication
              {medications.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Generate button for group */}
          <TouchableOpacity
            style={styles.groupGenerateButton}
            onPress={handleGroupGeneratePrescription}
          >
            <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
            <Text style={styles.groupGenerateButtonText}>Generate</Text>
          </TouchableOpacity>
        </View>

        {/* Medication list in compressed view - now with individual status for each */}
        <View style={styles.medicationList}>
          {medications.map((med, idx) => {
            const expirationStatus = calculateMedicationExpiration(
              med.datePrescribed,
              med.duration
            );

            return (
              <View key={idx} style={styles.medicationItem}>
                <View style={styles.medicationItemHeader}>
                  <Text style={styles.medicationName}>
                    {med.name || `Medication ${idx + 1}`}
                  </Text>
                </View>

                {/* Place status directly below medication name */}
                {expirationStatus && (
                  <View style={styles.statusBelowNameContainer}>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: expirationStatus.statusColor },
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {expirationStatus.statusText}
                      </Text>
                    </View>
                    <Text style={styles.expirationText}>
                      {expirationStatus.remainingDays >= 0
                        ? `${expirationStatus.remainingDays} day${expirationStatus.remainingDays !== 1 ? "s" : ""
                        }`
                        : `${Math.abs(expirationStatus.remainingDays)} day${Math.abs(expirationStatus.remainingDays) !== 1
                          ? "s"
                          : ""
                        } ago`}
                    </Text>
                  </View>
                )}

                <Text style={styles.medicationDetails}>
                  {med.timing && `${med.timing.split(",").join(", ")} • `}
                  {med.duration || "Duration not specified"}
                  {med.specialInstructions && `• Special instructions provided`}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Expand button */}
        <View style={styles.expandButtonContainer}>
          <Text style={styles.expandButtonText}>Tap to see details</Text>
          <Ionicons name="chevron-down" size={16} color="#0070D6" />
        </View>
      </TouchableOpacity>
    );
  }

  // Expanded view
  return (
    <View
      style={[
        styles.medicationGroupCardExpanded,
        isAnyMedicationNew && styles.newPrescriptionCard,
      ]}
    >
      {/* Badge for new prescription */}
      {isAnyMedicationNew && (
        <View style={styles.newPrescriptionBadge}>
          <Text style={styles.newPrescriptionBadgeText}>New</Text>
        </View>
      )}

      {/* Badge for today's prescription */}
      {isPrescriptionFromToday && (
        <View style={styles.todayPrescriptionBadge}>
          <Text style={styles.todayPrescriptionBadgeText}>Today</Text>
        </View>
      )}

      {/* Header with date */}
      <View style={styles.medicationGroupHeader}>
        <View style={styles.medicationTitleContainer}>
          <Text style={styles.medicationGroupTitle}>
            Prescription: {formattedDate}
          </Text>
          <Text style={styles.medicationCount}>
            {medications.length} medication{medications.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Generate button for expanded group */}
        <TouchableOpacity
          style={styles.groupGenerateButton}
          onPress={handleGroupGeneratePrescription}
        >
          <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
          <Text style={styles.groupGenerateButtonText}>Generate</Text>
        </TouchableOpacity>
      </View>

      {/* Individual medication details - each with its own expiration status */}
      {medications.map((med, idx) => {
        const originalIndex = allMedications.indexOf(med);
        const expirationStatus = calculateMedicationExpiration(
          med.datePrescribed,
          med.duration
        );

        return (
          <View key={idx} style={styles.expandedMedicationItem}>
            <View style={styles.expandedMedicationHeader}>
              <Text style={styles.expandedMedicationName}>
                {med.name || `Medication ${idx + 1}`}
              </Text>
              {/* Only show delete button if prescription is from today */}
              {medications.length > 1 && isPrescriptionFromToday ? (
                <TouchableOpacity
                  onPress={() => removeMedication(originalIndex)}
                >
                  <Ionicons name="trash-outline" size={20} color="#E53935" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Show individual expiration status directly below the header */}
            {expirationStatus ? (
              <View style={styles.statusBelowNameContainer}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: expirationStatus.statusColor },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {expirationStatus.statusText}
                  </Text>
                </View>
                <Text style={styles.expirationText}>
                  {expirationStatus.remainingDays >= 0
                    ? `Expires in ${expirationStatus.remainingDays} day${expirationStatus.remainingDays !== 1 ? "s" : ""
                    } (${expirationStatus.formattedExpirationDate})`
                    : `Expired ${Math.abs(expirationStatus.remainingDays)} day${Math.abs(expirationStatus.remainingDays) !== 1
                      ? "s"
                      : ""
                    } ago (${expirationStatus.formattedExpirationDate})`}
                </Text>
              </View>
            ) : null}

            <View style={styles.medicationDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Timing:</Text>
                <Text style={styles.detailValue}>
                  {med.timing
                    ? med.timing.split(",").join(", ")
                    : "Not specified"}
                </Text>
              </View>

              {med.duration ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Duration:</Text>
                  <Text style={styles.detailValue}>{med.duration}</Text>
                </View>
              ) : null}

              {/* Specific timing doses */}
              {med.timingValues && med.timingValues !== "{}" ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Doses:</Text>
                  <View style={styles.detailValue}>
                    {Object.entries(JSON.parse(med.timingValues)).map(
                      ([time, dose], i) => (
                        <Text key={i} style={styles.doseText}>
                          {time}: {String(dose)}
                          {i <
                            Object.entries(JSON.parse(med.timingValues)).length -
                            1
                            ? ", "
                            : ""}
                        </Text>
                      )
                    )}
                  </View>
                </View>
              ) : null}

              {/* Add per-medication special instructions */}
              {med.specialInstructions ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Instructions:</Text>
                  <Text style={styles.detailValue}>
                    {med.specialInstructions}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Edit button for medications - only show for today's prescriptions */}
            {isPrescriptionFromToday ? (
              <TouchableOpacity
                style={styles.editMedicationButton}
                onPress={() => {
                  // Call the onEditMedication handler with the medication details and index
                  onEditMedication(med, originalIndex);
                }}
              >
                <Ionicons name="pencil" size={16} color="#0070D6" />
                <Text style={styles.editMedicationText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}

      {/* Add medication to this group button - only show for today's prescriptions */}
      {isPrescriptionFromToday && (
        <TouchableOpacity
          style={styles.addMedicationButton}
          onPress={() => {
            // Call the onAddMedicationToGroup handler with the date
            onAddMedicationToGroup(date);
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color="#0070D6" />
          <Text style={styles.addMedicationText}>Add to this prescription</Text>
        </TouchableOpacity>
      )}

      {/* Show read-only message for older prescriptions */}
      {!isPrescriptionFromToday && (
        <View style={styles.readOnlyMessageContainer}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color="#718096"
          />
          <Text style={styles.readOnlyMessage}>
            Previous prescriptions are read-only
          </Text>
        </View>
      )}

      {/* Compress button */}
      <TouchableOpacity
        style={styles.compressButtonContainer}
        onPress={() => toggleExpandGroup(typeof date === 'string' ? date : date.toISOString().split('T')[0])}
      >
        <Text style={styles.compressButtonText}>Show less</Text>
        <Ionicons name="chevron-up" size={16} color="#718096" />
      </TouchableOpacity>
    </View>
  );
};

// Quick Access Modal Components
const ReportsModal: React.FC<ReportsModalProps> = ({ visible, setVisible, patientData, reportFiles }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.quickAccessModalOverlay}>
        <View style={styles.quickAccessModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reports</Text>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Ionicons name="close" size={24} color="#2D3748" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.quickAccessModalScroll}>
            <View style={styles.quickAccessModalBody}>
              {/* Reports Data */}
              <Text style={styles.quickAccessSectionTitle}>Reports Data</Text>
              <View style={styles.quickAccessDataContainer}>
                {patientData.reports ? (
                  <Text style={styles.quickAccessDataText}>
                    {patientData.reports}
                  </Text>
                ) : (
                  <Text style={styles.quickAccessEmptyText}>
                    No reports data available
                  </Text>
                )}
              </View>

              {/* Report Files */}
              <Text style={styles.quickAccessSectionTitle}>Report Files</Text>
              <View style={styles.quickAccessDataContainer}>
                {reportFiles.length > 0 ? (
                  reportFiles.map((file, index) => (
                    <View key={index} style={styles.quickAccessFileItem}>
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
                      <Text style={styles.quickAccessFileName}>
                        {file.name || `File ${index + 1}`}
                        {file.category && ` (${file.category})`}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.quickAccessEmptyText}>
                    No report files available
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const HistoryModal: React.FC<HistoryModalProps> = ({ visible, setVisible, patientData }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.quickAccessModalOverlay}>
        <View style={styles.quickAccessModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Patient History</Text>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Ionicons name="close" size={24} color="#2D3748" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.quickAccessModalScroll}>
            <View style={styles.quickAccessModalBody}>
              {patientData.medicalHistory ? (
                formatHistoryDisplay(patientData.medicalHistory)
              ) : (
                <Text style={styles.quickAccessEmptyText}>
                  No history records available
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Enhanced DiagnosisModal component with direct database data
const EnhancedDiagnosisModal: React.FC<EnhancedDiagnosisModalProps> = ({
  visible,
  setVisible,
  diagnosisData,
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

  // Group diagnoses by date
  const groupDiagnosesByDate = (diagnosisHistory: any[]) => {
    const groupedDiagnoses: Record<string, { displayDate: string; items: any[] }> = {};

    if (!diagnosisHistory || diagnosisHistory.length === 0) {
      return [];
    }

    // Sort history by date (newest first)
    const sortedHistory = [...diagnosisHistory].sort((a, b) => {
      const dateA = new Date(a.date as string | number | Date).getTime();
      const dateB = new Date(b.date as string | number | Date).getTime();
      return dateB - dateA;
    });

    // Group by month and year
    sortedHistory.forEach((item) => {
      try {
        const date = new Date(item.date as string | number | Date);
        const yearMonth = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        if (!groupedDiagnoses[yearMonth]) {
          groupedDiagnoses[yearMonth] = {
            displayDate: date.toLocaleString("en-US", {
              month: "long",
              year: "numeric",
            }),
            items: [],
          };
        }

        groupedDiagnoses[yearMonth].items.push(item);
      } catch (error) {
        console.error(`Error processing date ${item.date}:`, error);
        if (!groupedDiagnoses["unknown"]) {
          groupedDiagnoses["unknown"] = {
            displayDate: "Unknown Date",
            items: [],
          };
        }
        groupedDiagnoses["unknown"].items.push(item);
      }
    });

    return Object.values(groupedDiagnoses);
  };

  const groupedDiagnoses = groupDiagnosesByDate(diagnosisData.diagnosisHistory);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.quickAccessModalOverlay}>
        <View style={styles.quickAccessModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Diagnosis Information</Text>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Ionicons name="close" size={24} color="#2D3748" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.quickAccessModalScroll}>
            <View style={styles.quickAccessModalBody}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#0070D6" />
                  <Text style={styles.loadingText}>
                    Loading diagnosis data...
                  </Text>
                </View>
              ) : (
                <View>
                  {/* Current Diagnosis Section */}
                  <Text style={styles.quickAccessSectionTitle}>
                    Current Diagnosis
                  </Text>
                  <View style={styles.quickAccessDataContainer}>
                    {diagnosisData.currentDiagnosis ? (
                      <View>
                        <View style={styles.currentDiagnosisBadge}>
                          <Text style={styles.currentDiagnosisBadgeText}>
                            Latest
                          </Text>
                          <Text style={styles.currentDiagnosisDate}>
                            {today} • {currentTime}
                          </Text>
                        </View>
                        <Text style={styles.quickAccessDataText}>
                          {diagnosisData.currentDiagnosis}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.quickAccessEmptyText}>
                        No current diagnosis available
                      </Text>
                    )}
                  </View>

                  {/* Advised Investigations Section */}
                  <Text style={styles.quickAccessSectionTitle}>
                    Advised Investigations
                  </Text>
                  <View style={styles.quickAccessDataContainer}>
                    {diagnosisData.advisedInvestigations ? (
                      <Text style={styles.quickAccessDataText}>
                        {diagnosisData.advisedInvestigations}
                      </Text>
                    ) : (
                      <Text style={styles.quickAccessEmptyText}>
                        No advised investigations available
                      </Text>
                    )}
                  </View>

                  {/* Diagnosis History Section */}
                  {diagnosisData.diagnosisHistory.length > 0 && (
                    <>
                      <Text style={styles.quickAccessSectionTitle}>
                        Diagnosis History
                      </Text>
                      {groupedDiagnoses.map((group, groupIndex) => (
                        <View key={`group-${groupIndex}`}>
                          {/* Month/Year group header */}
                          <View style={styles.historyGroupHeader}>
                            <Text style={styles.historyGroupHeaderText}>
                              {group.displayDate}
                            </Text>
                          </View>

                          {/* Diagnoses in this group */}
                          {group.items.map((item: any, itemIndex: number) => (
                            <View
                              key={`diagnosis-${groupIndex}-${itemIndex}`}
                              style={styles.historyItem}
                            >
                              <View style={styles.historyItemHeader}>
                                <Text style={styles.historyItemDate}>
                                  {item.formattedDate}
                                </Text>
                                <Text style={styles.historyItemTime}>
                                  {item.formattedTime}
                                </Text>
                              </View>
                              <Text style={styles.historyItemText}>
                                {item.diagnosis}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const parseDate = (dateString: string | Date | undefined): Date => {
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

const formatTextWithBullets = (text: string | null | undefined) => {
  if (!text) return null;
  // Split text into lines
  const lines = text.split("\n");
  return lines.map((line, index) => {
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
    const dateA = parseDate(a.timestamp).getTime();
    const dateB = parseDate(b.timestamp).getTime();
    return dateB - dateA;
  });

  return entriesWithDates.map((entry, index) => (
    <View key={index} style={styles.entryContainer}>
      <Text style={styles.entryTimestamp}>{entry.timestamp}</Text>
      {formatTextWithBullets(entry.text)}
      {index < entriesWithDates.length - 1 && (
        <View style={styles.entrySeparator} />
      )}
    </View>
  ));
};

const PrescriptionTab: React.FC<PrescriptionTabProps> = ({
  patientData,
  patient,
  medications,
  setMedications,
  expandedMedications,
  setExpandedMedications,
  expandedGroups,
  setExpandedGroups,
  newPrescriptionIndices,
  setNewPrescriptionIndices,
  reportFiles,
  handleSubmit,
  isSubmitting,
  getSubmitButtonText,
  prefillMode,
  initialTab,
  permanentPatientId, // Add this line
  tempPatientId, // Add this line
}) => {
  // State for quick access modals
  const [reportsModalVisible, setReportsModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [diagnosisModalVisible, setDiagnosisModalVisible] = useState(false);

  // NEW: State for diagnosis data fetched from database
  const [diagnosisData, setDiagnosisData] = useState({
    currentDiagnosis: "",
    diagnosisHistory: [],
    advisedInvestigations: "",
  });
  const [isDiagnosisLoading, setIsDiagnosisLoading] = useState(false);

  // State for prescription modal
  const [prescriptionModalVisible, setPrescriptionModalVisible] =
    useState(false);
  const [previewMedications, setPreviewMedications] = useState<Medication[]>([]);
  const [prescriptionModalMode, setPrescriptionModalMode] = useState<
    "new" | "copy" | "edit" | "add"
  >("new");

  // State for editing medications
  const [editingMedicationIndex, setEditingMedicationIndex] = useState<
    number | null
  >(null);
  const [newPrescriptionData, setNewPrescriptionData] = useState<Medication>({
    name: "",
    duration: "",
    timing: "",
    timingValues: "{}",
    specialInstructions: "",
    unit: "",
    datePrescribed: new Date().toISOString(),
  });

  // State for prescription generation
  const [prescriptionGeneratorVisible, setPrescriptionGeneratorVisible] =
    useState(false);
  const [currentPrescriptionDate, setCurrentPrescriptionDate] = useState("");
  const [currentPrescriptionMeds, setCurrentPrescriptionMeds] = useState([]);

  // NEW: Function to fetch diagnosis data directly from database
  const fetchDiagnosisFromDatabase = async () => {
    console.log("🔍 Fetching diagnosis data directly from database...");
    console.log("Patient object:", JSON.stringify(patient, null, 2));
    console.log("PatientData object:", JSON.stringify(patientData, null, 2));
    setIsDiagnosisLoading(true);

    try {
      // Get effective patient ID with better fallback logic
      const effectivePatientId = patient?.patientId || patientData?.patientId || tempPatientId || permanentPatientId;

      if (!effectivePatientId) {
        console.error("❌ No patient ID available to fetch diagnosis data");
        console.log("Patient object:", JSON.stringify(patient, null, 2));
        console.log("PatientData object:", JSON.stringify(patientData, null, 2));
        Alert.alert(
          "Error",
          "Patient ID not found. Cannot fetch diagnosis data. Please ensure you are in edit mode for an existing patient."
        );
        setIsDiagnosisLoading(false);
        return;
      }

      console.log(`📡 Fetching diagnosis for patient: ${effectivePatientId}`);

      // API endpoint
      const apiUrl =
        API_ENDPOINTS.PATIENT_PROCESSOR;

      // Request body to get patient data including diagnosis
      const requestBody = {
        action: "getPatient",
        patientId: effectivePatientId,
        timestamp: new Date().getTime(), // Prevent caching
      };

      console.log("📤 Sending API request:", JSON.stringify(requestBody));

      // Make API call
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

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      console.log("📥 API Response:", JSON.stringify(result, null, 2));

      // Parse nested response if needed
      let patientResponseData = result;
      if (result.body) {
        try {
          patientResponseData =
            typeof result.body === "string"
              ? JSON.parse(result.body)
              : result.body;
        } catch (parseError) {
          console.error("❌ Error parsing nested response:", parseError);
        }
      }

      // Extract patient information
      let currentPatient = null;
      if (patientResponseData.success && patientResponseData.patient) {
        currentPatient = patientResponseData.patient;
      } else if (
        patientResponseData.patients &&
        Array.isArray(patientResponseData.patients)
      ) {
        // Find patient by ID if multiple patients returned
        currentPatient = patientResponseData.patients.find(
          (p: any) => p.patientId === effectivePatientId
        );
      }

      if (!currentPatient) {
        console.error("❌ Patient not found in API response");
        Alert.alert("Error", "Patient data not found in database.");
        setIsDiagnosisLoading(false);
        return;
      }

      console.log("✅ Found patient data:", currentPatient.name);

      // Now fetch diagnosis history
      const historyRequestBody = {
        action: "getDiagnosisHistory",
        patientId: effectivePatientId,
        timestamp: new Date().getTime(),
      };

      console.log("📤 Fetching diagnosis history...");

      const historyResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        body: JSON.stringify(historyRequestBody),
      });

      let diagnosisHistory = [];

      if (historyResponse.ok) {
        const historyResult = await historyResponse.json();
        console.log(
          "📥 Diagnosis History Response:",
          JSON.stringify(historyResult, null, 2)
        );

        // Parse diagnosis history from response
        if (
          historyResult.success &&
          historyResult.diagnosisHistory &&
          Array.isArray(historyResult.diagnosisHistory)
        ) {
          diagnosisHistory = historyResult.diagnosisHistory;
        } else if (historyResult.body) {
          try {
            const historyData =
              typeof historyResult.body === "string"
                ? JSON.parse(historyResult.body)
                : historyResult.body;
            if (
              historyData.diagnosisHistory &&
              Array.isArray(historyData.diagnosisHistory)
            ) {
              diagnosisHistory = historyData.diagnosisHistory;
            }
          } catch (parseError) {
            console.error("❌ Error parsing diagnosis history:", parseError);
          }
        }
      } else {
        console.warn(
          "⚠️ Failed to fetch diagnosis history, continuing with patient data only"
        );
      }

      // Format diagnosis history dates
      const formattedHistory = diagnosisHistory.map((item: any) => ({
        ...item,
        formattedDate: formatDiagnosisDate(item.date),
        formattedTime: formatDiagnosisTime(item.date),
      }));

      console.log(
        `✅ Retrieved ${formattedHistory.length} diagnosis history items`
      );

      // Update state with fetched data
      setDiagnosisData({
        currentDiagnosis: currentPatient.diagnosis || "",
        diagnosisHistory: formattedHistory,
        advisedInvestigations: currentPatient.advisedInvestigations || "",
      });

      console.log("✅ Diagnosis data updated successfully");
    } catch (error: any) {
      console.error("❌ Error fetching diagnosis data:", error);
      Alert.alert("Error", `Failed to fetch diagnosis data: ${error.message}`);
    } finally {
      setIsDiagnosisLoading(false);
    }
  };

  // NEW: Helper functions for date formatting
  const formatDiagnosisDate = (dateString: string | number | Date) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (error) {
      console.error("Error formatting diagnosis date:", error);
      return dateString;
    }
  };

  const formatDiagnosisTime = (dateString: string | number | Date) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting diagnosis time:", error);
      return "";
    }
  };

  // NEW: Modified diagnosis button click handler
  // NEW: Modified diagnosis button click handler
  const handleDiagnosisButtonClick = async () => {
    console.log("🔍 Diagnosis button clicked - opening modal immediately");

    // Show the modal immediately
    setDiagnosisModalVisible(true);

    // Fetch diagnosis data directly from database (async, non-blocking)
    fetchDiagnosisFromDatabase();
  };

  // Function to toggle medication card expansion
  const toggleMedicationExpand = (index: number) => {
    setExpandedMedications((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  // Function to toggle medication group expansion
  const toggleExpandGroup = (date: string) => {
    setExpandedGroups((prev) => {
      if (prev.includes(date)) {
        return prev.filter((d) => d !== date);
      } else {
        return [...prev, date];
      }
    });
  };

  // Function to group medications by date
  const groupMedicationsByDate = () => {
    const groups: Record<string, Medication[]> = {};

    medications.forEach((med) => {
      if (!med.datePrescribed) return;
      // Extract just the date part (ignore time)
      const dateObj = new Date(med.datePrescribed as string | number | Date);
      const dateString = dateObj.toISOString().split("T")[0]; // Format: YYYY-MM-DD

      if (!groups[dateString]) {
        groups[dateString] = [];
      }

      groups[dateString].push(med);
    });

    // Sort dates in descending order (newest first)
    return Object.entries(groups)
      .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
      .map(([date, meds]) => ({ date, medications: meds }));
  };

  // Medication functions
  const updateMedication = (index: number, field: string, value: string) => {
    const updated = [...medications];
    (updated[index] as any)[field] = value; // Use any cast for dynamic field update
    setMedications(updated);
  };

  const removeMedication = (index: number) => {
    if (medications.length > 1) {
      const updated = [...medications];
      updated.splice(index, 1);
      setMedications(updated);

      // Update expanded medications indices
      setExpandedMedications((prev) => {
        // Remove the index that was deleted
        const filtered = prev.filter((i) => i !== index);
        // Adjust indices that were after the deleted item
        return filtered.map((i) => (i > index ? i - 1 : i));
      });

      // Update new prescription indices
      setNewPrescriptionIndices((prev) => {
        // Remove the index that was deleted
        const filtered = prev.filter((i) => i !== index);
        // Adjust indices that were after the deleted item
        return filtered.map((i) => (i > index ? i - 1 : i));
      });
    }
  };

  // Function to create new prescription
  const createNewPrescription = (copyExisting = false) => {
    const todayDate = new Date().toISOString(); // Always use today's date

    if (copyExisting) {
      // Get only the most recent prescription's medications using proper date comparison
      let mostRecentDate: Date | null = null;
      let mostRecentDateString = "";
      let mostRecentMeds = [];

      // First find the most recent prescription date by converting string dates to Date objects
      medications.forEach((med) => {
        if (med.datePrescribed) {
          const medDate = new Date(med.datePrescribed as string | number | Date);
          if (!mostRecentDate || medDate > mostRecentDate) {
            mostRecentDate = medDate;
            mostRecentDateString = med.datePrescribed;
          }
        }
      });

      console.log(
        `Found most recent prescription date: ${mostRecentDateString}`
      );

      // Get ALL medications from that date - match only the date part, not time
      if (mostRecentDateString) {
        // Extract just the date part (YYYY-MM-DD) for comparison
        const mostRecentDateOnly = (mostRecentDateString as string).split("T")[0];

        mostRecentMeds = medications.filter((med) => {
          if (!med.datePrescribed) return false;
          const medDateOnly = (med.datePrescribed as string).split("T")[0];
          return medDateOnly === mostRecentDateOnly;
        });

        console.log(
          `Found ${mostRecentMeds.length} medications from the most recent date`
        );
      } else {
        // Fallback: if no dates found, copy all medications
        mostRecentMeds = [...medications];
        console.log("No valid dates found, copying all medications");
      }

      // Create deep copies of all medications from most recent date with today's date
      const copiedMedications = mostRecentMeds.map((med) => ({
        ...med,
        datePrescribed: todayDate, // Use today's date for the new prescription
      }));

      console.log(
        `Created ${copiedMedications.length} copied medications with today's date`
      );

      // Set the preview medications and show the modal in copy mode
      setPreviewMedications(copiedMedications);
      setPrescriptionModalMode("copy");
      setPrescriptionModalVisible(true);
    } else {
      // Initialize empty form for new prescription (unchanged)
      setNewPrescriptionData({
        name: "",
        duration: "",
        timing: "",
        timingValues: "{}",
        specialInstructions: "",
        unit: "",
        datePrescribed: todayDate,
      });

      // Show modal in new mode with empty form
      setPrescriptionModalMode("new");
      setPrescriptionModalVisible(true);
    }
  };

  // Function to handle editing a medication
  const handleEditMedication = (medication: Medication, index: number) => {
    console.log(`Editing medication: ${medication.name}, index: ${index}`);

    // Set the editing index
    setEditingMedicationIndex(index);

    // Fill the form with the medication data
    setNewPrescriptionData({
      name: medication.name || "",
      duration: medication.duration || "",
      timing: medication.timing || "",
      timingValues: medication.timingValues || "{}",
      specialInstructions: medication.specialInstructions || "",
      unit: medication.unit || "",
      datePrescribed: medication.datePrescribed || new Date().toISOString(),
    });

    // Set modal mode to "edit"
    setPrescriptionModalMode("edit");

    // Show the modal
    setPrescriptionModalVisible(true);
  };

  // Function to handle adding medication to a specific date group
  const handleAddMedicationToGroup = (date: any) => {
    console.log(`Adding medication to group with date: ${date}`);

    // Initialize empty form for new prescription with specific date
    setNewPrescriptionData({
      name: "",
      duration: "",
      timing: "",
      timingValues: "{}",
      specialInstructions: "",
      unit: "",
      datePrescribed: (date as any) instanceof Date ? (date as any).toISOString() : String(date),
    });

    // Set modal mode to "add"
    setPrescriptionModalMode("add");

    // Show the modal
    setPrescriptionModalVisible(true);
  };

  // Function to save new prescription
  const saveNewPrescription = () => {
    // Validate required fields
    if (!newPrescriptionData.name) {
      Alert.alert("Error", "Please enter a medication name");
      return;
    }

    const newIndex = medications.length;
    const newMedication = { ...newPrescriptionData };

    // Add the new medication to the list
    setMedications([...medications, newMedication]);

    // Mark as a new prescription
    setNewPrescriptionIndices((prev) => [...prev, newIndex]);

    // Auto-expand the newly added medication
    setExpandedMedications((prev) => [...prev, newIndex]);

    // Close the modal
    setPrescriptionModalVisible(false);

    // Show success message
    Alert.alert("Success", "New prescription added successfully.");
  };

  // Function to save edits to an existing medication
  const saveEditedMedication = () => {
    // Check if we have a valid index
    if (editingMedicationIndex === null) {
      console.error("No medication index to edit");
      setPrescriptionModalVisible(false);
      return;
    }

    // Validate required fields
    if (!newPrescriptionData.name) {
      Alert.alert("Error", "Please enter a medication name");
      return;
    }

    // Update the medication at the given index
    const updatedMedications = [...medications];
    updatedMedications[editingMedicationIndex] = { ...newPrescriptionData };
    setMedications(updatedMedications);

    // Close the modal
    setPrescriptionModalVisible(false);

    // Reset editing index
    setEditingMedicationIndex(null);

    // Show success message
    Alert.alert("Success", "Medication updated successfully.");
  };

  // Function to save a new medication to a specific date group
  const saveNewMedicationToGroup = () => {
    // Validate required fields
    if (!newPrescriptionData.name) {
      Alert.alert("Error", "Please enter a medication name");
      return;
    }

    const newIndex = medications.length;
    const newMedication = { ...newPrescriptionData };

    // Add the new medication to the list
    setMedications([...medications, newMedication]);

    // Mark as a new prescription
    setNewPrescriptionIndices((prev) => [...prev, newIndex]);

    // Close the modal
    setPrescriptionModalVisible(false);

    // Show success message
    Alert.alert("Success", "Medication added to prescription successfully.");

    // Expand the group to show the new medication
    if (
      !expandedGroups.includes(newPrescriptionData.datePrescribed.split("T")[0])
    ) {
      toggleExpandGroup(newPrescriptionData.datePrescribed.split("T")[0]);
    }
  };

  // Save medications from modal
  const saveCopiedMedications = () => {
    if (previewMedications.length === 0) {
      setPrescriptionModalVisible(false);
      return;
    }

    const startIdx = medications.length;

    // Add all copied medications to the existing list
    setMedications([...medications, ...previewMedications]);

    // Mark all new medications as "new prescriptions"
    const newIndices = previewMedications.map((_, idx) => startIdx + idx);
    setNewPrescriptionIndices((prev) => [...prev, ...newIndices]);

    // Auto-expand the newly added medications for visibility
    setExpandedMedications(newIndices);

    // Auto-expand the date group containing the new prescriptions
    if (previewMedications.length > 0 && previewMedications[0].datePrescribed) {
      const newDateString = new Date(previewMedications[0].datePrescribed)
        .toISOString()
        .split("T")[0];
      setExpandedGroups((prev) => [...prev, newDateString]);
    }

    // Close the modal
    setPrescriptionModalVisible(false);

    // Show confirmation
    Alert.alert(
      "Success",
      `${previewMedications.length} medication(s) copied to new prescription. You can now edit the medications as needed.`
    );
  };

  // Function to handle generating prescription
  const handleGeneratePrescription = () => {
    // Check if we have medications to include
    if (medications.length === 0) {
      Alert.alert(
        "No Medications",
        "There are no medications to include in the prescription."
      );
      return;
    }

    // Set up the file name
    const fileName = `Prescription_${patientData.name.replace(
      /\s+/g,
      "_"
    )}_${new Date()
      .toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
      .replace(/,/g, "")
      .replace(/\s+/g, "_")}`;

    // Check if diagnosis or advised investigations exist
    const hasDiagnosis =
      patientData.diagnosis && patientData.diagnosis.trim().length > 0;
    const hasAdvisedInvestigations =
      patientData.advisedInvestigations &&
      patientData.advisedInvestigations.trim().length > 0;

    // If neither exists, just generate the prescription with medications only
    if (!hasDiagnosis && !hasAdvisedInvestigations) {
      generatePrescriptionWithOptions(false, false, fileName);
      return;
    }

    // Create options for selection
    const options = [];

    if (hasDiagnosis && hasAdvisedInvestigations) {
      options.push(
        {
          text: "Include Both",
          onPress: () => generatePrescriptionWithOptions(true, true, fileName),
        },
        {
          text: "Diagnosis Only",
          onPress: () => generatePrescriptionWithOptions(true, false, fileName),
        },
        {
          text: "Investigations Only",
          onPress: () => generatePrescriptionWithOptions(false, true, fileName),
        }
      );
    } else if (hasDiagnosis) {
      options.push({
        text: "Include Diagnosis",
        onPress: () => generatePrescriptionWithOptions(true, false, fileName),
      });
    } else if (hasAdvisedInvestigations) {
      options.push({
        text: "Include Investigations",
        onPress: () => generatePrescriptionWithOptions(false, true, fileName),
      });
    }

    // Always add the medications-only option
    options.push({
      text: "Medications Only",
      onPress: () => generatePrescriptionWithOptions(false, false, fileName),
    });

    // Add cancel option
    options.push({ text: "Cancel", style: "cancel" as const });

    // Show the alert with options
    Alert.alert(
      "Generate Prescription",
      "Select what information to include in the prescription:",
      options
    );
  };

  // Function to generate prescription with selected options
  const generatePrescriptionWithOptions = async (
    includeDiagnosis: boolean,
    includeInvestigations: boolean,
    fileName: string | undefined
  ) => {
    try {
      // Create a copy of the patient data
      const prescriptionPatient = {
        ...patientData,
        name: patientData.name,
        age: patientData.age,
        sex: patientData.sex,
        patientId: patient?.patientId || "New Patient",
        // Only include diagnosis if selected
        diagnosis: includeDiagnosis ? patientData.diagnosis : "",
        // Only include advised investigations if selected
        advisedInvestigations: includeInvestigations
          ? patientData.advisedInvestigations
          : "",
      };

      // Generate the prescription
      const result = await generatePrescriptionDirectly(
        prescriptionPatient,
        medications,
        new Date().toISOString(),
        undefined, // Use default doctor info
        patientData.prescription // Use prescription text as additional notes
      );

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to generate prescription");
      }
    } catch (error) {
      console.error("Error generating prescription:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred while generating the prescription."
      );
    }
  };

  return (
    <KeyboardAwareScrollView>
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Prescriptions</Text>

        {/* Quick access buttons */}
        <View style={styles.quickAccessButtonsRow}>
          <TouchableOpacity
            style={styles.quickAccessButton}
            onPress={() => setReportsModalVisible(true)}
          >
            <Ionicons name="document-text-outline" size={18} color="#0070D6" />
            <Text style={styles.quickAccessButtonText}>Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAccessButton}
            onPress={() => setHistoryModalVisible(true)}
          >
            <Ionicons name="time-outline" size={18} color="#0070D6" />
            <Text style={styles.quickAccessButtonText}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAccessButton}
            onPress={handleDiagnosisButtonClick}
          >
            <Ionicons name="pulse-outline" size={18} color="#0070D6" />
            <Text style={styles.quickAccessButtonText}>Diagnosis</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.prescriptionActionsContainer}>
          {!(prefillMode && initialTab === "prescription") && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => createNewPrescription(false)}
            >
              <Ionicons name="add-circle" size={24} color="#0070D6" />
              <Text style={styles.addButtonText}>New Prescription</Text>
            </TouchableOpacity>
          )}
        </View>

        {medications.length === 0 && (
          <View style={styles.emptyPrescriptionContainer}>
            <Ionicons name="medical-outline" size={40} color="#CBD5E0" />
            <Text style={styles.emptyPrescriptionText}>
              No medications added yet
            </Text>
            <Text style={styles.emptyPrescriptionSubText}>
              Click "New Prescription" to add medications
            </Text>
            <TouchableOpacity
              style={styles.emptyPrescriptionButton}
              onPress={() => createNewPrescription(false)}
            >
              <Ionicons name="add-circle" size={20} color="#FFFFFF" />
              <Text style={styles.emptyPrescriptionButtonText}>
                Add New Prescription
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {groupMedicationsByDate().map((group, groupIndex) => (
          <MedicationGroupCard
            key={group.date}
            date={group.date}
            medications={group.medications}
            updateMedication={updateMedication}
            removeMedication={removeMedication}
            allMedications={medications}
            expandedGroups={expandedGroups}
            toggleExpandGroup={toggleExpandGroup}
            isNewPrescription={group.medications.some((med) =>
              newPrescriptionIndices.includes(medications.indexOf(med))
            )}
            newPrescriptionIndices={newPrescriptionIndices}
            setMedications={setMedications}
            onEditMedication={handleEditMedication}
            onAddMedicationToGroup={handleAddMedicationToGroup}
            patient={{
              ...patientData,
              patientId: patient?.patientId || "New Patient",
              setPrescriptionModalVisible,
              setCurrentPrescriptionDate,
              setCurrentPrescriptionMeds,
            }}
          />
        ))}

        {medications.length > 0 && (
          <View style={styles.generateButtonContainer}>
            {prefillMode && initialTab === "prescription" && (
              <TouchableOpacity
                style={[styles.generateButton, styles.newPrescriptionButton]}
                onPress={() => {
                  Alert.alert(
                    "Generate New Prescription",
                    "Do you want to copy medications from the previous prescription?",
                    [
                      {
                        text: "No",
                        style: "cancel",
                        onPress: () => createNewPrescription(false),
                      },
                      {
                        text: "Yes",
                        onPress: () => createNewPrescription(true),
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.generateButtonText}>New Prescription</Text>
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.disabledButton]}
          onPress={() => handleSubmit()}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>{getSubmitButtonText()}</Text>
          )}
        </TouchableOpacity>

        {/* Prescription Modal */}
        <Modal
          visible={prescriptionModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setPrescriptionModalVisible(false)}
        >
          <View style={styles.modalOverlayFull}>
            <View style={styles.modalContentFull}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {prescriptionModalMode === "new"
                    ? "New Prescription"
                    : prescriptionModalMode === "edit"
                      ? "Edit Medication"
                      : prescriptionModalMode === "add"
                        ? "Add to Prescription"
                        : "Copy Prescription"}
                </Text>
                <TouchableOpacity
                  onPress={() => setPrescriptionModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#2D3748" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll}>
                <View style={styles.modalBody}>
                  {prescriptionModalMode === "new" ||
                    prescriptionModalMode === "edit" ||
                    prescriptionModalMode === "add" ? (
                    <View>
                      <Text style={styles.modalSubtitle}>
                        {prescriptionModalMode === "new"
                          ? "Enter details for the new medication"
                          : prescriptionModalMode === "edit"
                            ? "Edit medication details"
                            : "Add medication to this prescription"}
                      </Text>
                      <Dropdown
                        label="Medication Name"
                        options={commonMedications}
                        selectedValue={newPrescriptionData.name}
                        onSelect={(value) =>
                          setNewPrescriptionData((prev) => ({
                            ...prev,
                            name: value,
                          }))
                        }
                        placeholder="Select medication"
                      />
                      <TimingSelector
                        timings={timingOptions}
                        selectedTimings={
                          newPrescriptionData.timing
                            ? newPrescriptionData.timing.split(",")
                            : []
                        }
                        onToggle={(id) => {
                          const currentTimings = newPrescriptionData.timing
                            ? newPrescriptionData.timing.split(",")
                            : [];
                          const newTimings = currentTimings.includes(id)
                            ? currentTimings.filter((t) => t !== id)
                            : [...currentTimings, id];
                          setNewPrescriptionData((prev) => ({
                            ...prev,
                            timing: newTimings.join(","),
                          }));
                        }}
                        timingValues={JSON.parse(
                          newPrescriptionData.timingValues || "{}"
                        )}
                        onTimingValueChange={(id, value) => {
                          const timingValues = JSON.parse(
                            newPrescriptionData.timingValues || "{}"
                          );
                          const newTimingValues = {
                            ...timingValues,
                            [id]: value,
                          };
                          setNewPrescriptionData((prev) => ({
                            ...prev,
                            timingValues: JSON.stringify(newTimingValues),
                          }));
                        }}
                      />
                      <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Duration</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newPrescriptionData.duration}
                          onChangeText={(text) =>
                            setNewPrescriptionData((prev) => ({
                              ...prev,
                              duration: text,
                            }))
                          }
                          placeholder="e.g., 7 days"
                        />
                      </View>
                      <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>
                          Special Instructions
                        </Text>
                        <TextInput
                          style={styles.textArea}
                          value={newPrescriptionData.specialInstructions}
                          onChangeText={(text) =>
                            setNewPrescriptionData((prev) => ({
                              ...prev,
                              specialInstructions: text,
                            }))
                          }
                          placeholder="Enter specific instructions for this medication"
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.modalSubtitle}>
                        Review the copied medications before adding
                      </Text>
                      {previewMedications.map((med, index) => (
                        <MedicationCard
                          key={index}
                          med={med}
                          index={index}
                          updateMedication={(idx, field, value) => {
                            const updated = [...previewMedications];
                            (updated[idx] as any)[field] = value;
                            setPreviewMedications(updated);
                          }}
                          removeMedication={(idx) => {
                            const updated = [...previewMedications];
                            updated.splice(idx, 1);
                            setPreviewMedications(updated);
                          }}
                          medications={previewMedications}
                          isCompressed={false}
                          toggleExpand={() => { }}
                          prescriptionDate={new Date().toISOString()}
                          isNewPrescription={true}
                        />
                      ))}
                      {previewMedications.length === 0 && (
                        <Text style={styles.noMedsText}>
                          No medications to copy from previous prescription.
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setPrescriptionModalVisible(false);
                    if (prescriptionModalMode === "edit") {
                      setEditingMedicationIndex(null);
                    }
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={
                    prescriptionModalMode === "new"
                      ? saveNewPrescription
                      : prescriptionModalMode === "edit"
                        ? saveEditedMedication
                        : prescriptionModalMode === "add"
                          ? saveNewMedicationToGroup
                          : saveCopiedMedications
                  }
                >
                  <Text style={styles.saveButtonText}>
                    {prescriptionModalMode === "new"
                      ? "Add Prescription"
                      : prescriptionModalMode === "edit"
                        ? "Save Changes"
                        : prescriptionModalMode === "add"
                          ? "Add to Prescription"
                          : "Add to Prescription"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Quick Access Modals */}
        <ReportsModal
          visible={reportsModalVisible}
          setVisible={setReportsModalVisible}
          patientData={patientData}
          reportFiles={reportFiles}
        />
        <HistoryModal
          visible={historyModalVisible}
          setVisible={setHistoryModalVisible}
          patientData={patientData}
        />
        <EnhancedDiagnosisModal
          visible={diagnosisModalVisible}
          setVisible={setDiagnosisModalVisible}
          diagnosisData={diagnosisData}
          isLoading={isDiagnosisLoading}
        />

        {/* Prescription Generator Modal */}
        {prescriptionGeneratorVisible &&
          showPrescriptionGenerator(
            {
              name: patientData.name,
              age: patientData.age,
              sex: patientData.sex,
              diagnosis: patientData.diagnosis,
              treatment: patientData.treatment,
              patientId: patient?.patientId || "New Patient",
            },
            currentPrescriptionMeds,
            currentPrescriptionDate,
            (result) => {
              setPrescriptionGeneratorVisible(false);
              if (!result.success && result.error) {
                Alert.alert("Error", result.error);
              }
            }
          )(prescriptionGeneratorVisible, () =>
            setPrescriptionGeneratorVisible(false)
          )}
      </View>
    </KeyboardAwareScrollView>
  );
};

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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 16,
  },
  inputWrapper: { marginBottom: 16 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 6,
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
  submitButton: {
    backgroundColor: "#0070D6",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  disabledButton: { backgroundColor: "#90CDF4" },
  submitButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  addButton: { flexDirection: "row", alignItems: "center" },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0070D6",
    marginLeft: 4,
  },
  medicationCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    position: "relative", // For positioning the badge
  },
  medicationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8, // Reduced from 12 to make the card more compact
  },
  medicationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
  },
  // Dropdown styles
  dropdownButton: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownButtonText: {
    fontSize: 16,
    color: "#2D3748",
  },
  placeholderText: {
    color: "#A0AEC0",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
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
    fontWeight: "600",
    color: "#2D3748",
  },
  optionsList: {
    maxHeight: 300,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  selectedOption: {
    backgroundColor: "#EBF8FF",
  },
  optionText: {
    fontSize: 16,
    color: "#2D3748",
  },
  selectedOptionText: {
    fontWeight: "600",
    color: "#0070D6",
  },
  timingContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  timingItemContainer: {
    flexDirection: "column",
    marginRight: 8,
    marginBottom: 12,
  },
  timingButton: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    marginBottom: 4,
  },
  timingButtonSelected: {
    borderColor: "#0070D6",
    backgroundColor: "#EBF8FF",
  },
  timingButtonText: {
    fontSize: 14,
    color: "#4A5568",
  },
  timingButtonTextSelected: {
    color: "#0070D6",
    fontWeight: "600",
  },
  timingInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 6,
    width: 70,
    textAlign: "center",
    fontSize: 14,
    backgroundColor: "#FFFFFF",
  },
  medicationCardCompressed: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
    position: "relative", // For positioning the badge
  },
  medicationTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "wrap",
  },
  medicationDate: {
    fontSize: 13,
    color: "#718096",
    fontStyle: "italic",
    marginLeft: 8,
  },
  compressedContent: {
    marginTop: 4,
    paddingHorizontal: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EDF2F7",
  },
  compressedRow: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  compressedLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#718096",
    width: 100, // Increased from 90 to accommodate "Instructions:"
    flexShrink: 0, // Prevent text from shrinking/wrapping
  },
  compressedValue: {
    fontSize: 14,
    color: "#2D3748",
    flex: 1,
    flexWrap: "wrap",
  },
  expandButtonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  expandButtonText: {
    fontSize: 12,
    color: "#0070D6",
    marginRight: 4,
  },
  compressButtonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  compressButtonText: {
    fontSize: 12,
    color: "#718096",
    marginRight: 4,
  },
  newPrescriptionBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#15A1B1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    zIndex: 10,
  },
  newPrescriptionBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  newPrescriptionCard: {
    borderColor: "#15A1B1",
    borderWidth: 2,
    backgroundColor: "#F0FFFF", // Very light cyan background
  },
  expirationContainer: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 11, // Slightly smaller to fit better
    fontWeight: "500",
  },
  expirationText: {
    fontSize: 12,
    color: "#4A5568",
    flex: 1, // Allow text to wrap if needed
  },
  modalOverlayFull: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)", // Darker background for better UI/UX
    justifyContent: "center",
    alignItems: "center",
  },
  modalContentFull: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: { elevation: 5 },
    }),
  },
  modalScroll: {
    maxHeight: 500,
  },
  modalBody: {
    padding: 16,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 16,
    fontStyle: "italic",
  },
  saveButton: {
    backgroundColor: "#0070D6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#EDF2F7",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: "#4A5568",
    fontSize: 14,
    fontWeight: "600",
  },
  noMedsText: {
    textAlign: "center",
    color: "#718096",
    padding: 20,
  },
  medicationGroupCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
    position: "relative",
  },
  medicationGroupCardExpanded: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  medicationGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  medicationGroupTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
  },
  medicationCount: {
    fontSize: 12,
    color: "#718096",
    marginLeft: 8,
  },
  medicationList: {
    marginTop: 4,
  },
  medicationItem: {
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#0070D6",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
    borderRadius: 4,
  },
  medicationName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2D3748",
    marginBottom: 2, // Reduce this to bring status closer
  },
  medicationDetails: {
    fontSize: 12,
    color: "#718096",
    marginTop: 2, // Add margin to separate from status
  },
  medicationItemHeader: {
    marginBottom: 4,
  },
  expandedMedicationItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  expandedMedicationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  expandedMedicationName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2D3748",
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#718096",
    width: 100,
    flexShrink: 0,
  },
  detailValue: {
    fontSize: 13,
    color: "#2D3748",
    flex: 1,
  },
  doseText: {
    fontSize: 13,
    color: "#2D3748",
  },
  editMedicationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#EDF2F7",
  },
  editMedicationText: {
    fontSize: 12,
    color: "#0070D6",
    marginLeft: 4,
  },
  addMedicationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 12,
    padding: 10,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#0070D6",
    borderRadius: 6,
  },
  addMedicationText: {
    fontSize: 14,
    color: "#0070D6",
    marginLeft: 6,
  },
  statusBelowNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  emptyPrescriptionContainer: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderStyle: "dashed",
    backgroundColor: "#F9FAFB",
    marginVertical: 10,
  },
  emptyPrescriptionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#4A5568",
    marginTop: 12,
    marginBottom: 4,
  },
  emptyPrescriptionSubText: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 16,
    textAlign: "center",
  },
  emptyPrescriptionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0070D6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  emptyPrescriptionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  todayPrescriptionBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    backgroundColor: "#4CAF50", // Green color to indicate "today"
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    zIndex: 10,
  },
  todayPrescriptionBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  readOnlyMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#F5F7FA",
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  readOnlyMessage: {
    fontSize: 12,
    color: "#718096",
    marginLeft: 6,
    fontStyle: "italic",
  },
  groupGenerateButton: {
    backgroundColor: "#38A169",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  groupGenerateButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  generateButtonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    flexWrap: "wrap",
    gap: 8,
  },
  generateButton: {
    backgroundColor: "#38A169",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    marginRight: 6,
  },
  newPrescriptionButton: {
    backgroundColor: "#15A1B1", // Different color for the new button
    marginLeft: 8,
  },
  quickAccessButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  quickAccessButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EBF8FF",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#BEE3F8",
    flex: 1,
    marginHorizontal: 2,
  },
  quickAccessButtonText: {
    fontSize: 12,
    color: "#0070D6",
    marginLeft: 4,
    fontWeight: "500",
  },
  prescriptionActionsContainer: {
    marginBottom: 12,
  },
  quickAccessModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  quickAccessModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: { elevation: 5 },
    }),
  },
  quickAccessModalScroll: {
    maxHeight: 500,
  },
  quickAccessModalBody: {
    padding: 16,
  },
  quickAccessSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginTop: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 4,
  },
  quickAccessDataContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickAccessDataText: {
    fontSize: 14,
    color: "#2D3748",
    lineHeight: 20,
  },
  quickAccessEmptyText: {
    fontSize: 14,
    color: "#718096",
    fontStyle: "italic",
    textAlign: "center",
    padding: 12,
  },
  quickAccessFileItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  quickAccessFileName: {
    marginLeft: 8,
    fontSize: 14,
    color: "#2D3748",
  },
  quickAccessInfoContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  quickAccessInfoRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  quickAccessInfoLabel: {
    width: 80,
    fontSize: 14,
    fontWeight: "500",
    color: "#718096",
  },
  quickAccessInfoValue: {
    flex: 1,
    fontSize: 14,
    color: "#2D3748",
  },

  // NEW STYLES FOR ENHANCED DIAGNOSIS MODAL
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

  // Current diagnosis badge
  currentDiagnosisBadge: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#38A169",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  currentDiagnosisBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  currentDiagnosisDate: {
    color: "#FFFFFF",
    fontSize: 11,
    opacity: 0.9,
  },

  // History group header
  historyGroupHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#EBF8FF",
    borderRadius: 8,
    marginVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#0070D6",
  },
  historyGroupHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C5282",
  },

  // History item
  historyItem: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  historyItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  historyItemDate: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
  },
  historyItemTime: {
    fontSize: 12,
    color: "#718096",
  },
  historyItemText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#2D3748",
  },
  historyBulletItem: {
    fontSize: 14,
    color: "#2D3748",
    paddingLeft: 10,
    marginBottom: 4,
  },
  historyText: {
    fontSize: 14,
    color: "#2D3748",
    marginBottom: 4,
  },
  entryContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  entryTimestamp: {
    fontSize: 12,
    fontWeight: "600",
    color: "#718096",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  entrySeparator: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginTop: 12,
  },
});

export default PrescriptionTab;
