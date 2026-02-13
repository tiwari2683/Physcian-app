// Essential polyfills - MUST be at the very top
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "@aws-amplify/react-native";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  Platform,
  Dimensions,
  Alert,
  AppState,
  AppStateStatus,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

// AWS Amplify core imports
import { Amplify } from "aws-amplify";
import {
  getCurrentUser,
  signOut,
  AuthUser,
  fetchAuthSession,
} from "@aws-amplify/auth";

// AWS Configuration - Import your aws-exports
import awsExports from "./aws-exports";

// Import all your screens and components
import SignUpScreen from "./Components/Auth/SignUpScreen";
import SignInScreen from "./Components/Auth/SignInScreen";
import ConfirmUser from "./Components/Auth/ConfirmUser";
import ForgotPasswordScreen from "./Components/Auth/ForgotPasswordScreen";
import DoctorDashboard from "./Components/DoctorDashboard/DoctorDashboard";
import NewPatientForm from "./Components/NewPatientForm/NewPatientForm";
import Appointments from "./Components/Appointments/Appointments";
import AppointmentDetails from "./Components/Appointments/AppointmentDetails";
import NewAppointmentModal from "./Components/Appointments/NewAppointmentModal";
import PatientsData from "./Components/PatientsData/PatientsData";
import PatientDetails from "./Components/PatientsData/PatientDetails";
import FitnessCertificate from "./Components/FitnessCertificate/FitnessCertificate";
import FitnessCertificateHistory from "./Components/FitnessCertificate/FitnessCertificateHistory";
import Profile from "./Components/Profile/Profile";

// Navigation stack type
const Stack = createStackNavigator();

// Device dimensions
const { height, width } = Dimensions.get("window");

// App constants
const COLORS = {
  primary: "#3498db",
  secondary: "#2c3e50",
  background: "#f9f9f9",
  white: "#ffffff",
  success: "#27ae60",
  error: "#e74c3c",
  warning: "#f39c12",
  text: "#2c3e50",
};

const LAYOUT = {
  TOP_OFFSET: Platform.OS === "ios" ? -50 : -40,
  BOTTOM_PADDING: 40,
  HEADER_HEIGHT: Platform.OS === "ios" ? 44 : 56,
};

// App state interface
interface AppStateType {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  initialRoute: string;
  authChecked: boolean;
}

