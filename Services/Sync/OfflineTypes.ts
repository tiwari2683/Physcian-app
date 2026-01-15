/**
 * OfflineTypes.ts
 * 
 * Defines the strict shapes for Offline Actions and Queue Items.
 * This file contains pure type definitions with no business logic.
 */

export type OfflineActionType =
    | 'CREATE_PATIENT'
    | 'CREATE_PRESCRIPTION'
    | 'CREATE_FITNESS_CERTIFICATE'
    | 'UPDATE_PATIENT';

export interface OfflineAction {
    /** Unique ID for idempotency (UUIDv4) */
    id: string;

    /** 
     * Patient ID this action belongs to.
     * Can be a real backend ID or a temporary UUID for new offline patients.
     */
    patientId: string;

    /** Action type designator */
    type: OfflineActionType;

    /** 
     * The full data payload required to execute this action.
     * Structure depends on action type.
     */
    payload: any;

    /** Creation timestamp for strict chronological ordering */
    timestamp: number;

    /** 
     * Optional ID of another action this action depends on.
     * Used for chaining (e.g., Prescription depends on CreatePatient).
     */
    dependencyId?: string;

    /** Number of times this action has been retried */
    retryCount: number;
}

export type SyncStatus = 'IDLE' | 'SYNCING' | 'ERROR' | 'OFFLINE';

export interface SyncState {
    isOnline: boolean;
    syncStatus: SyncStatus;
    queueLength: number;
    lastSyncTime?: number;
}
