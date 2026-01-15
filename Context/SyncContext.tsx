/**
 * SyncContext.tsx
 * 
 * Provides reactive Offline Sync state to the UI.
 * - Wraps SyncManager singleton.
 * - Exposes READ-ONLY state (isOnline, queueLength).
 * - Exposes COMMAND methods (addOfflineAction, retrySync).
 * - Does NOT contain business logic.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { SyncManager } from "../Services/Sync/SyncManager";
import { SyncMonitor } from "../Services/Sync/SyncMonitor";
import { OfflineAction, SyncStatus } from "../Services/Sync/OfflineTypes";

interface SyncContextType {
    isOnline: boolean;
    syncStatus: SyncStatus;
    queueLength: number;

    /**
     * Adds an action to the offline queue.
     * This is a COMMAND only. UI cannot modify the queue directly.
     */
    addOfflineAction: (action: OfflineAction) => Promise<void>;

    /**
     * Checks for pending actions for a specific patient.
     * Used for UI blocking logic.
     */
    getPendingActionsForPatient: (patientId: string) => OfflineAction[];
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Local state mirrored from SyncManager
    const [isOnline, setIsOnline] = useState(SyncMonitor.getIsConnected());
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncManager.getStatus());
    const [queueLength, setQueueLength] = useState(SyncManager.getQueueLength());

    useEffect(() => {
        // 1. Initialize Manager
        SyncManager.init();

        // 2. Subscribe to Manager changes
        const handleManagerUpdate = () => {
            setIsOnline(SyncMonitor.getIsConnected());
            setSyncStatus(SyncManager.getStatus());
            setQueueLength(SyncManager.getQueueLength());
        };

        SyncManager.addListener(handleManagerUpdate);

        return () => {
            SyncManager.removeListener(handleManagerUpdate);
        };
    }, []);

    // Proxy commands
    const addOfflineAction = async (action: OfflineAction) => {
        await SyncManager.addAction(action);
    };

    // Proxy getters
    const getPendingActionsForPatient = (patientId: string) => {
        return SyncManager.getPendingActionsForPatient(patientId);
    };

    return (
        <SyncContext.Provider
            value={{
                isOnline,
                syncStatus,
                queueLength,
                addOfflineAction,
                getPendingActionsForPatient,
            }}
        >
            {children}
        </SyncContext.Provider>
    );
};

// Hook for consuming the context
export const useSync = () => {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error("useSync must be used within a SyncProvider");
    }
    return context;
};
