
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSync } from '../../../Context/SyncContext';

interface BlockingBannerProps {
    patientId: string;
}

/**
 * BlockingBanner
 * 
 * Displays a non-dismissible warning if the patient has pending offline actions.
 * Used to inform the doctor that they cannot create new visits until sync completes.
 */
export const BlockingBanner: React.FC<BlockingBannerProps> = ({ patientId }) => {
    const { getPendingActionsForPatient, isOnline, syncStatus, queueLength } = useSync();

    // Re-calculate pending actions when queueLength changes (context update triggers re-render)
    const pendingActions = getPendingActionsForPatient(patientId);

    if (pendingActions.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>⚠️ Pending Unsynced Changes</Text>

                <Text style={styles.message}>
                    This patient has {pendingActions.length} unsynced action{pendingActions.length !== 1 ? 's' : ''}.
                    You cannot create new records until these are synced to the server.
                </Text>

                <View style={styles.statusContainer}>
                    <Text style={[
                        styles.statusText,
                        isOnline ? styles.statusOnline : styles.statusOffline
                    ]}>
                        Status: {isOnline ? (syncStatus === 'SYNCING' ? 'Syncing...' : 'Waiting to Sync') : 'Waiting for Internet'}
                    </Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFF4F4', // Light red background
        borderBottomWidth: 1,
        borderBottomColor: '#FFCDD2',
        padding: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    content: {
        gap: 4,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#C62828', // Darker red
        marginBottom: 4,
    },
    message: {
        fontSize: 14,
        color: '#D32F2F',
        lineHeight: 20,
    },
    statusContainer: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 13,
        fontWeight: '600',
    },
    statusOnline: {
        color: '#E65100', // Orange
    },
    statusOffline: {
        color: '#C62828', // Red
    },
});