export default function App(): React.JSX.Element {
  // App state management
  const [appState, setAppState] = useState<AppStateType>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    initialRoute: "DoctorDashboard", // Always default to DoctorDashboard
    authChecked: false,
  });

  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(
    AppState.currentState
  );

  // Add refs to track initialization state
  const isInitialized = useRef(false);
  const amplifyConfigured = useRef(false);
  const navigationRef = useRef<any>(null);

  // MODIFIED: Function to check for picker operation restoration only
  const checkPickerOperationRestoration =
    useCallback(async (): Promise<string> => {
      try {
        console.log("🔄 Checking ONLY for picker operation restoration...");

        // Only check for active picker operations - nothing else
        const isPickerActive = await AsyncStorage.getItem(
          "PICKER_OPERATION_ACTIVE"
        );
        const prePickerState = await AsyncStorage.getItem("PRE_PICKER_STATE");

        console.log("📋 Picker operation check:", {
          isPickerActive: isPickerActive === "true",
          hasPrePickerState: !!prePickerState,
        });

        // ONLY restore if picker operation was specifically active
        if (isPickerActive === "true" && prePickerState) {
          try {
            const parsedState = JSON.parse(prePickerState);
            console.log(
              "🔄 Restoring from picker operation state:",
              parsedState
            );

            if (
              parsedState.currentRoute === "NewPatientForm" &&
              parsedState.isPickerOperation
            ) {
              console.log(
                "✅ Valid picker operation found, restoring to NewPatientForm"
              );
              // Clear the picker flag since we're restoring
              await AsyncStorage.removeItem("PICKER_OPERATION_ACTIVE");
              return "NewPatientForm";
            }
          } catch (e) {
            console.error("❌ Error parsing picker state:", e);
          }
        }

        console.log(
          "✅ No active picker operation, defaulting to DoctorDashboard"
        );
        return "DoctorDashboard";
      } catch (error) {
        console.error("❌ Error checking picker operation:", error);
        return "DoctorDashboard";
      }
    }, []);

  // Enhanced Amplify configuration with comprehensive error handling
  const configureAmplify = useCallback(async (): Promise<boolean> => {
    // Don't reconfigure if already configured
    if (amplifyConfigured.current) {
      console.log("✅ Amplify already configured, skipping reconfiguration");
      return true;
    }

    console.log("🔧 === AMPLIFY CONFIGURATION STARTED ===");
    console.log("⏰ Configuration timestamp:", new Date().toISOString());

    try {
      // Log the AWS exports for debugging
      // Cast to any to avoid type errors for properties not in the type definition but present in the file
      const exports = awsExports as any;
      console.log("📄 AWS Exports structure:", {
        hasAuth: !!exports.Auth,
        hasCocoa: exports.Auth?.Cognito || "No Cognito in Auth",
        region: exports.aws_project_region || exports.Auth?.Cognito?.region,
        userPoolId: exports.aws_user_pools_id || exports.Auth?.Cognito?.userPoolId,
        userPoolWebClientId: exports.aws_user_pools_web_client_id || exports.Auth?.Cognito?.userPoolClientId,
      });

      // Configure Amplify with the exports
      console.log("🚀 Configuring Amplify...");
      Amplify.configure(awsExports as any);

      // Verify configuration was successful
      const config = Amplify.getConfig();
      console.log("✅ Amplify configuration successful");
      console.log("🔍 Amplify config verification:", {
        hasAuth: !!config.Auth,
        hasCognito: !!config.Auth?.Cognito,
        userPoolId: config.Auth?.Cognito?.userPoolId || "Not found",
        userPoolClientId: config.Auth?.Cognito?.userPoolClientId || "Not found",
        region: config.Auth?.Cognito?.userPoolEndpoint || "Not found",
      });

      // Test Auth functions availability
      console.log("🧪 Testing Auth functions availability:");
      console.log(
        "   getCurrentUser:",
        typeof getCurrentUser === "function" ? "✅" : "❌"
      );
      console.log("   signOut:", typeof signOut === "function" ? "✅" : "❌");
      console.log(
        "   fetchAuthSession:",
        typeof fetchAuthSession === "function" ? "✅" : "❌"
      );

      amplifyConfigured.current = true;
      return true;
    } catch (error: any) {
      console.error("❌ === AMPLIFY CONFIGURATION FAILED ===");
      console.error("❌ Configuration error:", error);
      console.error("❌ Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      Alert.alert(
        "Configuration Error",
        "Failed to configure AWS Amplify. Please check your configuration and try again.",
        [
          {
            text: "Retry",
            onPress: () => configureAmplify(),
            style: "default",
          },
          {
            text: "Continue Anyway",
            style: "cancel",
          },
        ]
      );

      return false;
    }
  }, []);

  // Enhanced authentication check - only check if not already checked
  const checkAuthenticationStatus = useCallback(
    async (forceCheck = false): Promise<void> => {
      // Only check auth if forced or if we haven't checked yet
      if (!forceCheck && appState.authChecked) {
        console.log("🔐 Auth already checked, skipping recheck");
        return;
      }

      console.log("🔐 === AUTHENTICATION STATUS CHECK STARTED ===");
      console.log("⏰ Auth check timestamp:", new Date().toISOString());

      try {
        setAppState((prev) => ({ ...prev, isLoading: true }));

        // Check if user is currently authenticated
        console.log("👤 Checking current user...");
        const currentUser = await getCurrentUser();

        if (currentUser) {
          console.log("✅ User is authenticated:", {
            userId: currentUser.userId,
            username: currentUser.username,
            signInDetails: currentUser.signInDetails?.loginId,
          });

          // Get auth session for additional details
          try {
            const session = await fetchAuthSession();
            // Check for expiration safely using type assertion or checking properties
            const sessionCreds = session.credentials as any;
            console.log("🎫 Auth session details:", {
              // Fix for 'Property expired does not exist on type AWSCredentials'
              isValid: sessionCreds ? (sessionCreds.expiration ? new Date(sessionCreds.expiration) > new Date() : !sessionCreds.expired) : false,
              identityId: session.identityId,
              hasTokens: !!session.tokens,
            });
          } catch (sessionError) {
            console.warn("⚠️ Could not fetch auth session:", sessionError);
          }

          setAppState((prev) => ({
            ...prev,
            isAuthenticated: true,
            user: currentUser,
            isLoading: false,
            authChecked: true,
          }));
        } else {
          console.log("ℹ️ No authenticated user found");
          setAppState((prev) => ({
            ...prev,
            isAuthenticated: false,
            user: null,
            isLoading: false,
            authChecked: true,
          }));
        }
      } catch (error: any) {
        console.log("ℹ️ === NO AUTHENTICATED USER (NORMAL) ===");
        console.log("ℹ️ Auth check result: No current user");
        console.log("ℹ️ Error details:", {
          name: error.name,
          message: error.message,
        });

        // This is expected when no user is signed in
        setAppState((prev) => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          isLoading: false,
          authChecked: true,
        }));
      }
    },
    [appState.authChecked]
  );

  // MODIFIED: Handle app state changes with better navigation preservation
  const handleAppStateChange = useCallback(
    (nextAppState: AppStateStatus) => {
      console.log("📱 App state changed:", appStateStatus, "->", nextAppState);

      // Suppress auth check if a critical operation is in progress
      // Cast window to any to access isCriticalOperation
      const win = typeof window !== 'undefined' ? (window as any) : undefined;
      if (win && win.isCriticalOperation) {
        console.log("🔒 Suppressing auth check during critical operation");
        setAppStateStatus(nextAppState);
        return;
      }

      if (
        appStateStatus.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        console.log("🔄 App came to foreground");

        // Check if this was a picker operation
        AsyncStorage.getItem("PICKER_OPERATION_ACTIVE").then(
          (isPickerActive) => {
            if (isPickerActive === "true") {
              console.log(
                "🔄 Returning from picker operation, preserving navigation state"
              );
              // Don't do anything that might cause navigation changes
              return;
            }

            // Only do a light auth check if already initialized and not returning from picker
            if (isInitialized.current) {
              console.log(
                "🔄 Doing light auth check on foreground (no navigation changes)"
              );
              checkAuthenticationStatus(true); // Force a single auth check
            }
          }
        );
      }

      setAppStateStatus(nextAppState);
    },
    [appStateStatus, checkAuthenticationStatus]
  );

  // MODIFIED: App initialization that defaults to DoctorDashboard
  const initializeApp = useCallback(async (): Promise<void> => {
    // Prevent multiple initializations
    if (isInitialized.current) {
      console.log("✅ App already initialized, skipping reinit");
      return;
    }

    console.log("🚀 === APP INITIALIZATION STARTED ===");
    console.log("⏰ Initialization timestamp:", new Date().toISOString());
    console.log("📱 Platform details:", {
      OS: Platform.OS,
      Version: Platform.Version,
      screenWidth: width,
      screenHeight: height,
    });

    try {
      // Step 1: Check ONLY for picker operation restoration
      const initialRoute = await checkPickerOperationRestoration();
      console.log("🧭 Initial route determined:", initialRoute);

      // Step 2: Configure Amplify
      const configSuccess = await configureAmplify();
      if (!configSuccess) {
        console.warn("⚠️ Amplify configuration failed, but continuing...");
      }

      // Step 3: Check authentication status
      await checkAuthenticationStatus();


      // Step 4: Update app state with correct initial route
      setAppState((prev) => ({
        ...prev,
        initialRoute: initialRoute,
      }));

      // Mark as initialized
      isInitialized.current = true;

      console.log("✅ === APP INITIALIZATION COMPLETED ===");
      console.log("✅ App ready for use with initial route:", initialRoute);
    } catch (error: any) {
      console.error("❌ === APP INITIALIZATION FAILED ===");
      console.error("❌ Initialization error:", error);

      // Set safe defaults if initialization fails
      setAppState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        authChecked: true,
        initialRoute: "DoctorDashboard", // Always default to DoctorDashboard
      }));

      Alert.alert(
        "Initialization Error",
        "There was an issue starting the app. Some features may not work properly.",
        [{ text: "OK", style: "default" }]
      );
    }
  }, [
    configureAmplify,
    checkAuthenticationStatus,
    checkPickerOperationRestoration,
  ]);

  // App mount effect - MODIFIED to prevent reinitialization
  useEffect(() => {
    console.log("📦 === APP COMPONENT MOUNTED ===");
    console.log("🎯 Starting app initialization...");

    // Only initialize if not already initialized
    if (!isInitialized.current) {
      initializeApp();
    } else {
      console.log("✅ App already initialized, skipping initialization");
    }

    // Set up app state listener
    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Cleanup function
    return () => {
      console.log("🧹 App component cleanup");
      appStateSubscription?.remove();
      // DON'T reset initialization flags on cleanup
      // This prevents reinitialization on return from background
    };
  }, [initializeApp, handleAppStateChange]);

  // MODIFIED: Navigation state change handler - cleaner logging
  const handleNavigationStateChange = useCallback((state: any) => {
    const currentRoute = state?.routes?.[state.index];
    console.log("🧭 Navigation changed to:", currentRoute?.name);

    // Log additional navigation details for debugging
    if (currentRoute) {
      console.log("📍 Route details:", {
        name: currentRoute.name,
        params: currentRoute.params,
        key: currentRoute.key,
      });

      // Save current navigation state ONLY for NewPatientForm (for picker operations)
      if (currentRoute.name === "NewPatientForm") {
        const navigationState = {
          routeName: currentRoute.name,
          params: currentRoute.params,
          timestamp: Date.now(),
        };

        AsyncStorage.setItem(
          "CURRENT_NAVIGATION_STATE",
          JSON.stringify(navigationState)
        )
          .then(() => console.log("💾 Saved current navigation state"))
          .catch((error) =>
            console.error("❌ Error saving navigation state:", error)
          );
      }
    }
  }, []);

  // Navigation ready handler
  const handleNavigationReady = useCallback(() => {
    console.log("🧭 Navigation container ready");
    console.log("📱 App state:", {
      isAuthenticated: appState.isAuthenticated,
      initialRoute: appState.initialRoute,
      authChecked: appState.authChecked,
    });
  }, [appState]);

  // Loading screen component
  if (appState.isLoading || !appState.authChecked) {
    return (
      <SafeAreaProvider>
        <StatusBar hidden={true} />
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            {/* You can add a loading spinner or logo here */}
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  // Main app render
  return (
    <SafeAreaProvider>
      <StatusBar
        hidden={true}
        backgroundColor={COLORS.primary}
        barStyle="light-content"
      />
      <View style={styles.absoluteContainer}>
        <NavigationContainer
          ref={navigationRef}
          theme={{
            dark: false,
            colors: {
              background: "transparent",
              primary: COLORS.primary,
              card: COLORS.white,
              text: COLORS.text,
              border: COLORS.background,
              notification: COLORS.error,
            },
            fonts: {
              regular: {
                fontFamily: 'System',
                fontWeight: '400',
              },
              medium: {
                fontFamily: 'System',
                fontWeight: '500',
              },
              bold: {
                fontFamily: 'System',
                fontWeight: '700',
              },
              heavy: {
                fontFamily: 'System',
                fontWeight: '900',
              },
            },
          }}
          onReady={handleNavigationReady}
          onStateChange={handleNavigationStateChange}
        >
          <Stack.Navigator
            initialRouteName={appState.initialRoute}
            screenOptions={{
              headerShown: false,
              // contentStyle is for native-stack, removed for stack navigator
              cardStyle: styles.cardStyle,
              gestureEnabled: true,
              cardStyleInterpolator: ({ current, layouts }) => {
                return {
                  cardStyle: {
                    transform: [
                      {
                        translateX: current.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [layouts.screen.width, 0],
                        }),
                      },
                    ],
                  },
                };
              },
            }}
          >
            {/* Authentication Screens */}
            <Stack.Screen
              name="SignUp"
              component={SignUpScreen}
              // Removed contentStyle as it is not a valid prop here for Stack.Screen options in @react-navigation/stack
              listeners={{
                focus: () => console.log("📍 SignUp screen focused"),
                blur: () => console.log("📍 SignUp screen blurred"),
              }}
            />

            <Stack.Screen
              name="Login"
              component={SignInScreen}
              // Removed contentStyle
              listeners={{
                focus: () => console.log("📍 Login screen focused"),
                blur: () => console.log("📍 Login screen blurred"),
              }}
            />

            <Stack.Screen
              name="ConfirmUser"
              // Fix type incompatibility with any cast
              component={ConfirmUser as any}
              // Removed contentStyle
              listeners={{
                focus: () => console.log("📍 ConfirmUser screen focused"),
                blur: () => console.log("📍 ConfirmUser screen blurred"),
              }}
            />

            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen as any}
              listeners={{
                focus: () => console.log("📍 ForgotPassword screen focused"),
                blur: () => console.log("📍 ForgotPassword screen blurred"),
              }}
            />

            {/* Main App Screens */}
            <Stack.Screen
              name="DoctorDashboard"
              component={DoctorDashboard}
              // Removed contentStyle
              initialParams={{ isAuthenticated: appState.isAuthenticated }}
              listeners={{
                focus: () => console.log("📍 DoctorDashboard screen focused"),
                blur: () => console.log("📍 DoctorDashboard screen blurred"),
              }}
            />

            <Stack.Screen
              name="NewPatientForm"
              component={NewPatientForm}
              options={{
                // Removed contentStyle
                gestureEnabled: true,
              }}
              listeners={{
                focus: () => console.log("📍 NewPatientForm screen focused"),
                blur: () => console.log("📍 NewPatientForm screen blurred"),
              }}
            />

            <Stack.Screen
              name="Appointments"
              component={Appointments}
              options={{
                // Removed contentStyle
                gestureEnabled: true,
              }}
              listeners={{
                focus: () => console.log("📍 Appointments screen focused"),
                blur: () => console.log("📍 Appointments screen blurred"),
              }}
            />

            <Stack.Screen
              name="AppointmentDetails"
              component={AppointmentDetails}
              options={{
                gestureEnabled: true,
              }}
              listeners={{
                focus: () => console.log("📍 AppointmentDetails screen focused"),
                blur: () => console.log("📍 AppointmentDetails screen blurred"),
              }}
            />

            <Stack.Screen
              name="NewAppointmentModal"
              // Fix type incompatibility with any cast
              component={NewAppointmentModal as any}
              options={{
                // Removed contentStyle
                presentation: "modal", // This might warn if using stack instead of native-stack, but kept as requested
                gestureEnabled: true,
              }}
              listeners={{
                focus: () =>
                  console.log("📍 NewAppointmentModal screen focused"),
                blur: () =>
                  console.log("📍 NewAppointmentModal screen blurred"),
              }}
            />

            <Stack.Screen
              name="Patients"
              component={PatientsData}
              options={{
                // Removed contentStyle
                gestureEnabled: true,
              }}
              listeners={{
                focus: () => console.log("📍 Patients screen focused"),
                blur: () => console.log("📍 Patients screen blurred"),
              }}
            />

            <Stack.Screen
              name="FitnessCertificate"
              // Fix type incompatibility with any cast
              component={FitnessCertificate as any}
              options={{
                // Removed contentStyle
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="FitnessCertificateHistory"
              component={FitnessCertificateHistory as any}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="PatientDetails"
              component={PatientDetails}
              options={{
                gestureEnabled: true,
                headerShown: false
              }}
            />


            <Stack.Screen
              name="Profile"
              component={Profile}
              options={{
                // Removed contentStyle
                gestureEnabled: true,
              }}
              listeners={{
                focus: () => console.log("📍 Profile screen focused"),
                blur: () => console.log("📍 Profile screen blurred"),
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

// Enhanced styles with better organization
const styles = StyleSheet.create({
  absoluteContainer: {
    position: "absolute",
    top: LAYOUT.TOP_OFFSET,
    left: 0,
    right: 0,
    bottom: -LAYOUT.BOTTOM_PADDING,
    height: height + Math.abs(LAYOUT.TOP_OFFSET) + LAYOUT.BOTTOM_PADDING,
    backgroundColor: COLORS.background,
  },
  screenContent: {
    paddingTop: 0,
    paddingBottom: LAYOUT.BOTTOM_PADDING,
    marginTop: 0,
    flex: 1,
  },
  cardStyle: {
    backgroundColor: "transparent",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.1)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});

// Final module loaded log
console.log("📦 === APP.TSX MODULE LOADED SUCCESSFULLY ===");
console.log("✅ AWS Amplify React Native setup complete");
console.log("🎯 App ready for initialization");
console.log("🏥 App will always load DoctorDashboard by default");
