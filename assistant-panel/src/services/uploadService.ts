import axios from 'axios';
import { API_ENDPOINTS } from '../config';

export const UploadService = {
    /**
     * Secure Handshake Flow for S3 Uploads
     */
    getPresignedUrl: async (patientId: string, fileName: string, fileType: string) => {
        const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
            action: 'getPresignedUploadUrl',
            patientId,
            fileName,
            fileType,
        });
        return response.data; // Should contain uploadUrl and s3Key
    },

    uploadToS3: async (uploadUrl: string, file: File) => {
        return axios.put(uploadUrl, file, {
            headers: {
                'Content-Type': file.type,
            },
        });
    },

    confirmUpload: async (metadata: {
        patientId: string;
        s3Key: string;
        fileName: string;
        fileSize: number;
        category: string;
    }) => {
        const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
            action: 'confirmFileUpload',
            ...metadata,
        });
        return response.data;
    },

    /**
     * Full handshake implementation
     */
    performCompleteUpload: async (
        patientId: string,
        file: File,
        category: string
    ) => {
        try {
            // 1. Get Presigned URL
            const { uploadUrl, s3Key } = await UploadService.getPresignedUrl(patientId, file.name, file.type);

            // 2. PUT to S3
            await UploadService.uploadToS3(uploadUrl, file);

            // 3. Confirm to Backend
            await UploadService.confirmUpload({
                patientId,
                s3Key,
                fileName: file.name,
                fileSize: file.size,
                category,
            });

            return { s3Key, fileName: file.name };
        } catch (error) {
            console.error('S3 Handshake failed:', error);
            throw error;
        }
    }
};
