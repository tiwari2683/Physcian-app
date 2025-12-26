import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Shield,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Stethoscope,
  Phone,
} from "lucide-react-native";

// Import AWS Amplify Auth functions - V6+ syntax
import { confirmSignUp, resendSignUpCode } from "@aws-amplify/auth";

const { width, height } = Dimensions.get("window");

// Types
interface ConfirmUserProps {
  navigation: any;
  route: {
    params: {
      email: string;
      phone?: string;
      firstName: string;
      lastName: string;
    };
  };
}

interface ValidationErrors {
  confirmationCode?: string;
}

const ConfirmUser: React.FC<ConfirmUserProps> = ({ navigation, route }) => {
  // Extract user data from navigation params
  const { email, phone, firstName, lastName } = route.params || {};

  // State management
  const [confirmationCode, setConfirmationCode] = useState<string>("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendCountdown, setResendCountdown] = useState<number>(0);
  const [attemptsCount, setAttemptsCount] = useState<number>(0);
  const [isVerified, setIsVerified] = useState<boolean>(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Refs for better control
  const codeInputRef = useRef<TextInput>(null);
  const resendTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentCodeRef = useRef<string>("");
  const isProcessingRef = useRef<boolean>(false);

  // Component mount logging and animations
  useEffect(() => {
    console.log("📧 ConfirmUser component mounted");
    console.log("👤 User data:", { email, phone, firstName, lastName });

    // Initial entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-focus on code input after animation
    const focusTimeout = setTimeout(() => {
      codeInputRef.current?.focus();
    }, 700);

    // Cleanup timer on unmount
    return () => {
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
      }
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
      }
      clearTimeout(focusTimeout);
    };
  }, [fadeAnim, slideAnim]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown > 0) {
      resendTimerRef.current = setTimeout(() => {
        setResendCountdown(resendCountdown - 1);
      }, 1000);
    }

    return () => {
      if (resendTimerRef.current) {
        clearTimeout(resendTimerRef.current);
      }
    };
  }, [resendCountdown]);

  // Success animation
  const animateSuccess = useCallback(() => {
    Animated.sequence([
      Animated.timing(successAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1.1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [successAnim, pulseAnim]);

  // Form validation - stable function
  const validateConfirmationCode = useCallback(
    (code: string): string | null => {
      if (!code || code.trim().length === 0) {
        return "Confirmation code is required";
      }
      if (code.length < 6) {
        return "Confirmation code must be 6 digits";
      }
      if (!/^\d{6}$/.test(code)) {
        return "Confirmation code must contain only numbers";
      }
      return null;
    },
    []
  );

  // Handle confirmation code submission - stable function
  const handleConfirmSignUp = useCallback(
    async (codeToSubmit?: string) => {
      const codeValue = codeToSubmit || currentCodeRef.current;
      console.log("✅ Starting confirmation process...");

      // Prevent multiple submissions
      if (isProcessingRef.current) {
        console.log("⏸️ Already processing, skipping...");
        return;
      }

      isProcessingRef.current = true;

      // Validate code
      const codeError = validateConfirmationCode(codeValue);
      if (codeError) {
        console.log("❌ Code validation failed:", codeError);
        setErrors({ confirmationCode: codeError });
        Alert.alert(
          "Invalid Code",
          "Please enter a valid 6-digit confirmation code.",
          [{ text: "OK", style: "default" }]
        );
        isProcessingRef.current = false;
        return;
      }

      if (!email) {
        console.error("❌ No email address found");
        Alert.alert(
          "Error",
          "No email address found. Please try signing up again.",
          [
            {
              text: "Go Back",
              onPress: () => navigation.navigate("SignUp"),
              style: "default",
            },
          ]
        );
        isProcessingRef.current = false;
        return;
      }

      console.log("✅ Code validation passed");
      setIsLoading(true);
      setErrors({});
      setAttemptsCount((prev) => prev + 1);

      try {
        console.log("🔐 Confirming sign up with Amplify...");
        console.log("📧 Email:", email);
        console.log("🔢 Code:", codeValue);

        // Confirm sign up with AWS Amplify V6+ syntax
        const { isSignUpComplete, nextStep } = await confirmSignUp({
          username: email,
          confirmationCode: codeValue,
        });

        console.log("🎉 Confirmation successful:", {
          isSignUpComplete,
          nextStep,
        });

        // Set verified state and animate success
        setIsVerified(true);
        animateSuccess();

        // Show success message and navigate
        setTimeout(() => {
          Alert.alert(
            "Verification Successful! 🎉",
            `Welcome to MedApp, ${firstName}! Your account has been verified successfully. Please sign in to access your account.`,
            [
              {
                text: "Continue to Sign In",
                onPress: () => {
                  console.log("🧭 Navigating to Login");
                  navigation.reset({
                    index: 0,
                    routes: [{ name: "Login" }],
                  });
                },
                style: "default",
              },
            ]
          );
        }, 1000);
      } catch (error: any) {
        console.error("❌ Confirmation error:", error);

        // Log detailed error information
        console.log("🔍 Error details:", {
          code: error.code,
          message: error.message,
          name: error.name,
          stack: error.stack,
        });

        let errorMessage = "Verification failed. Please try again.";
        let shouldNavigateBack = false;

        // Handle specific Amplify errors
        if (error.name === "CodeMismatchException") {
          errorMessage =
            "Invalid confirmation code. Please check and try again.";
          console.log("⚠️ Code mismatch");
        } else if (error.name === "ExpiredCodeException") {
          errorMessage =
            "Confirmation code has expired. We'll send you a new one.";
          console.log("⚠️ Code expired - auto resending");
          // Auto-resend code when expired
          setTimeout(() => {
            handleResendCode();
          }, 1000);
        } else if (error.name === "LimitExceededException") {
          errorMessage =
            "Too many incorrect attempts. Please try again later or request a new code.";
          console.log("⚠️ Rate limit exceeded");
        } else if (error.name === "NotAuthorizedException") {
          errorMessage =
            "User not authorized or already confirmed. Please try signing in.";
          console.log("⚠️ Not authorized or already confirmed");
          shouldNavigateBack = true;
        } else if (error.name === "UserNotFoundException") {
          errorMessage = "User not found. Please try signing up again.";
          console.log("⚠️ User not found");
          shouldNavigateBack = true;
        } else if (error.name === "NetworkError") {
          errorMessage =
            "Network error. Please check your internet connection and try again.";
          console.log("⚠️ Network error");
        } else if (error.message) {
          errorMessage = error.message;
        }

        if (shouldNavigateBack) {
          Alert.alert("Verification Error", errorMessage, [
            {
              text: "Sign Up Again",
              onPress: () => navigation.navigate("SignUp"),
              style: "default",
            },
            {
              text: "Sign In Instead",
              onPress: () => navigation.navigate("Login"),
              style: "default",
            },
          ]);
        } else {
          Alert.alert("Verification Error", errorMessage, [
            {
              text: "Try Again",
              style: "default",
              onPress: () => {
                // Focus input after error
                setTimeout(() => {
                  codeInputRef.current?.focus();
                }, 300);
              },
            },
          ]);
        }

        // Clear the input on error
        setConfirmationCode("");
        currentCodeRef.current = "";
        codeInputRef.current?.clear();
        setTimeout(() => {
          codeInputRef.current?.focus();
        }, 500);
      } finally {
        console.log("🏁 Confirmation process completed");
        setIsLoading(false);
        isProcessingRef.current = false;
      }
    },
    [email, firstName, animateSuccess, navigation, validateConfirmationCode]
  );

  // Handle resending confirmation code
  const handleResendCode = useCallback(async () => {
    if (!email) {
      console.error("❌ No email address for resend");
      Alert.alert("Error", "No email address found.");
      return;
    }

    if (resendCountdown > 0) {
      console.log("⏰ Resend still on cooldown");
      return;
    }

    console.log("📨 Resending confirmation code...");
    setIsResending(true);

    try {
      // Resend confirmation code with AWS Amplify V6+ syntax
      const { destination, deliveryMedium } = await resendSignUpCode({
        username: email,
      });

      console.log("✅ Code resent successfully:", {
        destination,
        deliveryMedium,
      });

      // Start countdown for next resend
      setResendCountdown(60);

      // Clear current code and errors
      setConfirmationCode("");
      currentCodeRef.current = "";
      setErrors({});

      Alert.alert(
        "Code Sent! 📧",
        `A new confirmation code has been sent to ${destination}. Please check your ${deliveryMedium.toLowerCase()}.`,
        [
          {
            text: "OK",
            style: "default",
            onPress: () => {
              // Focus on input after alert
              setTimeout(() => {
                codeInputRef.current?.focus();
              }, 300);
            },
          },
        ]
      );
    } catch (error: any) {
      console.error("❌ Resend error:", error);

      let errorMessage = "Failed to resend code. Please try again.";

      if (error.name === "LimitExceededException") {
        errorMessage =
          "Too many requests. Please wait before requesting another code.";
        setResendCountdown(120); // Longer cooldown on rate limit
      } else if (error.name === "UserNotFoundException") {
        errorMessage = "User not found. Please try signing up again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert("Resend Failed", errorMessage, [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setIsResending(false);
    }
  }, [email, resendCountdown]);

  // Handle code input change - optimized to prevent focus loss
  const handleCodeChange = useCallback(
    (text: string) => {
      // Only allow digits and limit to 6 characters
      const cleanedText = text.replace(/\D/g, "").slice(0, 6);
      console.log(`📝 Code input changed: ${cleanedText}`);

      // Update both state and ref immediately
      setConfirmationCode(cleanedText);
      currentCodeRef.current = cleanedText;

      // Clear errors when user starts typing
      if (errors.confirmationCode && cleanedText.length > 0) {
        setErrors({});
      }

      // Clear any existing auto-submit timeout
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
      }

      // Auto-submit when 6 digits are entered
      if (cleanedText.length === 6 && !isProcessingRef.current && !isLoading) {
        console.log("🚀 Auto-submitting code");
        // Use timeout to ensure smooth input completion
        autoSubmitTimeoutRef.current = setTimeout(() => {
          handleConfirmSignUp(cleanedText);
        }, 1000);
      }
    },
    [errors.confirmationCode, isLoading, handleConfirmSignUp]
  );

  // Masked email for display
  const maskedEmail = useMemo(() => {
    if (!email) return "";
    const [localPart, domain] = email.split("@");
    if (localPart.length <= 2) return email;
    return `${localPart.slice(0, 2)}${"*".repeat(
      localPart.length - 2
    )}@${domain}`;
  }, [email]);

  // Masked phone for display
  const maskedPhone = useMemo(() => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 4) return phone;
    return `***-***-${digits.slice(-4)}`;
  }, [phone]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0070D6" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
          >
            {/* Enhanced Header */}
            <LinearGradient
              colors={["#0070D6", "#1A87E3", "#2E94E8"]}
              style={styles.headerGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.header}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    console.log("🔙 Back button pressed");
                    navigation.goBack();
                  }}
                >
                  <ArrowLeft size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.headerContent}>
                  <Text style={styles.headerTitle}>Verify Account</Text>
                  <Text style={styles.headerSubtitle}>
                    Complete Your Registration
                  </Text>
                </View>

                <View style={styles.headerIcon}>
                  <Shield size={28} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>

            {/* Main Content */}
            <Animated.View
              style={[
                styles.mainContent,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.contentCard}>
                {/* Welcome Section */}
                <View style={styles.welcomeSection}>
                  <View style={styles.iconContainer}>
                    <Mail size={48} color="#0070D6" />
                  </View>

                  <Text style={styles.welcomeTitle}>
                    Almost There, {firstName}!
                  </Text>

                  <Text style={styles.welcomeMessage}>
                    We've sent a confirmation code to verify your account.
                    Please check your email and enter the code below.
                  </Text>

                  {/* Contact Info Display */}
                  <View style={styles.contactInfo}>
                    <View style={styles.contactItem}>
                      <Mail size={20} color="#0070D6" />
                      <Text style={styles.contactText}>{maskedEmail}</Text>
                    </View>

                    {phone && (
                      <View style={styles.contactItem}>
                        <Phone size={20} color="#0070D6" />
                        <Text style={styles.contactText}>{maskedPhone}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Code Input Section */}
                <View style={styles.codeInputContainer}>
                  <Text style={styles.inputLabel}>
                    Confirmation Code{" "}
                    <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                  <View
                    style={[
                      styles.codeWrapper,
                      errors.confirmationCode && styles.codeWrapperError,
                      isVerified && styles.codeWrapperSuccess,
                    ]}
                  >
                    <TextInput
                      ref={codeInputRef}
                      style={styles.codeInput}
                      value={confirmationCode}
                      onChangeText={handleCodeChange}
                      placeholder="Enter 6-digit code"
                      placeholderTextColor="#A0AEC0"
                      keyboardType="numeric"
                      maxLength={6}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="sms-otp"
                      textContentType="oneTimeCode"
                      textAlign="center"
                      fontSize={24}
                      letterSpacing={8}
                      editable={!isLoading && !isVerified}
                      selectTextOnFocus={false}
                      blurOnSubmit={false}
                      returnKeyType="done"
                      contextMenuHidden={true}
                      importantForAccessibility="yes"
                      accessibilityLabel="Enter 6-digit confirmation code"
                    />

                    {isVerified && (
                      <Animated.View
                        style={[
                          styles.successIcon,
                          {
                            opacity: successAnim,
                            transform: [{ scale: pulseAnim }],
                          },
                        ]}
                      >
                        <CheckCircle size={24} color="#48BB78" />
                      </Animated.View>
                    )}
                  </View>

                  {errors.confirmationCode && (
                    <Animated.View style={styles.errorContainer}>
                      <AlertCircle size={16} color="#E53E3E" />
                      <Text style={styles.errorText}>
                        {errors.confirmationCode}
                      </Text>
                    </Animated.View>
                  )}

                  {/* Code formatting guide */}
                  <Text style={styles.codeHint}>
                    Enter the 6-digit code sent to your email
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      (isLoading || isVerified) && styles.buttonDisabled,
                    ]}
                    onPress={() => handleConfirmSignUp()}
                    disabled={isLoading || isVerified}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>
                          {isVerified ? "Verified" : "Verify Account"}
                        </Text>
                        {isVerified ? (
                          <CheckCircle size={20} color="#FFFFFF" />
                        ) : (
                          <Shield size={20} color="#FFFFFF" />
                        )}
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Resend Code Section */}
                  <View style={styles.resendSection}>
                    <Text style={styles.resendText}>
                      Didn't receive the code?
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.resendButton,
                        (resendCountdown > 0 || isResending) &&
                          styles.resendButtonDisabled,
                      ]}
                      onPress={handleResendCode}
                      disabled={resendCountdown > 0 || isResending}
                    >
                      {isResending ? (
                        <ActivityIndicator size="small" color="#0070D6" />
                      ) : (
                        <>
                          <RotateCcw size={16} color="#0070D6" />
                          <Text style={styles.resendButtonText}>
                            {resendCountdown > 0
                              ? `Resend in ${resendCountdown}s`
                              : "Resend Code"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Attempts Counter */}
                  {attemptsCount > 0 && (
                    <Text style={styles.attemptsText}>
                      Verification attempts: {attemptsCount}/5
                    </Text>
                  )}
                </View>

                {/* Help Section */}
                <View style={styles.helpSection}>
                  <Text style={styles.helpTitle}>Need Help?</Text>
                  <Text style={styles.helpText}>
                    • Check your spam/junk folder{"\n"}• Make sure you entered
                    the correct email address{"\n"}• Code expires in 15 minutes
                    {"\n"}• Contact support if issues persist
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Changed your mind?{" "}
                <TouchableOpacity
                  onPress={() => {
                    console.log("🔗 Sign In link pressed");
                    navigation.navigate("Login");
                  }}
                  style={styles.footerLinkContainer}
                >
                  <Text style={styles.footerLink}>Sign In Instead</Text>
                </TouchableOpacity>
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  headerGradient: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 112, 214, 0.3)",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingTop: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    backdropFilter: "blur(10px)",
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.85)",
    fontWeight: "500",
  },
  headerIcon: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  mainContent: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  contentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.08)",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 112, 214, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2D3748",
    marginBottom: 12,
    textAlign: "center",
  },
  welcomeMessage: {
    fontSize: 16,
    color: "#4A5568",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  contactInfo: {
    alignSelf: "stretch",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#F7FAFC",
    borderRadius: 12,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    color: "#4A5568",
    marginLeft: 8,
    fontWeight: "500",
  },
  codeInputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 8,
    textAlign: "center",
  },
  requiredAsterisk: {
    color: "#E53E3E",
  },
  codeWrapper: {
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingVertical: 20,
    paddingHorizontal: 16,
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 0, 0, 0.05)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  codeWrapperError: {
    borderColor: "#E53E3E",
  },
  codeWrapperSuccess: {
    borderColor: "#48BB78",
    backgroundColor: "#F0FFF4",
  },
  codeInput: {
    fontSize: 24,
    fontWeight: "600",
    color: "#2D3748",
    textAlign: "center",
    letterSpacing: 8,
    minHeight: 40,
  },
  successIcon: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -12,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    justifyContent: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#E53E3E",
    marginLeft: 6,
    fontWeight: "500",
  },
  codeHint: {
    fontSize: 12,
    color: "#718096",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  actionsContainer: {
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: "#0070D6",
    borderRadius: 12,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 112, 214, 0.3)",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  primaryButtonText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "600",
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resendSection: {
    alignItems: "center",
    marginBottom: 16,
  },
  resendText: {
    fontSize: 14,
    color: "#718096",
    marginBottom: 8,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "600",
    marginLeft: 6,
  },
  attemptsText: {
    fontSize: 12,
    color: "#718096",
    textAlign: "center",
    fontStyle: "italic",
  },
  helpSection: {
    backgroundColor: "#F7FAFC",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: "#718096",
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 15,
    color: "#718096",
    textAlign: "center",
    fontWeight: "500",
    flexDirection: "row",
    alignItems: "center",
  },
  footerLinkContainer: {
    display: "inline",
  },
  footerLink: {
    color: "#0070D6",
    fontWeight: "600",
    fontSize: 15,
    top: 4,
  },
});

export default ConfirmUser;
