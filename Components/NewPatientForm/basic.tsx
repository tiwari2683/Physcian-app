import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";

interface PatientData {
  name: string;
  age: string;
  sex: string;
  mobile: string;
  address: string;
  // Include other fields that might be accessed
  medicalHistory?: string;
  diagnosis?: string;
  prescription?: string;
  treatment?: string;
  reports?: string;
  advisedInvestigations?: string;
  existingData?: string;
}

interface Errors {
  name: string;
  age: string;
  mobile: string;
}

interface BasicTabProps {
  patientData: PatientData;
  errors: Errors;
  updateField: (field: string, value: string) => void;
}

// RadioButton component
const RadioButton = ({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) => (
  <TouchableOpacity
    style={styles.radioContainer}
    onPress={onSelect}
    activeOpacity={0.7}
  >
    <View style={[styles.radioButton, selected && styles.radioButtonSelected]}>
      {selected && <View style={styles.radioButtonInner} />}
    </View>
    <Text style={styles.radioLabel}>{label}</Text>
  </TouchableOpacity>
);

// BasicTab component
const BasicTab: React.FC<BasicTabProps> = ({
  patientData,
  errors,
  updateField,
}) => {
  return (
    <KeyboardAwareScrollView>
      <View style={styles.formSection}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Full Name</Text>
          <TextInput
            style={[styles.textInput, errors.name ? styles.inputError : null]}
            value={patientData.name}
            onChangeText={(text) => {
              console.log(
                `🔄 Direct name change: "${patientData.name}" → "${text}"`
              );
              updateField("name", text);
            }}
            placeholderTextColor='#c8c8c8'
            placeholder="Enter patient's full name"
            blurOnSubmit={true}
          />
          {errors.name ? (
            <Text style={styles.errorText}>{errors.name}</Text>
          ) : null}
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Age</Text>
          <TextInput
            style={[styles.textInput, errors.age ? styles.inputError : null]}
            value={patientData.age}
            onChangeText={(text) => updateField("age", text)}
            placeholder="Enter patient's age"
            keyboardType="numeric"
            placeholderTextColor='#c8c8c8'

            blurOnSubmit={false}
          />
          {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}
        </View>

        {/* Mobile Number field with required indicator (*) */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Mobile Number *</Text>
          <TextInput
            style={[styles.textInput, errors.mobile ? styles.inputError : null]}
            value={patientData.mobile}
            onChangeText={(text) => updateField("mobile", text)}
            placeholder="Enter patient's 10-digit mobile number"
            keyboardType="phone-pad"
            placeholderTextColor='#c8c8c8'

            blurOnSubmit={true}
          />
          {errors.mobile ? (
            <Text style={styles.errorText}>{errors.mobile}</Text>
          ) : null}
        </View>

        {/* Address field */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Address</Text>
          <TextInput
            style={styles.textArea}
            value={patientData.address}
            onChangeText={(text) => updateField("address", text)}
            placeholder="Enter patient's address"
            multiline
            numberOfLines={3}
            placeholderTextColor='#c8c8c8'

            textAlignVertical="top"
            blurOnSubmit={false}
          />
        </View>

        <Text style={styles.inputLabel}>Sex</Text>
        <View style={styles.radioGroup}>
          <RadioButton
            label="Male"
            selected={patientData.sex === "Male"}
            onSelect={() => updateField("sex", "Male")}
          />
          <RadioButton
            label="Female"
            selected={patientData.sex === "Female"}
            onSelect={() => updateField("sex", "Female")}
          />
          <RadioButton
            label="Other"
            selected={patientData.sex === "Other"}
            onSelect={() => updateField("sex", "Other")}
          />
        </View>
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
  inputError: { borderColor: "#E53E3E" },
  errorText: { color: "#E53E3E", fontSize: 12, marginTop: 4 },
  radioGroup: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  radioContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 20,
    marginBottom: 8,
  },
  radioButton: {
    height: 20,
    width: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#0070D6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  radioButtonSelected: { borderColor: "#0070D6" },
  radioButtonInner: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: "#0070D6",
  },
  radioLabel: { fontSize: 14, color: "#2D3748" },
});

export default BasicTab;
