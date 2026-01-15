/**
 * QueueStorage.ts
 * 
 * Pure persistence layer for the Offline Action Queue.
 * Wraps AsyncStorage with strict typing.
 * No business logic, retries, or network awareness.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { OfflineAction } from "./OfflineTypes";

const QUEUE_STORAGE_KEY = "OFFLINE_ACTION_QUEUE";

export const QueueStorage = {
    /**
     * Persists the entire queue to storage.
     * Should be called whenever the in-memory queue changes.
     */
    saveQueue: async (queue: OfflineAction[]): Promise<boolean> => {
        try {
            const json = JSON.stringify(queue);
            await AsyncStorage.setItem(QUEUE_STORAGE_KEY, json);
            return true;
        } catch (error) {
            console.error("[QueueStorage] Failed to save queue:", error);
            return false;
        }
    },

    /**
     * Loads the queue from storage.
     * Called on app startup.
     */
    loadQueue: async (): Promise<OfflineAction[]> => {
        try {
            const json = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
            if (!json) return [];

            const queue = JSON.parse(json);
            return Array.isArray(queue) ? queue : [];
        } catch (error) {
            console.error("[QueueStorage] Failed to load queue:", error);
            return [];
        }
    },

    /**
     * Clears the entire queue.
     * Use with caution (mainly for debugging or catastrophic failure recovery).
     */
    clearQueue: async (): Promise<boolean> => {
        try {
            await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
            return true;
        } catch (error) {
            console.error("[QueueStorage] Failed to clear queue:", error);
            return false;
        }
    }
};
