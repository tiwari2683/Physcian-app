import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { API_ENDPOINTS } from "../../Config";

const { width } = Dimensions.get("window");

interface NewAppointmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (appointmentData: any) => void;
}

interface Patient {
  patientId: string;
  name: string;
  age: string;
  sex: string;
  mobile: string;
  status?: string;
}

const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  visible,
  onClose,
  onSave,
}) => {
  // Mode: 'search' or 'create'
  const [mode, setMode] = useState<"search" | "create">("search");

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Form state (for new or selected)
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientSex, setPatientSex] = useState("Male");
  const [patientMobile, setPatientMobile] = useState("");
  const [appointmentType, setAppointmentType] = useState("Follow-up");
  const [notes, setNotes] = useState("");

  // Loading state for saving
  const [isSaving, setIsSaving] = useState(false);

  // Date and time state
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Available appointment types
  const appointmentTypes = [
    "Follow-up",
    "Check-up",
    "Consultation",
    "Emergency",
  ];

  // Debounced Search Effect
  useEffect(() => {
    if (mode === "search" && searchQuery.length > 2) {
      const timer = setTimeout(() => {
        performSearch(searchQuery);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, mode]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // Use the generic patient processor endpoint with search action
      const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "searchPatients",
          searchTerm: query,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseData = typeof data.body === 'string' ? JSON.parse(data.body) : data;
        setSearchResults(responseData.patients || []);
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const selectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientName(patient.name);
    setPatientAge(patient.age);
    setPatientMobile(patient.mobile || "");
    // Keep mode as 'search' but show filled form
    setSearchResults([]);
  };

  const createJobForNewPatient = () => {
    setMode("create");
    setSelectedPatient(null);
    setPatientName(searchQuery); // Pre-fill with what they typed
    setPatientAge("");
    setPatientMobile("");
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!patientName) {
      Alert.alert("Error", "Patient Name is required");
      return;
    }

    setIsSaving(true);
    try {
      let finalPatientId = selectedPatient?.patientId;

      // If no selected patient (New Patient Mode), create one first
      if (!finalPatientId) {
        try {
          const createResponse = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "createPatient",
              name: patientName,
              age: patientAge || "0",
              sex: patientSex,
              mobile: patientMobile,
              status: "PRE_REGISTERED" // Key addition for the refactor
            }),
          });

          if (!createResponse.ok) throw new Error("Failed to create pre-registered patient");

          const createData = await createResponse.json();
          const responseBody = typeof createData.body === 'string' ? JSON.parse(createData.body) : createData;

          if (responseBody.success && responseBody.patientId) {
            finalPatientId = responseBody.patientId;
          } else {
            throw new Error("Invalid response from patient creation");
          }
        } catch (err) {
          console.error("Error creating patient:", err);
          Alert.alert("Error", "Could not create new patient record. Please try again.");
          setIsSaving(false);
          return;
        }
      }

      // Now save the appointment with the linked ID
      const appointmentData = {
        patientId: finalPatientId, // LINKED!
        patientName,
        patientAge: parseInt(patientAge) || 0,
        date: formatDate(date),
        time: formatTime(time),
        type: appointmentType,
        status: "upcoming",
        notes,
      };

      onSave(appointmentData);
      resetForm();
    } catch (error) {
      console.error("Save failed", error);
      Alert.alert("Error", "Failed to save appointment");
    } finally {
      setIsSaving(false);
    }
  };

  // ... Date/Time helpers match previous code ...
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) setDate(selectedDate);
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (selectedTime) setTime(selectedTime);
  };

  const formatDate = (date: Date) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const formatTime = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
    return `${hours}:${formattedMinutes} ${ampm}`;
  };

  const resetForm = () => {
    setMode("search");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedPatient(null);
    setPatientName("");
    setPatientAge("");
    setPatientMobile("");
    setNotes("");
    setDate(new Date());
    setTime(new Date());
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalContainer}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {mode === "search" ? "Select Patient" : "New Patient Appointment"}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#718096" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContainer}>

            {/* MODE SELECTION TABS */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, mode === "search" && styles.activeTab]}
                onPress={() => setMode("search")}
              >
                <Ionicons name="search-outline" size={18} color={mode === "search" ? "#0070D6" : "#718096"} />
                <Text style={[styles.tabText, mode === "search" && styles.activeTabText]}>Existing Patient</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === "create" && styles.activeTab]}
                onPress={() => {
                  setMode("create");
                  setSelectedPatient(null);
                }}
              >
                <Ionicons name="person-add-outline" size={18} color={mode === "create" ? "#0070D6" : "#718096"} />
                <Text style={[styles.tabText, mode === "create" && styles.activeTabText]}>New Patient</Text>
              </TouchableOpacity>
            </View>

            {/* SEARCH SECTION */}
            {mode === "search" && !selectedPatient && (
              <View style={styles.searchSection}>
                <Text style={styles.inputLabel}>Search Patient</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="search" size={20} color="#718096" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Type name or mobile..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {isSearching && <ActivityIndicator size="small" color="#0070D6" />}
                </View>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <View style={styles.resultsList}>
                    {searchResults.map(p => (
                      <TouchableOpacity key={p.patientId} style={styles.resultItem} onPress={() => selectPatient(p)}>
                        <View>
                          <Text style={styles.resultName}>{p.name}</Text>
                          <Text style={styles.resultSub}>{p.age} yrs • {p.mobile || "No mobile"}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#CBD5E0" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Create New Option */}
                {searchQuery.length > 0 && !isSearching && (
                  <TouchableOpacity style={styles.createNewButton} onPress={createJobForNewPatient}>
                    <View style={styles.createNewIcon}>
                      <Ionicons name="add" size={20} color="white" />
                    </View>
                    <Text style={styles.createNewText}>Create new patient: "{searchQuery}"</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* FORM SECTION (Shows if patient selected or create mode) */}
            {(selectedPatient || mode === "create") && (
              <View>
                {selectedPatient && (
                  <View style={styles.selectedPatientBanner}>
                    <Text style={styles.selectedPatientText}>Selected: {selectedPatient.name}</Text>
                    <TouchableOpacity onPress={() => setSelectedPatient(null)}>
                      <Text style={styles.changePatientText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.formSection}>
                  <Text style={styles.sectionTitle}>Patient Details</Text>

                  {/* Name only editable if creating new */}
                  <Text style={styles.inputLabel}>Patient Name *</Text>
                  <View style={[styles.inputContainer, selectedPatient && styles.disabledInput]}>
                    <TextInput
                      style={styles.input}
                      value={patientName}
                      onChangeText={setPatientName}
                      editable={!selectedPatient}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.inputLabel}>Age</Text>
                      <View style={styles.inputContainer}>
                        <TextInput
                          style={styles.input}
                          value={patientAge ? String(patientAge) : ""}
                          onChangeText={setPatientAge}
                          keyboardType="number-pad"
                          editable={!selectedPatient} // Allow edit only for new
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.inputLabel}>Mobile</Text>
                      <View style={styles.inputContainer}>
                        <TextInput
                          style={styles.input}
                          value={patientMobile}
                          onChangeText={setPatientMobile}
                          keyboardType="phone-pad"
                          editable={!selectedPatient}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Appointment Details (Always Editable) */}
                <View style={styles.formSection}>
                  <Text style={styles.sectionTitle}>Appointment Details</Text>

                  <Text style={styles.inputLabel}>Date *</Text>
                  <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={20} color="#718096" />
                    <Text style={styles.dateText}>{formatDate(date)}</Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handleDateChange} minimumDate={new Date()} />
                  )}

                  <Text style={styles.inputLabel}>Time *</Text>
                  <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowTimePicker(true)}>
                    <Ionicons name="time-outline" size={20} color="#718096" />
                    <Text style={styles.dateText}>{formatTime(time)}</Text>
                  </TouchableOpacity>
                  {showTimePicker && (
                    <DateTimePicker value={time} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handleTimeChange} />
                  )}

                  <Text style={styles.inputLabel}>Type</Text>
                  <View style={styles.typeContainer}>
                    {appointmentTypes.map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.typeButton, appointmentType === type && styles.selectedTypeButton]}
                        onPress={() => setAppointmentType(type)}
                      >
                        <Text style={[styles.typeButtonText, appointmentType === type && styles.selectedTypeButtonText]}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Notes</Text>
                  <View style={styles.notesContainer}>
                    <TextInput
                      style={styles.notesInput}
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      placeholder="Optional notes"
                    />
                  </View>
                </View>
              </View>
            )}

          </ScrollView>

          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={isSaving || (mode === 'search' && !selectedPatient && !patientName)}
            >
              {isSaving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.saveButtonText}>Save Appointment</Text>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
    height: "90%",
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
  closeButton: {
    padding: 4,
  },
  formContainer: {
    padding: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: "rgba(0, 0, 0, 0.1)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#718096',
  },
  activeTabText: {
    color: '#0070D6',
    fontWeight: '600',
  },
  searchSection: {
    marginBottom: 24,
  },
  resultsList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    maxHeight: 200,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  resultName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2D3748',
  },
  resultSub: {
    fontSize: 12,
    color: '#718096',
  },
  createNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F0FFF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  createNewIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#48BB78',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  createNewText: {
    color: '#2F855A',
    fontWeight: '600',
  },
  selectedPatientBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectedPatientText: {
    color: '#0070D6',
    fontWeight: '600',
  },
  changePatientText: {
    color: '#0070D6',
    textDecorationLine: 'underline',
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  disabledInput: {
    backgroundColor: '#F7FAFC',
    borderColor: '#EDF2F7',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#2D3748",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  dateText: {
    fontSize: 16,
    color: "#2D3748",
    marginLeft: 8,
  },
  typeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  typeButton: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedTypeButton: {
    backgroundColor: "#0070D6",
  },
  typeButtonText: {
    fontSize: 14,
    color: "#718096",
  },
  selectedTypeButtonText: {
    color: "#FFFFFF",
  },
  notesContainer: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  notesInput: {
    fontSize: 16,
    color: "#2D3748",
    height: 80,
  },
  actionsContainer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#718096",
  },
  saveButton: {
    flex: 2,
    backgroundColor: "#0070D6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default NewAppointmentModal;
