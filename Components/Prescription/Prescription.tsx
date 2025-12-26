import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface PrescriptionProps {
  navigation: any;
  route: any;
}

const Prescription: React.FC<PrescriptionProps> = ({ navigation }) => {
  // State for form fields
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [medications, setMedications] = useState([
    { name: "", dosage: "", frequency: "", duration: "" },
  ]);
  const [instructions, setInstructions] = useState("");

  // Add another medication
  const addMedication = () => {
    setMedications([
      ...medications,
      { name: "", dosage: "", frequency: "", duration: "" },
    ]);
  };

  // Update medication field
  const updateMedication = (index: number, field: string, value: string) => {
    const updatedMedications = [...medications];
    updatedMedications[index][field as keyof (typeof updatedMedications)[0]] =
      value;
    setMedications(updatedMedications);
  };

  // Remove a medication
  const removeMedication = (index: number) => {
    if (medications.length > 1) {
      const updatedMedications = [...medications];
      updatedMedications.splice(index, 1);
      setMedications(updatedMedications);
    }
  };

  // Save prescription
  const savePrescription = () => {
    // Here you would typically save to a database
    console.log({
      patientName,
      patientAge,
      medications,
      instructions,
      date: new Date().toISOString(),
    });

    // Navigate back or to a confirmation screen
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>New Prescription</Text>
            <Text style={styles.headerDate}>
              {new Date().toLocaleDateString()}
            </Text>
          </View>

          {/* Patient Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Patient Information</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Patient Name</Text>
              <TextInput
                style={styles.input}
                value={patientName}
                onChangeText={setPatientName}
                placeholder="Enter patient name"
              />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Age</Text>
              <TextInput
                style={styles.input}
                value={patientAge}
                onChangeText={setPatientAge}
                placeholder="Enter patient age"
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Medications */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Medications</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={addMedication}
              >
                <Ionicons name="add-circle" size={24} color="#0070D6" />
                <Text style={styles.addButtonText}>Add Medication</Text>
              </TouchableOpacity>
            </View>

            {medications.map((med, index) => (
              <View key={index} style={styles.medicationCard}>
                <View style={styles.medicationHeader}>
                  <Text style={styles.medicationTitle}>
                    Medication {index + 1}
                  </Text>
                  {medications.length > 1 && (
                    <TouchableOpacity onPress={() => removeMedication(index)}>
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#E53935"
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Medication Name</Text>
                  <TextInput
                    style={styles.input}
                    value={med.name}
                    onChangeText={(value) =>
                      updateMedication(index, "name", value)
                    }
                    placeholder="Enter medication name"
                  />
                </View>

                <View style={styles.inputRow}>
                  <View
                    style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}
                  >
                    <Text style={styles.inputLabel}>Dosage</Text>
                    <TextInput
                      style={styles.input}
                      value={med.dosage}
                      onChangeText={(value) =>
                        updateMedication(index, "dosage", value)
                      }
                      placeholder="e.g., 500mg"
                    />
                  </View>
                  <View
                    style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}
                  >
                    <Text style={styles.inputLabel}>Frequency</Text>
                    <TextInput
                      style={styles.input}
                      value={med.frequency}
                      onChangeText={(value) =>
                        updateMedication(index, "frequency", value)
                      }
                      placeholder="e.g., 3x daily"
                    />
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Duration</Text>
                  <TextInput
                    style={styles.input}
                    value={med.duration}
                    onChangeText={(value) =>
                      updateMedication(index, "duration", value)
                    }
                    placeholder="e.g., 7 days"
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Special Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Enter any special instructions or notes"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={savePrescription}
          >
            <Ionicons name="save-outline" size={20} color="white" />
            <Text style={styles.saveButtonText}>Save Prescription</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2D3748",
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 14,
    color: "#718096",
  },
  section: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#F7FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#2D3748",
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
  },
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
  },
  medicationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  medicationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
  },
  saveButton: {
    flexDirection: "row",
    backgroundColor: "#0070D6",
    borderRadius: 8,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
    margin: 16,
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
    marginLeft: 8,
  },
});

export default Prescription;
