import { Alert, Platform } from "react-native";
import { ToastAndroid } from "react-native";

export const handleApiError = (error: any, context: string) => {
    // Log the full error for debugging in development
    console.error(`❌ API Error [${context}]:`, error);

    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";

    // Different user feedback based on severity or type could go here
    // For now, we standardize user alerts

    if (Platform.OS === 'android') {
        ToastAndroid.show(`${context}: ${errorMessage}`, ToastAndroid.LONG);
    } else {
        Alert.alert(
            "Connection Error",
            `Failed to ${context.toLowerCase()}. \n\nDetails: ${errorMessage}`,
            [{ text: "OK" }]
        );
    }

    // Return formatted error for component state if needed
    return {
        error: true,
        message: errorMessage
    };
};
