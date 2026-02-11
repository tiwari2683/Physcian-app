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
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
  Stethoscope,
  User,
  Lock,
  Mail,
  RefreshCw,
} from "lucide-react-native";

// AWS Amplify imports - FIXED FOR EXPO COMPATIBILITY
import { Amplify } from "aws-amplify";
import {
  signIn,
  confirmSignIn,
  resendSignUpCode,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";

// AWS Configuration - FIXED FOR EXPO
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-2_xS1ceU5jz",
      userPoolClientId: "5b2d4nvfcmji7n8rhc74pj6t1g",
      region: "us-east-2",
      signUpVerificationMethod: "code" as const,
    },
  },
};

// Configure Amplify - THIS IS CRITICAL
try {
  Amplify.configure(awsConfig);
  console.log("✅ Amplify configured successfully");
} catch (error) {
  console.error("❌ Amplify configuration failed:", error);
}

const { width, height } = Dimensions.get("window");

// Types
interface SignInFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface ValidationErrors {
  email?: string;
  password?: string;
  general?: string;
}

interface SignInScreenProps {
  navigation: any;
  route?: any;
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  // Form state - Using refs to avoid re-renders on every keystroke
  const formDataRef = useRef<SignInFormData>({
    email: "",
    password: "",
    rememberMe: false,
  });

