import React, { useState, useEffect } from "react";
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Platform,
    Alert,
    Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getCurrentUser, signOut } from "@aws-amplify/auth";

const { width } = Dimensions.get("window");

interface ProfileProps {
    navigation: any;
    route: any;
}

const Profile: React.FC<ProfileProps> = ({ navigation }) => {
    const [userInfo, setUserInfo] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchUserInfo();
    }, []);

    const fetchUserInfo = async () => {
        try {
            const user = await getCurrentUser();
            setUserInfo(user);
            console.log("User info:", user);
        } catch (error) {
            console.log("No user signed in or error fetching user:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        Alert.alert(
            "Sign Out",
            "Are you sure you want to sign out?",
            [
                {
                    text: "Cancel",
                    style: "cancel",
                },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await signOut();
                            console.log("✅ User signed out successfully");
                            navigation.navigate("Login");
                        } catch (error) {
                            console.error("❌ Sign out error:", error);
                            Alert.alert("Error", "Failed to sign out. Please try again.");
                        }
                    },
                },
            ]
        );
    };

    // Tab navigation handler
    const handleTabNavigation = (tabName: string) => {
        if (tabName === "Home") {
            navigation.navigate("DoctorDashboard");
        } else if (tabName === "Patients") {
            navigation.navigate("Patients");
        } else if (tabName === "Schedule") {
            navigation.navigate("Appointments");
        } else if (tabName === "Profile") {
            // Already on profile screen
        }
    };

    const menuItems = [
        {
            icon: "person-outline",
            title: "Account Settings",
            subtitle: "Manage your account details",
            onPress: () => Alert.alert("Account Settings", "Coming soon!"),
        },
        {
            icon: "notifications-outline",
            title: "Notifications",
            subtitle: "Manage notification preferences",
            onPress: () => Alert.alert("Notifications", "Coming soon!"),
        },
        {
            icon: "shield-checkmark-outline",
            title: "Privacy & Security",
            subtitle: "Manage privacy settings",
            onPress: () => Alert.alert("Privacy & Security", "Coming soon!"),
        },
        {
            icon: "help-circle-outline",
            title: "Help & Support",
            subtitle: "Get help and contact support",
            onPress: () => Alert.alert("Help & Support", "Coming soon!"),
        },
        {
            icon: "information-circle-outline",
            title: "About",
            subtitle: "App version and information",
            onPress: () => Alert.alert("About", "Dr. Gawli App v1.0.0"),
        },
    ];

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* User Info Card */}
                <View style={styles.userCard}>
                    <View style={styles.avatarContainer}>
                        <Ionicons name="person" size={40} color="#FFFFFF" />
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>
                            {userInfo?.username || "Doctor"}
                        </Text>
                        <Text style={styles.userEmail}>
                            {userInfo?.signInDetails?.loginId || "doctor@example.com"}
                        </Text>
                    </View>
                </View>

                {/* Menu Items */}
                <View style={styles.menuSection}>
                    {menuItems.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.menuItem}
                            onPress={item.onPress}
                            activeOpacity={0.7}
                        >
                            <View style={styles.menuItemLeft}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name={item.icon as any} size={22} color="#0070D6" />
                                </View>
                                <View style={styles.menuItemText}>
                                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#CBD5E0" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    activeOpacity={0.7}
                >
                    <Ionicons name="log-out-outline" size={20} color="#E53935" />
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>

                {/* Version Info */}
                <Text style={styles.versionText}>Version 1.0.0</Text>
            </ScrollView>

            {/* Bottom Navigation */}
            <View style={styles.bottomNav}>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Home")}
                >
                    <Ionicons name="home-outline" size={24} color="#718096" />
                    <Text style={styles.navText}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Patients")}
                >
                    <Ionicons name="people-outline" size={24} color="#718096" />
                    <Text style={styles.navText}>Patients</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Schedule")}
                >
                    <Ionicons name="calendar-outline" size={24} color="#718096" />
                    <Text style={styles.navText}>Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Profile")}
                >
                    <Ionicons name="person" size={24} color="#0070D6" />
                    <Text style={[styles.navText, { color: "#0070D6" }]}>Profile</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F5F7FA",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        backgroundColor: "#FFFFFF",
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#2D3748",
    },
    content: {
        flex: 1,
        padding: 16,
    },
    userCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        padding: 20,
        borderRadius: 12,
        marginBottom: 24,
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    avatarContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: "#0070D6",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 14,
        color: "#718096",
    },
    menuSection: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        marginBottom: 24,
        overflow: "hidden",
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    menuItemLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#E3F2FD",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    menuItemText: {
        flex: 1,
    },
    menuItemTitle: {
        fontSize: 16,
        fontWeight: "500",
        color: "#2D3748",
        marginBottom: 2,
    },
    menuItemSubtitle: {
        fontSize: 13,
        color: "#718096",
    },
    signOutButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#FEE2E2",
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    signOutText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#E53935",
        marginLeft: 8,
    },
    versionText: {
        textAlign: "center",
        fontSize: 12,
        color: "#A0AEC0",
        marginBottom: 20,
    },
    bottomNav: {
        flexDirection: "row",
        justifyContent: "space-around",
        backgroundColor: "#FFFFFF",
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    navItem: {
        alignItems: "center",
    },
    navText: {
        fontSize: 12,
        color: "#718096",
        marginTop: 2,
    },
});

export default Profile;
