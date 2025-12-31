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
    StatusBar,
    Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getCurrentUser, signOut } from "@aws-amplify/auth";
import { LinearGradient } from "expo-linear-gradient";

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
                            navigation.reset({
                                index: 0,
                                routes: [{ name: "Login" }],
                            });
                        } catch (error) {
                            console.error("❌ Sign out error:", error);
                            // Fallback navigation even on error
                            navigation.reset({
                                index: 0,
                                routes: [{ name: "Login" }],
                            });
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
            icon: "settings-outline",
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
            title: "About App",
            subtitle: "Version 1.0.0",
            onPress: () => Alert.alert("About", "Dr. Gawli App v1.0.0\nBuilt with ❤️ for Doctors"),
        },
    ];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0070D6" />

            {/* Premium Gradient Header */}
            <LinearGradient
                colors={["#0070D6", "#0056A4"]}
                style={styles.headerGradient}
            >
                <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerSafeArea}>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitle}>My Profile</Text>
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Floating User Card */}
                <View style={styles.userCard}>
                    <View style={styles.avatarRow}>
                        <View style={styles.avatarContainer}>
                            <Text style={styles.avatarText}>
                                {userInfo?.username ? userInfo.username.substring(0, 1).toUpperCase() : "D"}
                            </Text>
                            <View style={styles.onlineBadge} />
                        </View>
                        <View style={styles.userInfo}>
                            <Text style={styles.userName}>
                                {userInfo?.username || "Doctor"}
                            </Text>
                            <Text style={styles.userRole}>General Physician</Text>
                            <Text style={styles.userEmail}>
                                {userInfo?.signInDetails?.loginId || "doctor@example.com"}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>--</Text>
                            <Text style={styles.statLabel}>Patients</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>--</Text>
                            <Text style={styles.statLabel}>Exp. Yrs</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>4.9</Text>
                            <Text style={styles.statLabel}>Rating</Text>
                        </View>
                    </View>
                </View>

                {/* Menu Section */}
                <View style={styles.sectionTitleContainer}>
                    <Text style={styles.sectionTitle}>Settings & Preferences</Text>
                </View>

                <View style={styles.menuContainer}>
                    {menuItems.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[styles.menuItem, index === menuItems.length - 1 && styles.menuItemLast]}
                            onPress={item.onPress}
                            activeOpacity={0.7}
                        >
                            <View style={styles.menuIconBox}>
                                <Ionicons name={item.icon as any} size={22} color="#0070D6" />
                            </View>
                            <View style={styles.menuContent}>
                                <Text style={styles.menuTitle}>{item.title}</Text>
                                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#CBD5E0" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    activeOpacity={0.8}
                >
                    <Ionicons name="log-out-outline" size={22} color="#E53935" />
                    <Text style={styles.signOutText}>Sign Out from App</Text>
                </TouchableOpacity>

                <Text style={styles.versionText}>App Version 1.0.0 (Build 102)</Text>
                <View style={{ height: 80 }} />
            </ScrollView>

            {/* Bottom Navigation */}
            <View style={styles.bottomNav}>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Home")}
                >
                    <Ionicons name="home-outline" size={24} color="#A0AEC0" />
                    <Text style={[styles.navText, { color: "#A0AEC0" }]}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Patients")}
                >
                    <Ionicons name="people-outline" size={24} color="#A0AEC0" />
                    <Text style={[styles.navText, { color: "#A0AEC0" }]}>Patients</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Schedule")}
                >
                    <Ionicons name="calendar-outline" size={24} color="#A0AEC0" />
                    <Text style={[styles.navText, { color: "#A0AEC0" }]}>Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => handleTabNavigation("Profile")}
                >
                    <View style={styles.activeNavIcon}>
                        <Ionicons name="person" size={24} color="#0070D6" />
                    </View>
                    <Text style={[styles.navText, { color: "#0070D6", fontWeight: "600" }]}>Profile</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F5F7FA",
    },
    headerGradient: {
        paddingBottom: 60, // Space for the floating card overlap
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    },
    headerSafeArea: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTitleContainer: {
        alignItems: "center",
        paddingVertical: 10,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#FFFFFF",
        letterSpacing: 0.5,
    },
    scrollView: {
        flex: 1,
        marginTop: -50,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    userCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 10,
        marginBottom: 24,
    },
    avatarRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    avatarContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: "#EBF8FF",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 4,
        borderColor: "#FFFFFF",
        shadowColor: "#0070D6",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    avatarText: {
        fontSize: 32,
        fontWeight: "700",
        color: "#0070D6",
    },
    onlineBadge: {
        position: "absolute",
        bottom: 2,
        right: 2,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#4CAF50",
        borderWidth: 2,
        borderColor: "#FFFFFF",
    },
    userInfo: {
        marginLeft: 16,
        flex: 1,
    },
    userName: {
        fontSize: 22,
        fontWeight: "700",
        color: "#1A202C",
        marginBottom: 2,
    },
    userRole: {
        fontSize: 14,
        color: "#0070D6",
        fontWeight: "600",
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 13,
        color: "#718096",
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    statItem: {
        alignItems: "center",
        flex: 1,
    },
    statValue: {
        fontSize: 18,
        fontWeight: "700",
        color: "#2D3748",
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 12,
        color: "#718096",
        fontWeight: "500",
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: "#E2E8F0",
    },
    sectionTitleContainer: {
        marginBottom: 12,
        marginLeft: 4,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#4A5568",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    menuContainer: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    menuItemLast: {
        borderBottomWidth: 0,
    },
    menuIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#EBF8FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    menuContent: {
        flex: 1,
    },
    menuTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 2,
    },
    menuSubtitle: {
        fontSize: 12,
        color: "#A0AEC0",
    },
    signOutButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        padding: 18,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: "#FED7D7",
        shadowColor: "#E53935",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    signOutText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#E53935",
        marginLeft: 10,
    },
    versionText: {
        textAlign: "center",
        fontSize: 12,
        color: "#CBD5E0",
    },
    bottomNav: {
        flexDirection: "row",
        justifyContent: "space-around",
        backgroundColor: "#FFFFFF",
        paddingVertical: 12,
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
        borderTopWidth: 1,
        borderTopColor: "#F1F5F9",
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        elevation: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    navItem: {
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    activeNavIcon: {
        // backgroundColor: "#EBF8FF",
        // padding: 6,
        // borderRadius: 20,
        marginBottom: 2,
    },
    navText: {
        fontSize: 11,
        marginTop: 4,
        fontWeight: "500",
    },
});

export default Profile;
