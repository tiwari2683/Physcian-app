import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

// PDF styles
const pdfStyles = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
  }
  
  body {
    color: #333;
    line-height: 1.4;
    padding: 16px;
    background-color: white;
  }
  
  .prescription-container {
    max-width: 800px;
    margin: 0 auto;
    position: relative;
  }
  
  /* Header styling */
  .prescription-header {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #333;
    padding-bottom: 15px;
    margin-bottom: 18px;
  }
  
  .header-logo-section {
    display: flex;
    align-items: center;
  }
  
  .clinic-logo {
    width: 75px;
    height: 75px;
    margin-right: 15px;
  }
  
  .doctor-info {
    display: flex;
    flex-direction: column;
  }
  
  .doctor-name {
    font-weight: bold;
    font-size: 20px;
    color: #2D8C9E;
    margin-bottom: 4px;
  }
  
  .doctor-credentials {
    font-size: 14px;
    color: #2D8C9E;
  }
  
  .clinic-info {
    text-align: right;
  }
  
  .clinic-name {
    font-weight: bold;
    font-size: 20px;
    color: #2D8C9E;
    margin-bottom: 4px;
  }
  
  .clinic-details {
    font-size: 14px;
    line-height: 1.3;
  }
  
  /* Patient info styling */
  .patient-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  
  .patient-id {
    font-size: 15px;
    font-weight: bold;
  }
  
  .patient-date {
    text-align: right;
    font-weight: bold;
    font-size: 15px;
  }
  
  .patient-details {
    margin-bottom: 12px;
    font-size: 14px;
  }
  
  .patient-details p {
    margin-bottom: 3px;
  }
  
  .referred-by {
    margin-bottom: 12px;
    font-size: 14px;
  }
  
  /* Diagnosis section */
  .diagnosis {
    margin-bottom: 16px;
    font-size: 14px;
  }
  
  .section-title {
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  /* Advised investigations section */
  .advised-investigations {
    margin-bottom: 16px;
    font-size: 14px;
  }
  
  /* Rx symbol */
  .rx-symbol {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  /* Medications table */
  .medications-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    border-top: 1px solid #333;
    border-bottom: 1px solid #333;
  }
  
  .medications-table th {
    border-bottom: 1px solid #333;
    padding: 8px;
    text-align: left;
    font-weight: bold;
    font-size: 14px;
  }
  
  .medications-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #eee;
    font-size: 14px;
    vertical-align: top;
  }
  
  .medications-table tr:nth-child(even) {
    background-color: #f8f8f8;
  }
  
  /* Advice section */
  .advice {
    margin-bottom: 18px;
    font-size: 14px;
  }
  
  /* Follow-up section */
  .follow-up {
    margin-bottom: 30px;
    font-size: 14px;
  }
  
  /* Signature section */
  .signature-section {
    text-align: right;
    margin-top: 60px;
  }
  
  .signature-line {
    width: 150px;
    height: 1px;
    background-color: #333;
    margin-left: auto;
    margin-bottom: 5px;
  }
  
  .doctor-signature-name {
    font-weight: bold;
    font-size: 14px;
  }
  
  /* Watermark */
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 120px;
    color: rgba(200, 200, 200, 0.1);
    z-index: -1;
    white-space: nowrap;
  }
