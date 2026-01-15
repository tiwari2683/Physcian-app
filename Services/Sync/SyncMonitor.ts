/**
 * SyncMonitor.ts
 * 
 * Thin wrapper over NetInfo to monitor compliance with "Online" requirement.
 * Emits connectivity changes but contains NO queue logic.
 */

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

type ConnectionListener = (isConnected: boolean) => void;

class SyncMonitorService {
    private isConnected: boolean = true;
    private listeners: Set<ConnectionListener> = new Set();
    private unsubscribeNetInfo: (() => void) | null = null;

    constructor() {
        this.init();
    }

    private init() {
        // Initial check
        NetInfo.fetch().then(state => {
            this.updateState(state);
        });

        // Subscribe to updates
        this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
            this.updateState(state);
        });
    }

    private updateState(state: NetInfoState) {
        const previousState = this.isConnected;
        // We consider "connected" only if isConnected is true AND isInternetReachable is NOT false
        // (isInternetReachable can be null initially, we treat that as potentially connected)
        this.isConnected = !!state.isConnected && state.isInternetReachable !== false;

        if (this.isConnected !== previousState) {
            console.log(`[SyncMonitor] Network State Changed: ${this.isConnected ? 'ONLINE' : 'OFFLINE'}`);
            this.notifyListeners();
        }
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    public addListener(listener: ConnectionListener) {
        this.listeners.add(listener);
        // Initialize new listener immediately
        listener(this.isConnected);
    }

    public removeListener(listener: ConnectionListener) {
        this.listeners.delete(listener);
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener(this.isConnected));
    }
}

// Export singleton instance
export const SyncMonitor = new SyncMonitorService();
