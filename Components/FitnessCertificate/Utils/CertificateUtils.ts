/**
 * Utility functions for Fitness Certificate feature
 * Extracted from FitnessCertificate.tsx for better organization
 */

import { Alert, Platform } from "react-native";

/**
 * Pure utility function to generate prescription text from medications array
 * @param medications - Array of medication objects
 * @returns Formatted prescription text
 */
export const generatePrescriptionFromMedications = (medications: any[]): string => {
    if (!medications || medications.length === 0) return "";

    return medications
        .map((med, index) => {
            let prescriptionLine = `${index + 1}. ${med.name || "Medication"}`;

            // Process timing values
            if (med.timingValues) {
                try {
                    const timingValuesObj =
                        typeof med.timingValues === "string"
                            ? JSON.parse(med.timingValues)
                            : med.timingValues;

                    const timingInstructions = Object.entries(timingValuesObj)
                        .map(([time, value]) => {
                            const timingLabel =
                                time.charAt(0).toUpperCase() + time.slice(1);
                            return `${timingLabel}: ${value}`;
                        })
                        .join(", ");

                    if (timingInstructions) {
                        prescriptionLine += ` - ${timingInstructions}`;
                    }
                } catch (e: any) {
                    console.warn(
                        `Error parsing timing values for med ${index + 1}: ${e?.message || String(e)}`
                    );
                }
            }

            // Add duration if available
            if (med.duration) {
                prescriptionLine += ` for ${med.duration}`;
            }

            // Add special instructions if present
            if (med.specialInstructions && med.specialInstructions.trim() !== "") {
                prescriptionLine += `\n   Special Instructions: ${med.specialInstructions}`;
            }

            return prescriptionLine;
        })
        .join("\n\n");
};

/**
 * Get Android API level
 * @returns API level number or 0 for iOS
 */
export const getAndroidAPILevel = (): number => {
    if (Platform.OS !== "android") return 0;
    return Platform.Version as number;
};

/**
 * Check if required dependencies are available
 * Shows alert if dependencies are missing
 * @param FileSystem - expo-file-system module
 * @param MediaLibrary - expo-media-library module
 * @param captureRef - react-native-view-shot captureRef function
 * @returns true if all dependencies available, false otherwise
 */
export const checkDependencies = (
    FileSystem: any,
    MediaLibrary: any,
    captureRef: any
): boolean => {
    console.log("🔍 Checking dependencies...");

    if (!FileSystem) {
        console.log("❌ expo-file-system not available");
        Alert.alert(
            "Missing Dependency",
            "expo-file-system is required. Please install it:\nnpm install expo-file-system"
        );
        return false;
    }

    if (!MediaLibrary) {
        console.log("❌ expo-media-library not available");
        Alert.alert(
            "Missing Dependency",
            "expo-media-library is required. Please install it:\nnpm install expo-media-library"
        );
        return false;
    }

    if (!captureRef) {
        console.log("❌ react-native-view-shot not available");
        Alert.alert(
            "Missing Dependency",
            "react-native-view-shot is required. Please install it:\nnpm install react-native-view-shot"
        );
        return false;
    }

    console.log("✅ All dependencies available");
    return true;
};
