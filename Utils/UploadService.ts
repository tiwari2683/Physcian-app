/**
 * UploadService.ts - Base64-Free File Upload Service
 * 
 * This service handles direct S3 uploads using presigned URLs,
 * eliminating the need to send Base64 data through API Gateway.
 */

import * as FileSystem from "expo-file-system";
import { API_ENDPOINTS } from "../Config";

export interface FileToUpload {
    uri: string;
    name: string;
    type: string;
    category?: string;
    size?: number;
}

export interface UploadedFile {
    key: string; // Keep for backward compatibility
    s3Key?: string; // New field for the new lambda
    name: string;
    type: string;
    category: string;
    size: number;
    uploadedToS3: true;
    uploadDate: string;
}

export interface PresignedUrlResponse {
    success: boolean;
    uploadUrl?: string;
    s3Key?: string; // New field name from lambda
    key?: string; // Keep for backward compatibility
    fileName?: string;
    expiresIn?: number;
    error?: string;
}

/**
 * Request a presigned upload URL from Lambda
 */
async function getPresignedUploadUrl(
    patientId: string,
    file: FileToUpload
): Promise<PresignedUrlResponse> {
    console.log(`📤 Requesting presigned URL for: ${file.name}`);

    try {
        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                action: "getPresignedUploadUrl",
                patientId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size || 0,
                category: file.category || "uncategorized",
            }),
        });

        const result = await response.json();
        const data = result.body
            ? typeof result.body === "string"
                ? JSON.parse(result.body)
                : result.body
            : result;

        if (!data.success) {
            console.error(`❌ Failed to get presigned URL: ${data.error}`);
            return { success: false, error: data.error };
        }

        console.log(`✅ Got presigned URL for key: ${data.s3Key || data.key}`);
        return data as PresignedUrlResponse;
    } catch (error: any) {
        console.error(`❌ Error requesting presigned URL: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Confirm file upload with lambda after successful S3 upload
 */
async function confirmFileUpload(
    patientId: string,
    s3Key: string,
    file: FileToUpload
): Promise<{ success: boolean; error?: string }> {
    console.log(`🔍 Confirming upload for: ${s3Key}`);

    try {
        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                action: "confirmFileUpload",
                patientId,
                s3Key,
                fileName: file.name,
                fileType: file.type,
                category: file.category || "uncategorized",
                fileSize: file.size || 0,
            }),
        });

        const result = await response.json();
        const data = result.body
            ? typeof result.body === "string"
                ? JSON.parse(result.body)
                : result.body
            : result;

        if (!data.success) {
            console.error(`❌ Failed to confirm upload: ${data.error}`);
            return { success: false, error: data.error };
        }

        console.log(`✅ Upload confirmed for: ${file.name}`);
        return { success: true };
    } catch (error: any) {
        console.error(`❌ Error confirming upload: ${error.message}`);
        return { success: false, error: error.message };
    }
}
async function uploadToS3(
    presignedUrl: string,
    file: FileToUpload
): Promise<{ success: boolean; error?: string }> {
    console.log(`⬆️ Uploading ${file.name} to S3...`);

    try {
        // Read file as binary (base64 for FileSystem, then convert)
        const fileInfo = await FileSystem.getInfoAsync(file.uri);
        if (!fileInfo.exists) {
            throw new Error(`File does not exist at: ${file.uri}`);
        }

        // Use FileSystem.uploadAsync for direct binary upload
        const uploadResult = await FileSystem.uploadAsync(presignedUrl, file.uri, {
            httpMethod: "PUT",
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
                "Content-Type": file.type || "application/octet-stream",
            },
        });

        if (uploadResult.status >= 200 && uploadResult.status < 300) {
            console.log(`✅ Upload successful: ${file.name}`);
            return { success: true };
        } else {
            console.error(`❌ Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
            return { success: false, error: `Upload failed: ${uploadResult.status}` };
        }
    } catch (error: any) {
        console.error(`❌ Upload error for ${file.name}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Upload a single file using presigned URL (Base64-free)
 * 
 * @param file - File object with uri, name, type
 * @param patientId - Patient ID for S3 key generation
 * @returns UploadedFile metadata (no Base64, no URL - just key + metadata for DynamoDB)
 */
export async function uploadFileWithPresignedUrl(
    file: FileToUpload,
    patientId: string
): Promise<UploadedFile | null> {
    console.log(`🚀 Starting presigned upload for: ${file.name}`);

    // Step 1: Skip if already uploaded (has an S3 key)
    if ((file as any).key && (file as any).uploadedToS3) {
        console.log(`⏭️ File already uploaded: ${file.name}`);
        return {
            key: (file as any).key,
            name: file.name,
            type: file.type,
            category: file.category || "uncategorized",
            size: file.size || 0,
            uploadedToS3: true,
            uploadDate: (file as any).uploadDate || new Date().toISOString(),
        };
    }

    // Step 2: Skip remote URLs (already in cloud)
    if (file.uri.startsWith("http://") || file.uri.startsWith("https://")) {
        console.log(`⏭️ Skipping remote URL: ${file.uri}`);
        // For legacy URLs, we cannot upload - return a reference
        return null;
    }

    // Step 3: Get presigned URL from Lambda
    const presignedResponse = await getPresignedUploadUrl(patientId, file);
    if (!presignedResponse.success || !presignedResponse.uploadUrl) {
        console.error(`❌ Failed to get presigned URL for: ${file.name}`);
        return null;
    }

    // Step 4: Upload directly to S3
    const uploadResult = await uploadToS3(presignedResponse.uploadUrl, file);
    if (!uploadResult.success) {
        console.error(`❌ Failed to upload ${file.name}: ${uploadResult.error}`);
        return null;
    }

    // Step 5: Confirm upload with lambda (saves metadata to DynamoDB)
    const confirmResult = await confirmFileUpload(
        patientId,
        presignedResponse.s3Key || presignedResponse.key!,
        file
    );
    if (!confirmResult.success) {
        console.error(`❌ Failed to confirm upload for ${file.name}: ${confirmResult.error}`);
        return null;
    }

    // Step 6: Return metadata-only object (for DynamoDB storage)
    const s3Key = presignedResponse.s3Key || presignedResponse.key!;
    console.log(`✅ Successfully uploaded and confirmed: ${file.name} → ${s3Key}`);
    return {
        key: s3Key, // Keep for backward compatibility
        s3Key: s3Key, // New field
        name: file.name,
        type: file.type,
        category: file.category || "uncategorized",
        size: file.size || 0,
        uploadedToS3: true,
        uploadDate: new Date().toISOString(),
    };
}

/**
 * Upload multiple files using presigned URLs (parallel)
 * 
 * @param files - Array of files to upload
 * @param patientId - Patient ID for S3 key generation
 * @returns Array of successfully uploaded file metadata
 */
export async function uploadFilesWithPresignedUrls(
    files: FileToUpload[],
    patientId: string
): Promise<{ uploaded: UploadedFile[]; failed: string[] }> {
    console.log(`📦 Uploading ${files.length} files with presigned URLs`);

    const uploaded: UploadedFile[] = [];
    const failed: string[] = [];

    // Deduplicate by URI
    const uniqueFileMap = new Map<string, FileToUpload>();
    files.forEach((file) => {
        const key = file.uri || `${file.name}_${file.category}`;
        if (!uniqueFileMap.has(key)) {
            uniqueFileMap.set(key, file);
        }
    });

    const deduplicated = Array.from(uniqueFileMap.values());
    console.log(`📋 Processing ${deduplicated.length} unique files`);

    // Upload in parallel (max 3 concurrent)
    const batchSize = 3;
    for (let i = 0; i < deduplicated.length; i += batchSize) {
        const batch = deduplicated.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map((file) => uploadFileWithPresignedUrl(file, patientId))
        );

        results.forEach((result, idx) => {
            if (result) {
                uploaded.push(result);
            } else {
                failed.push(batch[idx].name || "Unknown file");
            }
        });
    }

    console.log(`✅ Upload complete: ${uploaded.length} succeeded, ${failed.length} failed`);
    return { uploaded, failed };
}

/**
 * Check if a file needs to be uploaded (not already on S3)
 */
export function fileNeedsUpload(file: any): boolean {
    // Already has S3 key = no upload needed
    if (file.key && file.uploadedToS3) {
        return false;
    }

    // Remote URL = cannot upload (legacy file)
    if (file.uri?.startsWith("http://") || file.uri?.startsWith("https://")) {
        return false;
    }

    // Has base64Data = legacy format, but still need upload
    // (this is for backward compatibility during migration)
    if (file.base64Data) {
        return false; // Let old path handle it during transition
    }

    // Local file without key = needs upload
    return !!file.uri;
}
