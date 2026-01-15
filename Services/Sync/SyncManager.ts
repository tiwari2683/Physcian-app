/**
 * SyncManager.ts
 * 
 * Singleton service responsible for:
 * 1. Maintaining the strict FIFO ActionQueue.
 * 2. Enforcing per-patient sequential locking.
 * 3. Executing the processing loop (ONE item per iteration).
 * 4. Persisting state via QueueStorage.
 * 
 * PHASE 1 IMPLEMENTATION: SCAFFOLDING ONLY
 * No backend calls. No retry logic. No dependency rewriting.
 */

import { OfflineAction, SyncStatus } from "./OfflineTypes";
import { QueueStorage } from "./QueueStorage";
import { SyncMonitor } from "./SyncMonitor";
import { API_ENDPOINTS } from "../../Config";

type ChangeListener = () => void;

class SyncManagerService {
    // In-memory queue (Source of Truth)
    private queue: OfflineAction[] = [];

    // Status state
    private status: SyncStatus = 'IDLE';

    // Locking: Set of patient IDs currently being processed
    // STRICT RULE: Only one processing action per patient at a time
    private processingPatientIds: Set<string> = new Set();

    // Listeners for UI updates
    private listeners: Set<ChangeListener> = new Set();

    // Initialization flag
    private isInitialized: boolean = false;

    constructor() {
        // We defer initialization to an explicit call to avoid constructor async issues
    }

    /**
     * Initialize the Manager.
     * Loads queue from disk and subscribes to network updates.
     */
    public async init() {
        if (this.isInitialized) return;

        console.log("[SyncManager] Initializing...");

        // 1. Rehydrate Queue
        this.queue = await QueueStorage.loadQueue();
        console.log(`[SyncManager] Rehydrated queue: ${this.queue.length} items`);

        // 2. Subscribe to Network Changes
        SyncMonitor.addListener((isConnected) => {
            if (isConnected) {
                console.log("[SyncManager] Network Regained. Triggering process loop.");
                this.processQueue();
            } else {
                this.status = 'OFFLINE';
                this.notifyListeners();
            }
        });

        this.isInitialized = true;
        this.notifyListeners();
    }

    /**
     * Adds a new action to the offline queue.
     * Persists immediately and triggers processing.
     */
    public async addAction(action: OfflineAction) {
        console.log(`[SyncManager] Adding action: ${action.type} for patient ${action.patientId}`);

        // Add to end of queue
        this.queue.push(action);

        // Persist
        await QueueStorage.saveQueue(this.queue);

        this.notifyListeners();

        // Trigger processing if online
        if (SyncMonitor.getIsConnected()) {
            this.processQueue();
        }
    }

    /**
     * Public getter for UI to see queue length
     */
    public getQueueLength(): number {
        return this.queue.length;
    }

    /**
     * Public getter for UI to see sync status
     */
    public getStatus(): SyncStatus {
        if (!SyncMonitor.getIsConnected()) return 'OFFLINE';
        return this.status;
    }

    /**
     * Public getter to check for pending actions for a specific patient.
     * Used by UI to block new visits if pending actions exist.
     */
    public getPendingActionsForPatient(patientId: string): OfflineAction[] {
        return this.queue.filter(action => action.patientId === patientId);
    }

