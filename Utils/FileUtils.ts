import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

// Enhanced file URI normalization function
export const normalizeUri = async (uri: string): Promise<string> => {
    console.log(`🔄 Normalizing URI: ${uri}`);

    if (Platform.OS === "android" && uri.startsWith("content://")) {
        try {
            console.log(
                "📱 Android content:// URI detected, copying to accessible location"
            );
            const tempPath = `${FileSystem.cacheDirectory
                }temp_image_${Date.now()}.jpg`;
            await FileSystem.copyAsync({
                from: uri,
                to: tempPath,
            });
            console.log(`✅ Successfully normalized URI to: ${tempPath}`);
            return tempPath;
        } catch (error) {
            console.error("❌ URI normalization failed:", error);
            return uri;
        }
    }

    console.log("✅ URI already in correct format");
    return uri;
};

// Enhanced file validation function
export const validateImageFile = async (asset: any) => {
    console.log("🔍 Validating image file:", asset.uri);

    const validationResults = {
        exists: false,
        readable: false,
        validSize: false,
        validType: false,
        errors: [] as string[],
    };

    try {
        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        validationResults.exists = fileInfo.exists;
        console.log(`📁 File exists: ${fileInfo.exists}`);

        if (!fileInfo.exists) {
            validationResults.errors.push("File does not exist at URI");
            return validationResults;
        }

        // Validate file size
        const fileSize = fileInfo.size || asset.fileSize || 0;
        validationResults.validSize = fileSize > 0 && fileSize < 50 * 1024 * 1024; // 50MB max
        console.log(
            `📏 File size: ${fileSize} bytes, valid: ${validationResults.validSize}`
        );

        // Validate file type
        const validTypes = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/jpg",
        ];
        const mimeType = asset.mimeType || asset.type || "image/jpeg";
        validationResults.validType = validTypes.includes(mimeType);
        console.log(
            `🎨 MIME type: ${mimeType}, valid: ${validationResults.validType}`
        );

        // Test file readability
        try {
            const base64 = await FileSystem.readAsStringAsync(asset.uri, {
                encoding: FileSystem.EncodingType.Base64,
                length: 100,
            });
            validationResults.readable = base64.length > 0;
            console.log(`📖 File readable: ${validationResults.readable}`);
        } catch (readError: any) {
            console.warn("⚠️ File readability test failed:", readError.message);
            validationResults.readable = false;
        }
    } catch (error: any) {
        console.error("❌ Validation error:", error);
        validationResults.errors.push(`Validation error: ${error.message}`);
    }

    console.log("✅ Validation complete:", validationResults);
    return validationResults;
};

// Function to check if a file has already been uploaded to S3
// FIXED: Now checks S3 metadata first (most reliable), then URL patterns as fallback
export const isFileAlreadyUploaded = (file: any) => {
    // Primary check: S3 metadata (most reliable)
    if (file.s3Key && file.uploadedToS3) {
        console.log(`⏭️ File already uploaded (has s3Key + uploadedToS3): ${file.name || file.fileName}`);
        return true;
    }

    // Secondary check: Has s3Key even if uploadedToS3 flag is missing (corrupted but likely uploaded)
    if (file.s3Key || file.key) {
        console.log(`⏭️ File has s3Key (treating as uploaded): ${file.name || file.fileName}`);
        return true;
    }

    // Fallback: URL-based check for legacy files
    if (file.uri) {
        const isRemoteUrl = (
            file.uri.includes("s3.amazonaws.com") ||
            file.uri.includes("amazonaws.com") ||
            file.uri.startsWith("https://")
        );
        if (isRemoteUrl) {
            console.log(`⏭️ File is remote URL (legacy): ${file.name || file.fileName}`);
        }
        return isRemoteUrl;
    }

    return false;
};

// Utility: convert file to base64 - UPDATED VERSION
export const fileToBase64 = async (fileUri: string): Promise<string | null> => {
    console.log(`🔍 FILE_TO_BASE64: Starting conversion for: ${fileUri}`);

    try {
        if (!fileUri) {
            console.warn("⚠️ FILE_TO_BASE64: Skipped empty URI");
            return null;
        }

        // Validate the URI first - don't attempt to process remote URLs
        if (fileUri.startsWith("http://") || fileUri.startsWith("https://")) {
            console.error(
                "❌ FILE_TO_BASE64: Cannot convert remote URLs to base64"
            );
            throw new Error(
                "Cannot convert remote URLs to base64 directly. Use local files only."
            );
        }

        console.log(`📄 FILE_TO_BASE64: Reading local file: ${fileUri}`);

        // Check if the file exists first with improved error details
        try {
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (!fileInfo.exists) {
                console.error(
                    `❌ FILE_TO_BASE64: File does not exist at path: ${fileUri}`
                );
                throw new Error(`File does not exist at path: ${fileUri}`);
            }
            console.log(
                `✅ FILE_TO_BASE64: File exists: Size=${fileInfo.size || 0} bytes, URI=${fileUri}`
            );

            // Check file size and warn about potentially large files
            if (fileInfo.size && fileInfo.size > 5000000) {
                // 5MB
                console.warn(
                    `⚠️ FILE_TO_BASE64: Large file detected (${(
                        fileInfo.size /
                        1024 /
                        1024
                    ).toFixed(2)}MB). This may cause issues with the API.`
                );
            }
        } catch (fileCheckError: any) {
            console.error(
                `❌ FILE_TO_BASE64: Error checking file existence: ${fileCheckError.message}`
            );
            throw new Error(`Failed to verify file: ${fileCheckError.message}`);
        }

        // Only proceed with reading if file exists - with retry logic
        let base64Data = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !base64Data) {
            attempts++;
            try {
                console.log(
                    `📤 FILE_TO_BASE64: Reading file attempt ${attempts}/${maxAttempts}`
                );

                base64Data = await FileSystem.readAsStringAsync(fileUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                // Verify we got valid data
                if (!base64Data || base64Data.length === 0) {
                    console.error("❌ FILE_TO_BASE64: Empty base64 data returned");
                    throw new Error("Empty base64 data returned from FileSystem");
                }

                console.log(
                    `✅ FILE_TO_BASE64: Base64 read successful. Data length: ${base64Data.length} characters`
                );
                console.log(
                    `🔍 FILE_TO_BASE64: First 20 chars: ${base64Data.substring(
                        0,
                        20
                    )}...`
                );
                console.log(
                    `🔍 FILE_TO_BASE64: Last 20 chars: ${base64Data.substring(
                        base64Data.length - 20
                    )}...`
                );
            } catch (readError: any) {
                console.error(
                    `❌ FILE_TO_BASE64: Read attempt ${attempts} failed: ${readError.message}`
                );

                if (attempts < maxAttempts) {
                    // Wait before retrying
                    console.log(`⏳ FILE_TO_BASE64: Waiting before retry...`);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                } else {
                    throw new Error(
                        `Failed to read file after ${maxAttempts} attempts: ${readError.message}`
                    );
                }
            }
        }

        return base64Data;
    } catch (error) {
        console.error(`❌ FILE_TO_BASE64: Fatal error for ${fileUri}:`, error);
        throw error;
    }
};