`;

// Interfaces
interface Medication {
  name: string;
  unit: string;
  timing: string;
  timingValues: string;
  duration: string;
  specialInstructions?: string;
  datePrescribed: string;
}

interface Patient {
  name: string;
  age: number | string;
  sex: string;
  diagnosis: string;
  advisedInvestigations?: string;
  treatment: string;
  patientId?: string;
  prescription?: string;
}

interface DoctorInfo {
  name: string;
  credentials: string;
  clinicName: string;
  clinicAddress: string;
  contactNumber: string;
  registrationNumber: string;
  email?: string;
}

interface PrescriptionGeneratorProps {
  patient: Patient;
  medications: Medication[];
  prescriptionDate: string;
  onClose: () => void;
  visible: boolean;
  doctorInfo?: DoctorInfo;
  additionalNotes?: string;
}

// Default doctor information
const DEFAULT_DOCTOR_INFO: DoctorInfo = {
  name: "Dr. Onkar Bhave",
  credentials: "M.B.B.S., M.D., M.S.",
  clinicName: "Care Clinic",
  clinicAddress: "Kothrud, Pune - 411038",
  contactNumber: "094233 80390",
  registrationNumber: "270988",
  email: "dronkarbhave@clinic.com",
};

// Generate the HTML for the PDF with conditional sections for diagnosis and investigations
const generateHtml = (
  patient: Patient,
  medications: Medication[],
  prescriptionDate: string,
  doctorInfo: DoctorInfo,
  additionalNotes?: string
): string => {
  // Format dates
  const formattedDate = new Date(prescriptionDate)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-");

  const followUpDate = new Date(prescriptionDate);
  followUpDate.setDate(followUpDate.getDate() + 11);
  const formattedFollowUpDate = followUpDate
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-");

  // Helper to calculate total medication count
  const calculateTotalMedications = (medication: Medication) => {
    if (!medication.timing || !medication.duration) return "N/A";
    const durationRegex = /(\d+)\s*(day|days|week|weeks|month|months)/i;
    const durationMatch = medication.duration.match(durationRegex);
    if (!durationMatch) return "N/A";
    let durationDays = parseInt(durationMatch[1]);
    const durationUnit = durationMatch[2].toLowerCase();
    if (durationUnit.includes("week")) {
      durationDays *= 7;
    } else if (durationUnit.includes("month")) {
      durationDays *= 30;
    }
    const timingsPerDay = medication.timing.split(",").length;
    let totalDosesPerDay = 0;
    if (medication.timingValues && medication.timingValues !== "{}") {
      try {
        const timingValues = JSON.parse(medication.timingValues);
        const timingIds = medication.timing.split(",");
        for (const id of timingIds) {
          totalDosesPerDay += parseFloat(timingValues[id]) || 1;
        }
      } catch (e) {
        totalDosesPerDay = timingsPerDay;
      }
    } else {
      totalDosesPerDay = timingsPerDay;
    }
    return Math.round(totalDosesPerDay * durationDays);
  };

  // Helper to format timing display
  const formatTimingDisplay = (medication: Medication) => {
    if (!medication.timing) return "Not specified";
    const timingIds = medication.timing.split(",");
    const timingLabels: { [key: string]: string } = {
      morning: "Morning",
      afternoon: "Aft",
      evening: "Eve",
      night: "Night",
    };
    let displayText = "";
    if (medication.timingValues && medication.timingValues !== "{}") {
      try {
        const timingValues = JSON.parse(medication.timingValues);
        displayText = timingIds
          .map((id) => {
            const label =
              timingLabels[id] || id.charAt(0).toUpperCase() + id.slice(1);
            const value = timingValues[id] || "1";
            return `${value} ${label}`;
          })
          .join(", ");
      } catch (e) {
        displayText = timingIds
          .map(
            (id) => timingLabels[id] || id.charAt(0).toUpperCase() + id.slice(1)
          )
          .join(", ");
      }
    } else {
      displayText = timingIds
        .map(
          (id) => timingLabels[id] || id.charAt(0).toUpperCase() + id.slice(1)
        )
        .join(", ");
    }
    return displayText;
  };

  // Helper for food instructions
  const getMedicationFoodInstructions = (medication: Medication) => {
    if (medication.specialInstructions) {
      const instructions = medication.specialInstructions.toLowerCase();
      if (
        instructions.includes("before food") ||
        instructions.includes("before meal")
      ) {
        return "(Before Food)";
      } else if (
        instructions.includes("after food") ||
        instructions.includes("after meal")
      ) {
        return "(After Food)";
      }
    }
    if (medication.name && medication.name.toLowerCase().includes("antacid")) {
      return "(Before Food)";
    }
    return "(After Food)";
  };

  // Process diagnosis text to ensure proper formatting with bullets
  const formatBulletedText = (text: string) => {
    if (!text) return "NOT SPECIFIED";

    // If text doesn't start with a bullet or dash, add one
    if (
      !text.trim().startsWith("-") &&
      !text.trim().startsWith("•") &&
      !text.trim().startsWith("*")
    ) {
      text = "* " + text;
    }

    // Replace new lines without bullets with bulleted new lines
    return text
      .split("\n")
      .map((line: string) => {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) return "";
        if (
          !trimmedLine.startsWith("-") &&
          !trimmedLine.startsWith("•") &&
          !trimmedLine.startsWith("*")
        ) {
          return "* " + trimmedLine;
        }
        return line;
      })
      .join("\n");
  };

  // Conditionally generate diagnosis section
  let diagnosisSection = "";
  if (patient.diagnosis && patient.diagnosis.trim().length > 0) {
    const diagnosisText = formatBulletedText(patient.diagnosis);
    diagnosisSection = `
      <div class="diagnosis">
        <div class="section-title">Diagnosis:</div>
        <p>${diagnosisText.toUpperCase()}</p>
      </div>
    `;
  }

  // Conditionally generate advised investigations section
  let advisedInvestigationsSection = "";
  if (
    patient.advisedInvestigations &&
    patient.advisedInvestigations.trim().length > 0
  ) {
    const formattedInvestigations = formatBulletedText(
      patient.advisedInvestigations
    );
    advisedInvestigationsSection = `
      <div class="advised-investigations">
        <div class="section-title">Advised Investigations:</div>
        <p>${formattedInvestigations}</p>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Medical Prescription</title>
        <style>
          ${pdfStyles}
        </style>
      </head>
      <body>
        <div class="prescription-container">
          <div class="prescription-header">
            <div class="header-logo-section">
              <div class="clinic-logo">
                <svg viewBox="0 0 100 100" width="75" height="75">
                  <rect x="10" y="40" width="30" height="30" fill="#1D56A0" />
                  <circle cx="70" cy="50" r="20" fill="#7AB800" />
                  <path d="M60,65 Q70,80 80,65" stroke="#7AB800" stroke-width="6" fill="none" />
                </svg>
              </div>
              <div class="doctor-info">
                <div class="doctor-name">${doctorInfo.name}</div>
                <div class="doctor-credentials">${doctorInfo.credentials
    } | Reg. No: ${doctorInfo.registrationNumber}</div>
              </div>
            </div>
            <div class="clinic-info">
              <div class="clinic-name">${doctorInfo.clinicName}</div>
              <div class="clinic-details">${doctorInfo.clinicAddress}</div>
              <div class="clinic-details">Ph: ${doctorInfo.contactNumber
    }, Timing: 09:00 AM - 02:00 PM |</div>
              <div class="clinic-details">Closed: Thursday</div>
            </div>
          </div>
          
          <div class="patient-info">
            <div class="patient-id">ID: ${patient.patientId || "14"
    } - ${patient.name.toUpperCase()} (${patient.sex}) / ${patient.age
    } Y</div>
            <div class="patient-date">Date: ${formattedDate}</div>
          </div>
          
          <div class="patient-details">
            <p>Address: KOTHRUD, PUNE</p>
            <p>Weight(kg): 25, Height (cms): 127, BP: 120/80 mmHg</p>
          </div>
          
          <div class="referred-by">
            <p>Referred By: Dr. Demo</p>
          </div>
          
          ${diagnosisSection}
          
          ${advisedInvestigationsSection}
          
          <div class="rx-symbol">R</div>
          
          <table class="medications-table">
            <thead>
              <tr>
                <th width="40%">Medicine Name</th>
                <th width="30%">Dosage</th>
                <th width="30%">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${medications
      .map((med, index) => {
        const medName = med.name
          ? med.name.toUpperCase()
          : `MEDICATION ${index + 1}`;
        const timingDisplay = formatTimingDisplay(med);
        const foodInstructions = getMedicationFoodInstructions(med);
        let unit = "Tab";
        if (med.unit) {
          if (med.unit.toLowerCase() === "capsule") unit = "Cap";
          else if (med.unit.toLowerCase() === "tablet") unit = "Tab";
          else
            unit =
              med.unit.charAt(0).toUpperCase() + med.unit.slice(1);
        }
        const duration = med.duration || "As directed";
        const totalCount = calculateTotalMedications(med);
        const nameDisplay = `${index + 1
          }) ${unit.toUpperCase()}. ${medName}`;
        return `
                    <tr>
                      <td>${nameDisplay}</td>
                      <td>${timingDisplay}<br>${foodInstructions}</td>
                      <td>${duration}<br>(Tot:${totalCount} ${unit})</td>
                    </tr>
                  `;
      })
      .join("")}
            </tbody>
          </table>
          
          <div class="advice">
            <div class="section-title">Advice Given:</div>
            <p>* ${additionalNotes || patient.prescription || "DRINK BOILED WATER"
    }</p>
          </div>
          
          <div class="follow-up">
            <p>Follow Up: ${formattedFollowUpDate}</p>
          </div>
          
          <div class="signature-section">
            <div class="signature-line"></div>
            <div class="doctor-signature-name">Dr. ${doctorInfo.name
      .split(" ")
      .pop()}</div>
          </div>
        </div>
      </body>
    </html>
  `;
};

// Main component for generating prescriptions
const PrescriptionGenerator: React.FC<PrescriptionGeneratorProps> = ({
  patient,
  medications,
  prescriptionDate,
  onClose,
  visible,
  doctorInfo = DEFAULT_DOCTOR_INFO,
  additionalNotes,
}) => {
  const [fileName, setFileName] = useState<string>(
    `Prescription_${patient.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]
    }`
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showDoctorInfoForm, setShowDoctorInfoForm] = useState<boolean>(false);
  const [customDoctorInfo, setCustomDoctorInfo] =
    useState<DoctorInfo>(doctorInfo);
  const [customNotes, setCustomNotes] = useState<string>(additionalNotes || "");

  // Generate and share the PDF
  const generatePDF = async () => {
    try {
      setIsGenerating(true);
      const html = generateHtml(
        patient,
        medications,
        prescriptionDate,
        customDoctorInfo,
        customNotes
      );
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      let fileUri = uri;
      if (fileName) {
        const sanitizedFileName = fileName
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .replace(/_+/g, "_");
        const newFileUri = `${FileSystem.documentDirectory}${sanitizedFileName}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: newFileUri });
        fileUri = newFileUri;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Prescription",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Sharing not available",
          "Sharing is not available on this device. The PDF has been saved locally."
        );
      }
      setIsGenerating(false);
      onClose();
    } catch (error) {
      console.error("Error generating PDF:", error);
      setIsGenerating(false);
      Alert.alert(
        "Error",
        "There was an error generating the prescription. Please try again."
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={24} color="#0070D6" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Generate Prescription</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prescription Details</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>PDF Filename</Text>
              <TextInput
                style={styles.textInput}
                value={fileName}
                onChangeText={setFileName}
                placeholder="Enter file name"
              />
              <Text style={styles.helperText}>
                The file will be saved as {fileName}.pdf
              </Text>
            </View>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Additional Notes</Text>
              <TextInput
                style={styles.textArea}
                value={customNotes}
                onChangeText={setCustomNotes}
                placeholder="Enter any additional notes for the prescription"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.sectionTitle}>Doctor Information</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setShowDoctorInfoForm(!showDoctorInfoForm)}
              >
                <Ionicons
                  name={showDoctorInfoForm ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#0070D6"
                />
                <Text style={styles.editButtonText}>
                  {showDoctorInfoForm ? "Hide" : "Edit"}
                </Text>
              </TouchableOpacity>
            </View>
            {!showDoctorInfoForm ? (
              <View style={styles.doctorInfoPreview}>
                <Text style={styles.doctorName}>
                  {customDoctorInfo.name}, {customDoctorInfo.credentials}
                </Text>
                <Text style={styles.doctorClinic}>
                  {customDoctorInfo.clinicName}
                </Text>
                <Text style={styles.doctorDetails}>
                  {customDoctorInfo.clinicAddress}
                </Text>
                <Text style={styles.doctorDetails}>
                  Tel: {customDoctorInfo.contactNumber}
                </Text>
                <Text style={styles.doctorDetails}>
                  Reg. No: {customDoctorInfo.registrationNumber}
                </Text>
              </View>
            ) : (
              <View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Doctor Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDoctorInfo.name}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({ ...customDoctorInfo, name: text })
                    }
                    placeholder="Enter doctor's name"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Credentials</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDoctorInfo.credentials}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({
                        ...customDoctorInfo,
                        credentials: text,
                      })
                    }
                    placeholder="e.g., MBBS, MD"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Clinic Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDoctorInfo.clinicName}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({
                        ...customDoctorInfo,
                        clinicName: text,
                      })
                    }
                    placeholder="Enter clinic name"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Address</Text>
                  <TextInput
                    style={styles.textArea}
                    value={customDoctorInfo.clinicAddress}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({
                        ...customDoctorInfo,
                        clinicAddress: text,
                      })
                    }
                    placeholder="Enter clinic address"
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Contact Number</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDoctorInfo.contactNumber}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({
                        ...customDoctorInfo,
                        contactNumber: text,
                      })
                    }
                    placeholder="Enter contact number"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Registration Number</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDoctorInfo.registrationNumber}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({
                        ...customDoctorInfo,
                        registrationNumber: text,
                      })
                    }
                    placeholder="e.g., Medical Reg. No: 12345"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDoctorInfo.email}
                    onChangeText={(text) =>
                      setCustomDoctorInfo({ ...customDoctorInfo, email: text })
                    }
                    placeholder="Enter email address"
                    keyboardType="email-address"
                  />
                </View>
              </View>
            )}
          </View>
          <View style={styles.previewSection}>
            <Text style={styles.previewText}>
              The prescription will include patient details, medications, and
              the doctor information provided above.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.generateButton,
              isGenerating && styles.disabledButton,
            ]}
            onPress={generatePDF}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.generateButtonText}>
                  Generate Prescription
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// Generate prescription directly without UI
export const generatePrescriptionDirectly = async (
  patient: Patient,
  medications: Medication[],
  prescriptionDate: string,
  doctorInfo: DoctorInfo = DEFAULT_DOCTOR_INFO,
  additionalNotes?: string,
  customFileName?: string
) => {
  try {
    const html = generateHtml(
      patient,
      medications,
      prescriptionDate,
      doctorInfo,
      additionalNotes
    );
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    let fileUri = uri;
    if (customFileName) {
      const sanitizedFileName = customFileName
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/_+/g, "_");
      const newFileUri = `${FileSystem.documentDirectory}${sanitizedFileName}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: newFileUri });
      fileUri = newFileUri;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Prescription",
        UTI: "com.adobe.pdf",
      });
      return { success: true, fileUri };
    } else {
      return {
        success: false,
        fileUri,
        error:
          "Sharing is not available on this device. The PDF has been saved locally.",
      };
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    return {
      success: false,
      error: "There was an error generating the prescription.",
    };
  }
};

// Show prescription generator modal
export const showPrescriptionGenerator = (
  patient: Patient,
  medications: Medication[],
  prescriptionDate: string,
  onComplete: (result: {
    success: boolean;
    fileUri?: string;
    error?: string;
  }) => void,
  doctorInfo?: DoctorInfo,
  additionalNotes?: string
) => {
  const renderModal = (isVisible: boolean, onClose: () => void) => (
    <PrescriptionGenerator
      patient={patient}
      medications={medications}
      prescriptionDate={prescriptionDate}
      onClose={onClose}
      visible={isVisible}
      doctorInfo={doctorInfo}
      additionalNotes={additionalNotes}
    />
  );
  return renderModal;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F9FC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#2D3748" },
  content: { flex: 1, padding: 16 },
  section: {
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
  sectionTitleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  helperText: { fontSize: 12, color: "#718096", marginTop: 4 },
  doctorInfoPreview: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 4,
  },
  doctorClinic: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4A5568",
    marginBottom: 4,
  },
  doctorDetails: { fontSize: 12, color: "#718096", marginBottom: 2 },
  editButton: { flexDirection: "row", alignItems: "center" },
  editButtonText: { fontSize: 14, color: "#0070D6", marginLeft: 4 },
  previewSection: {
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#90CDF4",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  previewText: { fontSize: 14, color: "#2C5282", lineHeight: 20 },
  generateButton: {
    backgroundColor: "#0070D6",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
    flexDirection: "row",
    justifyContent: "center",
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  disabledButton: { backgroundColor: "#90CDF4" },
});

export default PrescriptionGenerator;
