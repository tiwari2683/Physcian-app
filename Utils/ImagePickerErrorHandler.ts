import { Platform } from "react-native";

export class ImagePickerErrorHandler {
    static handleError(error: any, context = "Unknown") {
        const errorReport = {
            timestamp: new Date().toISOString(),
            context,
            errorType: error.constructor.name,
            message: error.message,
            platform: Platform.OS,
            stack: error.stack,
        };

        console.error(
            "🚨 Image Picker Error Report:",
            JSON.stringify(errorReport, null, 2)
        );

        // Return user-friendly error messages
        switch (error.code) {
            case "ERR_INVALID_MEDIA_TYPE":
                return {
                    userMessage:
                        "The selected file type is not supported. Please choose a valid image.",
                    action: "retry",
                };
            case "ERR_PERMISSION_DENIED":
                return {
                    userMessage:
                        "Camera or gallery access is required. Please enable permissions in settings.",
                    action: "permissions",
                };
            case "ERR_CANCELED":
                return {
                    userMessage: "Image selection was cancelled.",
                    action: "ignore",
                };
            default:
                return {
                    userMessage: "An unexpected error occurred. Please try again.",
                    action: "retry",
                };
        }
    }
}