    /**
     * The Core Processing Loop
     * STICT RULE: Processes ONE item at a time per iteration.
     * STRICT RULE: Skips items if patient is locked.
     */
    private async processQueue() {
        // 1. Guard Checks
        if (this.status === 'SYNCING') return; // Already running
        if (!SyncMonitor.getIsConnected()) return;
        if (this.queue.length === 0) {
            this.status = 'IDLE';
            this.notifyListeners();
            return;
        }

        // 2. Set Status
        this.status = 'SYNCING';
        this.notifyListeners();

        try {
            // 3. Find candidates
            // GLOBAL FIFO: We iterate from start, looking for the first "unlocked" item.
            let actionToProcess: OfflineAction | null = null;
            let actionIndex = -1;

            for (let i = 0; i < this.queue.length; i++) {
                const action = this.queue[i];

                // CHECK LOCK
                if (this.processingPatientIds.has(action.patientId)) {
                    console.log(`[SyncManager] Skipping item ${action.id} - Patient ${action.patientId} is locked.`);
                    continue; // Skip this item, try next
                }

                // Found valid candidate
                actionToProcess = action;
                actionIndex = i;
                break; // STRICT RULE: Process ONE item per loop
            }

            // 4. If no candidate found (all locked), exit
            if (!actionToProcess) {
                console.log("[SyncManager] No processable items found (all locked or empty).");
                this.status = 'IDLE';
                this.notifyListeners();
                return;
            }

            // 5. Lock Patient
            console.log(`[SyncManager] Processing item ${actionToProcess.id} (${actionToProcess.type}) for patient ${actionToProcess.patientId}`);
            this.processingPatientIds.add(actionToProcess.patientId);

            // =========================================================
            // PHASE 7: REAL EXECUTION
            // =========================================================

            try {
                const { type, payload, id, patientId } = actionToProcess;
                let response: Response;

                console.log(`[SyncManager] 🚀 Executing API Call: ${type}`);

                const commonHeaders = {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "x-idempotency-key": id // GUARDRAIL: Idempotency
                };

                // --- EXECUTE BASED ON TYPE ---
                if (type === 'CREATE_PRESCRIPTION') {
                    // Payload is already shaped correctly in NewPatientForm
                    // It expects direct POST to PATIENT_PROCESSOR
                    response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                        method: "POST",
                        headers: commonHeaders,
                        body: JSON.stringify(payload)
                    });

                } else if (type === 'CREATE_FITNESS_CERTIFICATE') {
                    // Start of Payload Wrapping (Guardrail #2)
                    // Must wrap specifically for the backend handler
                    const wrappedPayload = {
                        action: "saveFitnessCertificate",
                        patientId: patientId,
                        data: payload
                    };

                    response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                        method: "POST",
                        headers: commonHeaders,
                        body: JSON.stringify(wrappedPayload)
                    });

                } else {
                    throw new Error(`Unknown Action Type: ${type}`);
                }

                // --- RESPONSE HANDLING ---
                console.log(`[SyncManager] API Response Status: ${response.status}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[SyncManager] API Failure Body: ${errorText}`);
                    throw new Error(`HTTP Error ${response.status}: ${errorText}`);
                }

                // Verify logical success from JSON body if needed (some APIs return 200 with success: false)
                const result = await response.json();
                if (result.success === false) { // Check explicit false, to be safe
                    throw new Error(`API Returned Logical Failure: ${result.message || JSON.stringify(result)}`);
                }

                console.log(`[SyncManager] ✅ API Success for ${id}`);

                // 6. Remove processed item (Success case ONLY)
                this.queue.splice(actionIndex, 1);
                await QueueStorage.saveQueue(this.queue);

                // 7. Unlock Patient
                this.processingPatientIds.delete(actionToProcess.patientId);
                console.log(`[SyncManager] Unlocked patient ${actionToProcess.patientId}`);

            } catch (executionError) {
                // GUARDRAIL #1: FAILURE = LOCK REMAINS
                console.error(`[SyncManager] ❌ Action Execution Failed for ${actionToProcess.id}`, executionError);
                console.warn(`[SyncManager] 🔒 Action retained in queue. Patient ${actionToProcess.patientId} remains locked.`);

                // Optional: Increment retry count logic here
                actionToProcess.retryCount = (actionToProcess.retryCount || 0) + 1;
                // We don't save the retry count increment to disk immediately to avoid disk IO spam on tight loops,
                // but we could if we wanted to survive restarts with accurate retry counts.
                // For now, in-memory increment is fine for backoff logic (if implemented).
            }

        } catch (error) {
            console.error("[SyncManager] Critical Error in process loop:", error);
        } finally {
            // 8. Loop Continuity
            this.status = 'IDLE';
            this.notifyListeners();

            // Recursive call to process next item if queue not empty
            if (this.queue.length > 0 && SyncMonitor.getIsConnected()) {
                setTimeout(() => this.processQueue(), 500); // 500ms throttle between items
            }
        }
    }

    // --- Listener Logic ---

    public addListener(listener: ChangeListener) {
        this.listeners.add(listener);
    }

    public removeListener(listener: ChangeListener) {
        this.listeners.delete(listener);
    }

    private notifyListeners() {
        this.listeners.forEach(l => l());
    }
}

export const SyncManager = new SyncManagerService();