  // Only UI state that needs to trigger re-renders
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isResendingCode, setIsResendingCode] = useState<boolean>(false);

  // Force re-render when needed (for validation errors, checkbox changes, etc.)
  const [, forceUpdate] = useState({});
  const triggerRerender = useCallback(() => forceUpdate({}), []);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Refs for form inputs
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Debug: Check Amplify configuration and availability
  const checkAmplifyConfiguration = useCallback(async () => {
    try {
      console.log("🔍 === AMPLIFY CONFIGURATION CHECK ===");
      console.log("✅ Amplify configured successfully");
      console.log(
        "✅ signIn function available:",
        typeof signIn === "function"
      );
      console.log(
        "✅ confirmSignIn function available:",
        typeof confirmSignIn === "function"
      );
      console.log(
        "✅ resendSignUpCode function available:",
        typeof resendSignUpCode === "function"
      );
      console.log(
        "✅ getCurrentUser function available:",
        typeof getCurrentUser === "function"
      );

      // Try to get current user to test if Amplify is properly configured
      try {
        const currentUser = await getCurrentUser();
        console.log("ℹ️ Current user already signed in:", currentUser);
        return true;
      } catch (error: any) {
        console.log(
          "ℹ️ No current user signed in (this is normal for sign-in screen)"
        );
        console.log("ℹ️ Error details:", {
          name: error.name,
          message: error.message,
          code: error.code,
        });
        return true; // This is expected on sign-in screen
      }
    } catch (error: any) {
      console.error("❌ CRITICAL: Amplify configuration check failed:", error);
      console.error("❌ Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      });

      Alert.alert(
        "Configuration Error",
        "AWS Amplify is not properly configured. Please check your setup and try again.",
        [{ text: "OK", style: "default" }]
      );
      return false;
    }
  }, []);

  // Component mount logging and entrance animation
  useEffect(() => {


    // Check Amplify configuration on mount
    checkAmplifyConfiguration();

    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    console.log("✅ Component initialization completed");
  }, [fadeAnim, slideAnim, checkAmplifyConfiguration]);

  // Enhanced form validation with real-time feedback
  const validateField = useCallback(
    (
      field: keyof SignInFormData,
      value: string | boolean,
      currentFormData?: SignInFormData
    ): string | null => {
      console.log(
        `🔍 Validating field: ${field} with value:`,
        typeof value === "string" ? value.substring(0, 10) + "..." : value
      );

      const formDataToUse = currentFormData || formDataRef.current;

      switch (field) {
        case "email":
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!value || typeof value !== "string") {
            console.log(`❌ Email validation failed: empty or invalid type`);
            return "Email is required";
          }
          if (!emailRegex.test(value)) {
            console.log(`❌ Email validation failed: invalid format`);
            return "Please enter a valid email address";
          }
          console.log(`✅ Email validation passed`);
          return null;

        case "password":
          if (!value || typeof value !== "string") {
            console.log(`❌ Password validation failed: empty or invalid type`);
            return "Password is required";
          }
          if (value.length < 1) {
            console.log(`❌ Password validation failed: empty password`);
            return "Password cannot be empty";
          }
          console.log(`✅ Password validation passed`);
          return null;

        default:
          console.log(`⚠️ Unknown field for validation: ${field}`);
          return null;
      }
    },
    []
  );

  const validateForm = useCallback(
    (currentFormData: SignInFormData): boolean => {
      console.log("🔍 === FORM VALIDATION STARTED ===");
      console.log("📋 Form data to validate:", {
        email: currentFormData.email
          ? currentFormData.email.substring(0, 10) + "..."
          : "empty",
        password: currentFormData.password ? "[HIDDEN]" : "empty",
        rememberMe: currentFormData.rememberMe,
      });

      const newErrors: ValidationErrors = {};

      // Validate email and password only
      ["email", "password"].forEach((key) => {
        const error = validateField(
          key as keyof SignInFormData,
          currentFormData[key as keyof SignInFormData],
          currentFormData
        );
        if (error) {
          newErrors[key as keyof ValidationErrors] = error;
          console.log(`❌ Validation error for ${key}:`, error);
        }
      });

      setErrors(newErrors);
      const isValid = Object.keys(newErrors).length === 0;
      console.log("📋 === FORM VALIDATION COMPLETED ===");
      console.log(
        "📋 Form validation result:",
        isValid ? "✅ Valid" : "❌ Invalid"
      );
      console.log("📋 Total errors found:", Object.keys(newErrors).length);

      if (!isValid) {
        console.log("📋 Validation errors:", newErrors);
      }

      return isValid;
    },
    [validateField]
  );

  // Enhanced sign-in handler with comprehensive debugging and error handling
  const handleSignIn = useCallback(async () => {
    console.log("🔐 === SIGN IN PROCESS STARTED ===");
    console.log("⏰ Timestamp:", new Date().toISOString());

    // Pre-validation checks
    console.log("🔍 Pre-validation form data check:");
    console.log("📧 Email:", formDataRef.current.email ? "Present" : "Missing");
    console.log(
      "🔒 Password:",
      formDataRef.current.password ? "Present" : "Missing"
    );
    console.log("💾 Remember Me:", formDataRef.current.rememberMe);

    if (!validateForm(formDataRef.current)) {
      console.log("❌ === FORM VALIDATION FAILED ===");
      Alert.alert(
        "Please Check Your Information",
        "Please enter a valid email and password to continue.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }

    console.log("✅ Form validation passed, proceeding with sign-in");
    setIsLoading(true);
    setErrors({}); // Clear any previous errors

    try {
      const { email, password } = formDataRef.current;

      console.log("📝 === SIGN IN ATTEMPT ===");
      console.log("👤 Username (email):", email);
      console.log("🔒 Password length:", password.length);
      console.log("⏰ Sign-in attempt timestamp:", new Date().toISOString());

      // Double-check Amplify availability before proceeding
      console.log("🔍 Final Amplify function check before sign-in:");
      console.log("🔧 signIn function type:", typeof signIn);

      // Additional environment checks
      console.log("🌍 Environment checks:");
      console.log("📱 Platform:", Platform.OS);

      // Attempt sign-in with enhanced error catching
      console.log("🚀 === CALLING AWS AMPLIFY SIGNIN ===");

      let signInResult;
      try {
        signInResult = await signIn({
          username: email,
          password: password,
        });
        console.log("🎉 SignIn call completed successfully");
      } catch (signInError: any) {
        console.error("💥 SignIn call threw an error:");
        console.error("💥 Error object:", signInError);
        console.error("💥 Error name:", signInError.name);
        console.error("💥 Error message:", signInError.message);
        console.error("💥 Error code:", signInError.code);

        // Check for the specific React Native linking error
        if (
          signInError.message?.includes("@aws-amplify/react-native") ||
          signInError.message?.includes("doesn't seem to be linked") ||
          signInError.name === "Unknown"
        ) {
          throw new Error("EXPO_COMPATIBILITY_ERROR");
        }

        throw signInError; // Re-throw to be handled by outer catch
      }

      console.log("📊 === SIGN IN RESPONSE ANALYSIS ===");
      console.log("📦 Raw response:", signInResult);
      console.log("📦 Response type:", typeof signInResult);
      console.log(
        "📦 Response keys:",
        signInResult ? Object.keys(signInResult) : "No keys"
      );

      if (signInResult) {
        console.log("✅ isSignedIn:", signInResult.isSignedIn);
        console.log("📋 nextStep:", signInResult.nextStep);
        console.log("📋 nextStep type:", typeof signInResult.nextStep);

        if (signInResult.nextStep) {
          console.log(
            "📋 nextStep.signInStep:",
            signInResult.nextStep.signInStep
          );
          console.log("📋 nextStep keys:", Object.keys(signInResult.nextStep));
        }
      }

      const { isSignedIn, nextStep } = signInResult;

      // Handle different sign in scenarios
      if (isSignedIn) {
        console.log("✅ === USER SUCCESSFULLY SIGNED IN ===");
        console.log("🎉 Sign-in completed at:", new Date().toISOString());
        console.log("🧭 Navigating to DoctorDashboard");
        navigation.navigate("DoctorDashboard", { isAuthenticated: true });
        // Alert.alert(
        //   "Welcome Back! 🎉",
        //   "You have successfully signed in to MedApp.",
        //   [
        //     {
        //       text: "Continue",
        //       onPress: () => {
        //         console.log("🧭 Navigating to DoctorDashboard");
        //         navigation.navigate("DoctorDashboard");
        //       },
        //       style: "default",
        //     },
        //   ]
        // );
      } else if (nextStep?.signInStep === "CONFIRM_SIGN_UP") {
        console.log("⚠️ === USER NEEDS TO CONFIRM SIGN UP ===");
        console.log("📧 Verification required for:", email);

        Alert.alert(
          "Account Verification Required",
          "Your account needs to be verified. Please check your email for a verification code, or we can resend it for you.",
          [
            {
              text: "Resend Code",
              onPress: () => {
                console.log("📧 User requested to resend verification code");
                handleResendVerificationCode();
              },
              style: "default",
            },
            {
              text: "I'll Check Email",
              style: "cancel",
            },
          ]
        );
      } else if (
        nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
      ) {
        console.log("⚠️ === NEW PASSWORD REQUIRED ===");

        Alert.alert(
          "New Password Required",
          "You need to set a new password for your account.",
          [{ text: "OK", style: "default" }]
        );
        // Here you would typically navigate to a change password screen
      } else if (nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_SMS_CODE") {
        console.log("⚠️ === SMS MFA REQUIRED ===");

        Alert.alert(
          "SMS Verification Required",
          "Please check your phone for a verification code.",
          [{ text: "OK", style: "default" }]
        );
        // Here you would typically navigate to MFA verification screen
      } else if (nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
        console.log("⚠️ === TOTP MFA REQUIRED ===");

        Alert.alert(
          "Authenticator App Required",
          "Please enter the code from your authenticator app.",
          [{ text: "OK", style: "default" }]
        );
      } else {
        console.log("❓ === UNEXPECTED SIGN IN STATE ===");
        console.log("❓ Received nextStep:", nextStep);
        console.log("❓ Full response:", signInResult);

        Alert.alert(
          "Additional Verification Required",
          `Please complete the additional verification steps. Step: ${nextStep?.signInStep || "Unknown"
          }`,
          [{ text: "OK", style: "default" }]
        );
      }
    } catch (error: any) {
      console.error("❌ === SIGN IN ERROR OCCURRED ===");
      console.error("❌ Error timestamp:", new Date().toISOString());
      console.error("❌ Raw error object:", error);
      console.error("❌ Error constructor:", error.constructor?.name);

      // Comprehensive error logging
      console.log("🔍 === DETAILED ERROR ANALYSIS ===");
      console.log("🔍 Error type:", typeof error);
      console.log("🔍 Error name:", error.name);
      console.log("🔍 Error message:", error.message);
      console.log("🔍 Error code:", error.code);

      let errorMessage =
        "We encountered an issue signing you in. Please try again.";
      let shouldOfferResend = false;

      // Enhanced error handling with more specific cases
      console.log("🔍 === ERROR CATEGORIZATION ===");

      if (error.message === "EXPO_COMPATIBILITY_ERROR") {
        console.log("📝 Error category: Expo Compatibility Issue");
        errorMessage =
          "Authentication service is not compatible with the current environment. " +
          "Please use a development build or try a different authentication method.";

        Alert.alert(
          "Compatibility Issue",
          "This app requires a development build to use AWS Cognito authentication. " +
          "Expo Go doesn't support native AWS Amplify modules.\n\n" +
          "Please:\n" +
          "1. Create an Expo development build, or\n" +
          "2. Use Expo EAS Build, or\n" +
          "3. Try the web version of this app",
          [
            {
              text: "Learn More",
              onPress: () => {
                console.log(
                  "User wants to learn more about development builds"
                );
                // You could open a URL here with more information
              },
              style: "default",
            },
            { text: "OK", style: "cancel" },
          ]
        );
        return;
      } else if (error.name === "NotAuthorizedException") {
        console.log("📝 Error category: NotAuthorizedException");
        if (error.message?.includes("User is not confirmed")) {
          errorMessage =
            "Your account hasn't been verified yet. Please check your email for a verification code.";
          shouldOfferResend = true;
          console.log("📧 User not confirmed - offering resend");
        } else if (error.message?.includes("Incorrect username or password")) {
          errorMessage =
            "Incorrect email or password. Please check your credentials and try again.";
          console.log("🔒 Invalid credentials");
        } else {
          errorMessage =
            "Authentication failed. Please check your credentials and try again.";
          console.log("🔒 General authentication failure");
        }
      } else if (error.name === "UserNotConfirmedException") {
        console.log("📝 Error category: UserNotConfirmedException");
        errorMessage =
          "Your account hasn't been verified yet. Please check your email for a verification code.";
        shouldOfferResend = true;
      } else if (error.name === "UserNotFoundException") {
        console.log("📝 Error category: UserNotFoundException");
        errorMessage =
          "No account found with this email address. Please check your email or create a new account.";
      } else if (
        error.name === "TooManyRequestsException" ||
        error.name === "LimitExceededException"
      ) {
        console.log("📝 Error category: Rate limiting");
        errorMessage =
          "Too many sign in attempts. Please wait a few minutes and try again.";
      } else if (
        error.name === "NetworkError" ||
        error.message?.includes("Network") ||
        error.message?.includes("network")
      ) {
        console.log("📝 Error category: Network error");
        errorMessage =
          "Network error. Please check your internet connection and try again.";
      } else if (error.name === "InvalidParameterException") {
        console.log("📝 Error category: Invalid parameters");
        errorMessage = "Please check your email and password format.";
      } else if (error.name === "ResourceNotFoundException") {
        console.log(
          "📝 Error category: Resource not found (possibly misconfigured)"
        );
        errorMessage = "Service configuration error. Please contact support.";
      } else if (error.name === "InternalErrorException") {
        console.log("📝 Error category: Internal server error");
        errorMessage =
          "Server error occurred. Please try again in a few moments.";
      } else if (error.code) {
        console.log("📝 Error category: Has error code -", error.code);
        errorMessage = `Error ${error.code}: ${error.message || "Unknown error occurred"
          }`;
      } else if (error.message) {
        console.log("📝 Error category: Has message");
        errorMessage = error.message;
      } else {
        console.log("📝 Error category: Unknown/Generic");
        errorMessage =
          "An unknown error occurred during sign in. Please try again.";
      }

      console.log("💬 Final error message:", errorMessage);
      console.log("📧 Should offer resend:", shouldOfferResend);

      // Set error in state for display
      setErrors({ general: errorMessage });

      Alert.alert("Sign In Error", errorMessage, [
        { text: "Try Again", style: "default" },
      ]);

      // Offer resend verification if appropriate
      if (shouldOfferResend) {
        setTimeout(() => {
          Alert.alert(
            "Account Verification Required",
            "Would you like us to resend the verification code to your email?",
            [
              {
                text: "Resend Code",
                onPress: () => {
                  console.log(
                    "📧 User opted to resend verification code after error"
                  );
                  handleResendVerificationCode();
                },
                style: "default",
              },
              {
                text: "Not Now",
                style: "cancel",
              },
            ]
          );
        }, 1000);
      }
    } finally {
      console.log("🏁 === SIGN IN PROCESS COMPLETED ===");
      console.log("⏰ Process end timestamp:", new Date().toISOString());
      setIsLoading(false);
    }
  }, [validateForm, navigation]);

  // Enhanced resend verification code handler
  const handleResendVerificationCode = useCallback(async () => {
    console.log("📧 === RESEND VERIFICATION CODE STARTED ===");

    if (!formDataRef.current.email) {
      console.log("❌ No email provided for resend");
      Alert.alert("Email Required", "Please enter your email address first.", [
        { text: "OK", style: "default" },
      ]);
      return;
    }

    setIsResendingCode(true);
    console.log(
      "📧 Attempting to resend verification code to:",
      formDataRef.current.email
    );

    try {
      console.log("🚀 Calling resendSignUpCode function");

      const result = await resendSignUpCode({
        username: formDataRef.current.email,
      });

      console.log("✅ === RESEND SUCCESSFUL ===");
      console.log("📊 Resend result:", result);

      Alert.alert(
        "Verification Code Sent! 📧",
        "We've sent a new verification code to your email address. Please check your inbox and spam folder.",
        [{ text: "OK", style: "default" }]
      );
    } catch (error: any) {
      console.error("❌ === RESEND ERROR ===");
      console.error("❌ Resend error:", error);
      console.error("❌ Error details:", {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      });

      let errorMessage =
        "Failed to resend verification code. Please try again.";

      if (error.name === "LimitExceededException") {
        errorMessage =
          "Too many requests. Please wait a few minutes before requesting another code.";
        console.log("⏰ Rate limit hit for resend");
      } else if (error.name === "UserNotFoundException") {
        errorMessage = "No account found with this email address.";
        console.log("👤 User not found for resend");
      } else if (error.name === "InvalidParameterException") {
        errorMessage = "Invalid email address format.";
        console.log("📧 Invalid email for resend");
      } else if (error.message) {
        errorMessage = error.message;
      }

      console.log("💬 Resend error message:", errorMessage);

      Alert.alert("Resend Failed", errorMessage, [
        { text: "OK", style: "default" },
      ]);
    } finally {
      console.log("🏁 Resend process completed");
      setIsResendingCode(false);
    }
  }, []);

  // Enhanced form data update - NO RE-RENDERS, just update the ref
  const updateFormData = useCallback(
    (field: keyof SignInFormData, value: string | boolean) => {
      console.log(`📝 === UPDATING FORM FIELD ===`);
      console.log(`📝 Field: ${field}`);
      console.log(
        `📝 Value: ${typeof value === "string" ? value.substring(0, 20) + "..." : value
        }`
      );
      console.log(
        `📝 Previous value: ${typeof formDataRef.current[field] === "string"
          ? (formDataRef.current[field] as string).substring(0, 20) + "..."
          : formDataRef.current[field]
        }`
      );

      // Update the ref directly - NO STATE UPDATE = NO RE-RENDER
      formDataRef.current = {
        ...formDataRef.current,
        [field]: value,
      };

      console.log(`✅ Form field ${field} updated successfully`);

      // Clear field-specific errors when user starts typing
      if (errors[field as keyof ValidationErrors]) {
        console.log(`🧹 Clearing error for field: ${field}`);
        const newErrors = { ...errors };
        delete newErrors[field as keyof ValidationErrors];
        setErrors(newErrors);
      }
    },
    [errors]
  );

  // Simplified focus handlers - no state updates
  const handleInputFocus = useCallback((inputId: string) => {
    console.log(`🎯 Input focused: ${inputId}`);
  }, []);

  const handleInputBlur = useCallback((inputId: string) => {
    console.log(`👋 Input blurred: ${inputId}`);
  }, []);

  const handleSubmitEditing = useCallback(
    (nextRef?: React.RefObject<TextInput | null>) => {
      if (nextRef?.current) {
        console.log(`⏭️ Moving to next input`);
        nextRef.current.focus();
      } else {
        console.log("⌨️ Dismissing keyboard and attempting sign in");
        Keyboard.dismiss();
        // Auto-submit when user presses "done" on password field
        setTimeout(() => {
          console.log("🚀 Auto-submitting form after keyboard dismiss");
          handleSignIn();
        }, 100);
      }
    },
    [handleSignIn]
  );

  // Enhanced input component - FIXED to prevent re-renders
  const CustomTextInput = React.memo(
    ({
      label,
      value,
      onChangeText,
      placeholder,
      error,
      inputRef,
      nextRef,
      keyboardType = "default",
      autoCapitalize = "none",
      returnKeyType = "next",
      secureTextEntry = false,
      required = false,
      icon,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      placeholder: string;
      error?: string;
      inputRef?: React.RefObject<TextInput | null>;
      nextRef?: React.RefObject<TextInput | null>;
      keyboardType?: any;
      autoCapitalize?: any;
      returnKeyType?: any;
      secureTextEntry?: boolean;
      required?: boolean;
      icon?: React.ReactNode;
    }) => {
      const inputId = label.toLowerCase().replace(/\s/g, "");

      return (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>
            {label} {required && <Text style={styles.requiredAsterisk}>*</Text>}
          </Text>
          <View
            style={[styles.inputWrapper, error && styles.inputWrapperError]}
          >
            {icon && <View style={styles.inputIcon}>{icon}</View>}
            <TextInput
              ref={inputRef}
              style={[styles.textInput, icon ? styles.textInputWithIcon : undefined]}
              defaultValue={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor="#A0AEC0"
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              returnKeyType={returnKeyType}
              secureTextEntry={secureTextEntry}
              onFocus={() => handleInputFocus(inputId)}
              onBlur={() => handleInputBlur(inputId)}
              onSubmitEditing={() => handleSubmitEditing(nextRef)}
            />
          </View>
          {error && (
            <Animated.View style={styles.errorContainer}>
              <AlertCircle size={16} color="#E53E3E" />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}
        </View>
      );
    }
  );

  // Enhanced password input - FIXED
  const CustomPasswordInput = React.memo(
    ({
      label,
      value,
      onChangeText,
      placeholder,
      error,
      inputRef,
      nextRef,
      showPassword,
      setShowPassword,
      icon,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      placeholder: string;
      error?: string;
      inputRef?: React.RefObject<TextInput | null>;
      nextRef?: React.RefObject<TextInput | null>;
      showPassword: boolean;
      setShowPassword: (show: boolean) => void;
      icon?: React.ReactNode;
    }) => {
      return (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>
            {label} <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <View
            style={[
              styles.passwordContainer,
              error && styles.inputWrapperError,
            ]}
          >
            {icon && <View style={styles.inputIcon}>{icon}</View>}
            <TextInput
              ref={inputRef}
              style={[styles.passwordInput, icon ? styles.textInputWithIcon : undefined]}
              defaultValue={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor="#A0AEC0"
              secureTextEntry={!showPassword}
              returnKeyType={nextRef ? "next" : "done"}
              onFocus={() =>
                handleInputFocus(label.toLowerCase().replace(/\s/g, ""))
              }
              onBlur={() =>
                handleInputBlur(label.toLowerCase().replace(/\s/g, ""))
              }
              onSubmitEditing={() => handleSubmitEditing(nextRef)}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => {
                console.log(`👁️ Toggling password visibility for ${label}`);
                setShowPassword(!showPassword);
              }}
            >
              {showPassword ? (
                <EyeOff size={20} color="#718096" />
              ) : (
                <Eye size={20} color="#718096" />
              )}
            </TouchableOpacity>
          </View>

          {error && (
            <Animated.View style={styles.errorContainer}>
              <AlertCircle size={16} color="#E53E3E" />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}
        </View>
      );
    }
  );

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
                  style={styles.backHeaderButton}
                  onPress={() => {
                    console.log("🔙 Back button pressed");
                    navigation.goBack();
                  }}
                >
                  <ArrowLeft size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.headerContent}>
                  <Text style={styles.headerTitle}>Welcome Back</Text>
                  <Text style={styles.headerSubtitle}>
                    Sign in to your MedApp account
                  </Text>
                </View>

                <View style={styles.headerIcon}>
                  <Stethoscope size={28} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>

            {/* Form Content */}
            <Animated.View
              style={[
                styles.formContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.formCard}>
                <View style={styles.formHeader}>
                  <View style={styles.welcomeIconContainer}>
                    <LinearGradient
                      colors={["#0070D6", "#1A87E3"]}
                      style={styles.welcomeIcon}
                    >
                      <User size={32} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <Text style={styles.formTitle}>Sign In</Text>
                  <Text style={styles.formSubtitle}>
                    Enter your credentials to access your account
                  </Text>
                </View>

                {/* General Error Display */}
                {errors.general && (
                  <Animated.View style={styles.generalErrorContainer}>
                    <AlertCircle size={20} color="#E53E3E" />
                    <Text style={styles.generalErrorText}>
                      {errors.general}
                    </Text>
                  </Animated.View>
                )}

                <View style={styles.inputsContainer}>
                  <CustomTextInput
                    label="Email Address"
                    value={formDataRef.current.email}
                    onChangeText={(text) =>
                      updateFormData("email", text.toLowerCase())
                    }
                    placeholder="Enter your email"
                    error={errors.email}
                    inputRef={emailRef}
                    nextRef={passwordRef}
                    keyboardType="email-address"
                    required={true}
                    icon={<Mail size={20} color="#718096" />}
                  />

                  <CustomPasswordInput
                    label="Password"
                    value={formDataRef.current.password}
                    onChangeText={(text) => updateFormData("password", text)}
                    placeholder="Enter your password"
                    error={errors.password}
                    inputRef={passwordRef}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    icon={<Lock size={20} color="#718096" />}
                  />

                  {/* Remember Me & Forgot Password Row */}
                  <View style={styles.optionsRow}>
                    <TouchableOpacity
                      style={styles.rememberMeContainer}
                      onPress={() => {
                        console.log(
                          "📋 Remember me toggled:",
                          !formDataRef.current.rememberMe
                        );
                        updateFormData(
                          "rememberMe",
                          !formDataRef.current.rememberMe
                        );
                        triggerRerender(); // Force re-render for checkbox visual update
                      }}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          formDataRef.current.rememberMe &&
                          styles.checkboxChecked,
                        ]}
                      >
                        {formDataRef.current.rememberMe && (
                          <View style={styles.checkboxInner} />
                        )}
                      </View>
                      <Text style={styles.rememberMeText}>Remember me</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        console.log("🔗 Forgot password link pressed");
                        // Navigation to forgot password screen would go here
                        Alert.alert(
                          "Forgot Password",
                          "Password recovery feature will be available soon. Please contact support if you need immediate assistance.",
                          [{ text: "OK", style: "default" }]
                        );
                      }}
                    >
                      <Text style={styles.forgotPasswordLink}>
                        Forgot Password?
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sign In Button */}
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    isLoading && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    console.log("🖱️ Sign In button pressed");
                    handleSignIn();
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Sign In</Text>
                      <LogIn size={20} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>

                {/* Resend Verification Code Button */}
                <TouchableOpacity
                  style={[
                    styles.resendButton,
                    isResendingCode && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    console.log("📧 Resend verification button pressed");
                    handleResendVerificationCode();
                  }}
                  disabled={isResendingCode}
                >
                  {isResendingCode ? (
                    <ActivityIndicator size="small" color="#0070D6" />
                  ) : (
                    <>
                      <RefreshCw size={16} color="#0070D6" />
                      <Text style={styles.resendButtonText}>
                        Resend Verification Code
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Development Build Notice */}
                {/* <View style={styles.developmentNotice}>
                  <Text style={styles.developmentNoticeText}>
                    💡 Note: This app requires a development build for full AWS
                    Cognito functionality. Expo Go has limited support for
                    native authentication modules.
                  </Text>
                </View> */}
              </View>
            </Animated.View>

            {/* Enhanced Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Don't have an account?{" "}
                <TouchableOpacity
                  onPress={() => {
                    console.log("🔗 Sign Up link pressed");
                    navigation.navigate("SignUp");
                  }}
                  style={styles.footerLinkContainer}
                >
                  <Text style={styles.footerLink}>Create Account</Text>
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
    backgroundColor: "#F5F7FA",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  headerGradient: {
    paddingBottom: 80,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  backHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
    textAlign: "center",
  },
  headerIcon: {
    marginLeft: 16,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
  },
  formContainer: {
    paddingHorizontal: 20,
    marginTop: -50, // Floating overlap
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  formHeader: {
    alignItems: "center",
    marginBottom: 32,
    marginTop: 8,
  },
  welcomeIconContainer: {
    marginBottom: 16,
    marginTop: -60, // Pull icon up out of card
  },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    shadowColor: "#0070D6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#2D3748",
    marginBottom: 8,
    textAlign: "center",
  },
  formSubtitle: {
    fontSize: 15,
    color: "#718096",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  generalErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderColor: "#FC8181",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  generalErrorText: {
    fontSize: 14,
    color: "#C53030",
    marginLeft: 8,
    fontWeight: "600",
    flex: 1,
  },
  inputsContainer: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 8,
    marginLeft: 4,
  },
  requiredAsterisk: {
    color: "#E53E3E",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F7FAFC",
    height: 50,
  },
  inputWrapperError: {
    borderColor: "#E53E3E",
    backgroundColor: "#FFF5F5",
  },
  inputIcon: {
    paddingLeft: 16,
    paddingRight: 12,
  },
  textInput: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    color: "#2D3748",
    fontWeight: "500",
  },
  textInputWithIcon: {
    paddingLeft: 0,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F7FAFC",
    height: 50,
  },
  passwordInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#2D3748",
    fontWeight: "500",
  },
  passwordToggle: {
    paddingHorizontal: 16,
    height: "100%",
    justifyContent: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#E53E3E",
    marginLeft: 4,
    fontWeight: "500",
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingHorizontal: 4,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#CBD5E0",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: "#0070D6",
    borderColor: "#0070D6",
  },
  checkboxInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  rememberMeText: {
    fontSize: 14,
    color: "#4A5568",
    fontWeight: "500",
  },
  forgotPasswordLink: {
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "600",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: "#0070D6",
    borderRadius: 14,
    marginBottom: 16,
    shadowColor: "#0070D6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "700",
    marginRight: 8,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  resendButtonText: {
    fontSize: 14,
    color: "#0070D6",
    fontWeight: "600",
    marginLeft: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  developmentNotice: {
    marginTop: 16,
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  developmentNoticeText: {
    fontSize: 12,
    color: "#92400E",
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 15,
    color: "#718096",
    textAlign: "center",
    fontWeight: "500",
  },
  footerLinkContainer: {
    // marginLeft: 4,
  },
  footerLink: {
    color: "#0070D6",
    fontWeight: "700",
    fontSize: 15,
    top: 3,
  },
});

export default SignInScreen;
