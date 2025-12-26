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
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Stethoscope,
} from "lucide-react-native";

// Import AWS Amplify Auth - UPDATED FOR V6+
import { signUp } from "@aws-amplify/auth";

const { width, height } = Dimensions.get("window");

// Types
interface SignUpFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

interface ValidationErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: string;
}

interface SignUpScreenProps {
  navigation: any;
  route?: any;
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  // Form state - Using refs to avoid re-renders on every keystroke
  const formDataRef = useRef<SignUpFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });

  // Only UI state that needs to trigger re-renders
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Remove focusedInput state as it causes unnecessary re-renders
  // const [focusedInput, setFocusedInput] = useState<string>("");

  // Force re-render when needed (for validation errors, step changes, etc.)
  const [, forceUpdate] = useState({});
  const triggerRerender = useCallback(() => forceUpdate({}), []);

  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Refs for form inputs
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Component mount logging
  useEffect(() => {
    console.log("📱 SignUpScreen component mounted");
    console.log("🔍 Checking Auth availability on component mount...");

    try {
      console.log("✅ signUp function available:", typeof signUp);
    } catch (error) {
      console.error("❌ Error checking Auth module:", error);
    }
  }, []);

  // Animation for step transitions
  const animateStepTransition = useCallback(
    (direction: "forward" | "backward") => {
      const toValue = direction === "forward" ? -50 : 50;

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim]
  );

  // Enhanced form validation with real-time feedback
  const validateField = useCallback(
    (
      field: keyof SignUpFormData,
      value: string | boolean,
      currentFormData?: SignUpFormData
    ): string | null => {
      const formDataToUse = currentFormData || formDataRef.current;

      switch (field) {
        case "firstName":
        case "lastName":
          if (
            !value ||
            (typeof value === "string" && value.trim().length < 2)
          ) {
            return `${
              field === "firstName" ? "First" : "Last"
            } name must be at least 2 characters`;
          }
          return null;

        case "email":
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!value || typeof value !== "string") return "Email is required";
          if (!emailRegex.test(value))
            return "Please enter a valid email address";
          return null;

        case "phone":
          const phoneRegex = /^[+]?[\d\s\-()]{10,}$/;
          if (!value || typeof value !== "string")
            return "Phone number is required";
          if (!phoneRegex.test(value))
            return "Please enter a valid phone number";
          return null;

        case "password":
          if (!value || typeof value !== "string")
            return "Password is required";
          if (value.length < 8) return "Password must be at least 8 characters";
          if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
            return "Password must include uppercase, lowercase, and number";
          }
          return null;

        case "confirmPassword":
          if (!value) return "Please confirm your password";
          if (value !== formDataToUse?.password)
            return "Passwords do not match";
          return null;

        case "acceptTerms":
          if (!value) return "You must accept the terms and conditions";
          return null;

        default:
          return null;
      }
    },
    []
  );

  const validateForm = useCallback(
    (currentFormData: SignUpFormData): boolean => {
      console.log("🔍 Validating form...");
      const newErrors: ValidationErrors = {};

      Object.entries(currentFormData).forEach(([key, value]) => {
        const error = validateField(
          key as keyof SignUpFormData,
          value,
          currentFormData
        );
        if (error) {
          newErrors[key as keyof ValidationErrors] = error;
          console.log(`❌ Validation error for ${key}:`, error);
        }
      });

      setErrors(newErrors);
      const isValid = Object.keys(newErrors).length === 0;
      console.log(
        "📋 Form validation result:",
        isValid ? "✅ Valid" : "❌ Invalid"
      );
      return isValid;
    },
    [validateField]
  );

  // Handle form submission with AWS Amplify integration - UPDATED
  const handleSignUp = useCallback(async () => {
    console.log("🔐 Starting sign up process...");

    if (!validateForm(formDataRef.current)) {
      console.log("❌ Form validation failed");
      Alert.alert(
        "Please Review Your Information",
        "Some fields need your attention before we can create your account.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }

    console.log("✅ Form validation passed");
    setIsLoading(true);

    try {
      // Log the data being sent to Amplify
      const { firstName, lastName, email, phone, password } =
        formDataRef.current;

      // Format phone number for Cognito (ensure it starts with +)
      const formattedPhone = phone.startsWith("+")
        ? phone
        : `+1${phone.replace(/\D/g, "")}`;

      console.log("📝 Sign up data:", {
        username: email,
        email: email,
        phone_number: formattedPhone,
        given_name: firstName,
        family_name: lastName,
        name: `${firstName} ${lastName}`,
      });

      // Test if signUp function is available
      console.log("🔍 Checking signUp function availability...");
      console.log("🔧 signUp function available:", typeof signUp);

      // Sign up with AWS Amplify V6+ syntax
      console.log("🚀 Attempting to sign up user with Amplify...");
      const { isSignUpComplete, userId, nextStep } = await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email,
            phone_number: formattedPhone,
            given_name: firstName,
            family_name: lastName,
            name: `${firstName} ${lastName}`,
          },
          autoSignIn: false,
        },
      });

      console.log("🎉 Sign up successful:", {
        isSignUpComplete,
        userId,
        nextStep,
      });

      // UPDATED: Navigate to ConfirmUser instead of DoctorDashboard
      Alert.alert(
        "Account Created! 🎉",
        "Your account has been created successfully. Please check your email for a verification code to complete your registration.",
        [
          {
            text: "Continue to Verification",
            onPress: () => {
              console.log("🧭 Navigating to ConfirmUser");
              navigation.navigate("ConfirmUser", {
                email: email,
                phone: formattedPhone,
                firstName: firstName,
                lastName: lastName,
              });
            },
            style: "default",
          },
        ]
      );
    } catch (error: any) {
      console.error("❌ Sign up error:", error);

      // Log detailed error information
      console.log("🔍 Error details:", {
        code: error.code,
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      let errorMessage =
        "We encountered an issue creating your account. Please try again.";

      // Handle specific Amplify errors
      if (error.name === "UsernameExistsException") {
        errorMessage =
          "An account with this email already exists. Please try signing in instead.";
        console.log("⚠️ User already exists");
      } else if (error.name === "InvalidPasswordException") {
        errorMessage =
          "Password does not meet requirements. Please ensure it has at least 8 characters with uppercase, lowercase, and numbers.";
        console.log("⚠️ Invalid password format");
      } else if (error.name === "InvalidParameterException") {
        errorMessage = "Please check your information and try again.";
        console.log("⚠️ Invalid parameters");
      } else if (error.name === "LimitExceededException") {
        errorMessage = "Too many attempts. Please try again later.";
        console.log("⚠️ Rate limit exceeded");
      } else if (error.name === "NotAuthorizedException") {
        errorMessage = "Authorization failed. Please check your credentials.";
        console.log("⚠️ Authorization failed");
      } else if (error.name === "NetworkError") {
        errorMessage =
          "Network error. Please check your internet connection and try again.";
        console.log("⚠️ Network error");
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert("Registration Error", errorMessage, [
        { text: "Try Again", style: "default" },
      ]);
    } finally {
      console.log("🏁 Sign up process completed");
      setIsLoading(false);
    }
  }, [validateForm, navigation]);

  // Enhanced form data update - NO RE-RENDERS, just update the ref
  const updateFormData = useCallback(
    (field: keyof SignUpFormData, value: string | boolean) => {
      console.log(
        `📝 Updating ${field}:`,
        typeof value === "string" ? value.substring(0, 20) + "..." : value
      );

      // Update the ref directly - NO STATE UPDATE = NO RE-RENDER
      formDataRef.current = {
        ...formDataRef.current,
        [field]: value,
      };
    },
    []
  );

  const navigateToStep = useCallback(
    (step: number) => {
      console.log(`🔄 Navigating to step ${step}`);
      const direction = step > currentStep ? "forward" : "backward";
      animateStepTransition(direction);
      setCurrentStep(step);
    },
    [currentStep, animateStepTransition]
  );

  // Simplified focus handlers - no state updates
  const handleInputFocus = useCallback((inputId: string) => {
    console.log(`🎯 Input focused: ${inputId}`);
    // Don't update state here to avoid re-renders
  }, []);

  const handleInputBlur = useCallback((inputId: string) => {
    console.log(`👋 Input blurred: ${inputId}`);
    // Don't update state here to avoid re-renders
  }, []);

  const handleSubmitEditing = useCallback(
    (nextRef?: React.RefObject<TextInput>) => {
      if (nextRef?.current) {
        console.log(`⏭️ Moving to next input`);
        nextRef.current.focus();
      } else {
        console.log("⌨️ Dismissing keyboard");
        Keyboard.dismiss();
      }
    },
    []
  );

  // Enhanced step indicator with progress animation for 2 steps
  const renderStepIndicator = useMemo(() => {
    const progress = (currentStep - 1) / 1; // Now only 2 steps, so progress is 0 or 1

    return (
      <View style={styles.stepIndicatorContainer}>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground} />
          <Animated.View
            style={[styles.progressBarFill, { width: `${progress * 100}%` }]}
          />
        </View>

        <View style={styles.stepIndicator}>
          {[1, 2].map((step) => (
            <View key={step} style={styles.stepItemContainer}>
              <TouchableOpacity
                style={[
                  styles.stepDot,
                  currentStep >= step && styles.stepDotActive,
                  currentStep === step && styles.stepDotCurrent,
                ]}
                onPress={() => navigateToStep(step)}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    currentStep >= step && styles.stepNumberActive,
                  ]}
                >
                  {step}
                </Text>
              </TouchableOpacity>

              {step < 2 && (
                <View
                  style={[
                    styles.stepConnector,
                    currentStep > step && styles.stepConnectorActive,
                  ]}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.stepLabels}>
          {["Personal Info", "Password"].map((label, index) => (
            <Text
              key={index}
              style={[
                styles.stepLabel,
                currentStep === index + 1 && styles.stepLabelActive,
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
    );
  }, [currentStep, isLoading, navigateToStep]);

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
      multiline = false,
      required = false,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      placeholder: string;
      error?: string;
      inputRef?: React.RefObject<TextInput>;
      nextRef?: React.RefObject<TextInput>;
      keyboardType?: any;
      autoCapitalize?: any;
      returnKeyType?: any;
      secureTextEntry?: boolean;
      multiline?: boolean;
      required?: boolean;
    }) => {
      const inputId = label.toLowerCase().replace(/\s/g, "");

      // Remove focus state tracking to prevent re-renders
      // const isFocused = focusedInput === inputId;

      return (
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>
            {label} {required && <Text style={styles.requiredAsterisk}>*</Text>}
          </Text>
          <View
            style={[
              styles.inputWrapper,
              // Remove focus styling that depends on state
              // isFocused && styles.inputWrapperFocused,
              error && styles.inputWrapperError,
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[styles.textInput, multiline && styles.textInputMultiline]}
              defaultValue={value} // Use defaultValue instead of value to prevent controlled re-renders
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor="#A0AEC0"
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              returnKeyType={returnKeyType}
              secureTextEntry={secureTextEntry}
              multiline={multiline}
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

  // Enhanced password input with strength indicator - FIXED
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
      showStrength = false,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      placeholder: string;
      error?: string;
      inputRef?: React.RefObject<TextInput>;
      nextRef?: React.RefObject<TextInput>;
      showPassword: boolean;
      setShowPassword: (show: boolean) => void;
      showStrength?: boolean;
    }) => {
      const getPasswordStrength = useCallback((password: string) => {
        let strength = 0;
        if (password.length >= 8) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
        return strength;
      }, []);

      const strength = getPasswordStrength(value);
      const strengthColors = ["#E53E3E", "#ED8936", "#ECC94B", "#48BB78"];
      const strengthLabels = ["Weak", "Fair", "Good", "Strong"];

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
            <TextInput
              ref={inputRef}
              style={styles.passwordInput}
              defaultValue={value} // Use defaultValue instead of value
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

          {showStrength && value.length > 0 && (
            <View style={styles.passwordStrengthContainer}>
              <View style={styles.passwordStrengthBars}>
                {[0, 1, 2, 3].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.passwordStrengthBar,
                      index < strength && {
                        backgroundColor: strengthColors[strength - 1],
                      },
                    ]}
                  />
                ))}
              </View>
              <Text
                style={[
                  styles.passwordStrengthText,
                  {
                    color:
                      strength > 0 ? strengthColors[strength - 1] : "#A0AEC0",
                  },
                ]}
              >
                {strength > 0 ? strengthLabels[strength - 1] : "Enter password"}
              </Text>
            </View>
          )}

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

  // Step components with enhanced styling - Updated to use refs
  const PersonalStep = React.memo(() => (
    <Animated.View
      style={[
        styles.stepContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        },
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Personal Information</Text>
        <Text style={styles.stepSubtitle}>Let's get to know you better</Text>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputHalf}>
          <CustomTextInput
            label="First Name"
            value={formDataRef.current.firstName}
            onChangeText={(text) => updateFormData("firstName", text)}
            placeholder="Enter first name"
            error={errors.firstName}
            inputRef={firstNameRef}
            nextRef={lastNameRef}
            autoCapitalize="words"
            required={true}
          />
        </View>
        <View style={styles.inputHalf}>
          <CustomTextInput
            label="Last Name"
            value={formDataRef.current.lastName}
            onChangeText={(text) => updateFormData("lastName", text)}
            placeholder="Enter last name"
            error={errors.lastName}
            inputRef={lastNameRef}
            nextRef={emailRef}
            autoCapitalize="words"
            required={true}
          />
        </View>
      </View>

      <CustomTextInput
        label="Email Address"
        value={formDataRef.current.email}
        onChangeText={(text) => updateFormData("email", text.toLowerCase())}
        placeholder="Enter your email"
        error={errors.email}
        inputRef={emailRef}
        nextRef={phoneRef}
        keyboardType="email-address"
        required={true}
      />

      <CustomTextInput
        label="Phone Number"
        value={formDataRef.current.phone}
        onChangeText={(text) => updateFormData("phone", text)}
        placeholder="Enter phone number"
        error={errors.phone}
        inputRef={phoneRef}
        keyboardType="phone-pad"
        returnKeyType="done"
        required={true}
      />

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigateToStep(2)}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
        <ArrowRight size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </Animated.View>
  ));

  const PasswordStep = React.memo(() => (
    <Animated.View
      style={[
        styles.stepContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        },
      ]}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Password</Text>
        <Text style={styles.stepSubtitle}>
          Secure your account with a strong password
        </Text>
      </View>

      <CustomPasswordInput
        label="Password"
        value={formDataRef.current.password}
        onChangeText={(text) => updateFormData("password", text)}
        placeholder="Create a strong password"
        error={errors.password}
        inputRef={passwordRef}
        nextRef={confirmPasswordRef}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        showStrength={true}
      />

      <CustomPasswordInput
        label="Confirm Password"
        value={formDataRef.current.confirmPassword}
        onChangeText={(text) => updateFormData("confirmPassword", text)}
        placeholder="Confirm your password"
        error={errors.confirmPassword}
        inputRef={confirmPasswordRef}
        showPassword={showConfirmPassword}
        setShowPassword={setShowConfirmPassword}
      />

      <TouchableOpacity
        style={styles.termsContainer}
        onPress={() => {
          console.log(
            "📋 Terms checkbox toggled:",
            !formDataRef.current.acceptTerms
          );
          updateFormData("acceptTerms", !formDataRef.current.acceptTerms);
          triggerRerender(); // Force re-render for checkbox visual update
        }}
        activeOpacity={0.7}
      >
        <View style={styles.checkboxContainer}>
          <Animated.View
            style={[
              styles.checkbox,
              formDataRef.current.acceptTerms && styles.checkboxChecked,
            ]}
          >
            {formDataRef.current.acceptTerms && (
              <Check size={16} color="#FFFFFF" />
            )}
          </Animated.View>
        </View>
        <Text style={styles.termsText}>
          I agree to the <Text style={styles.termsLink}>Terms of Service</Text>{" "}
          and <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </TouchableOpacity>

      {errors.acceptTerms && (
        <Animated.View style={[styles.errorContainer, { marginLeft: 32 }]}>
          <AlertCircle size={16} color="#E53E3E" />
          <Text style={styles.errorText}>{errors.acceptTerms}</Text>
        </Animated.View>
      )}

      <View style={styles.stepButtonsContainer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigateToStep(1)}
        >
          <ArrowLeft size={20} color="#0070D6" />
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Create Account</Text>
              <Stethoscope size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  ));

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
                  <Text style={styles.headerTitle}>Join MedApp</Text>
                  <Text style={styles.headerSubtitle}>
                    Professional Medical Platform
                  </Text>
                </View>

                <View style={styles.headerIcon}>
                  <Stethoscope size={28} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>

            {/* Enhanced Step Indicator */}
            {renderStepIndicator}

            {/* Form Content */}
            <View style={styles.formContainer}>
              <View style={styles.formCard}>
                {currentStep === 1 && <PersonalStep />}
                {currentStep === 2 && <PasswordStep />}
              </View>
            </View>

            {/* Enhanced Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Already have an account?{" "}
                <TouchableOpacity
                  onPress={() => {
                    console.log("🔗 Sign In link pressed");
                    navigation.navigate("Login");
                  }}
                  style={styles.footerLinkContainer}
                >
                  <Text style={styles.footerLink}>Sign In</Text>
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
  backHeaderButton: {
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
  stepIndicatorContainer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginTop: -12,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    marginBottom: 16,
    overflow: "hidden",
  },
  progressBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#E2E8F0",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#0070D6",
    borderRadius: 2,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  stepItemContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  stepDotActive: {
    backgroundColor: "#0070D6",
    borderColor: "#0070D6",
  },
  stepDotCurrent: {
    backgroundColor: "#0070D6",
    borderColor: "#0070D6",
    transform: [{ scale: 1.1 }],
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 112, 214, 0.4)",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#718096",
  },
  stepNumberActive: {
    color: "#FFFFFF",
  },
  stepConnector: {
    width: 40,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 8,
  },
  stepConnectorActive: {
    backgroundColor: "#0070D6",
  },
  stepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepLabel: {
    fontSize: 12,
    color: "#718096",
    fontWeight: "500",
    textAlign: "center",
    flex: 1,
  },
  stepLabelActive: {
    color: "#0070D6",
    fontWeight: "600",
  },
  formContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  formCard: {
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
  stepContainer: {
    minHeight: 420,
  },
  stepHeader: {
    marginBottom: 32,
    alignItems: "center",
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2D3748",
    marginBottom: 8,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 15,
    color: "#718096",
    textAlign: "center",
    lineHeight: 22,
  },
  inputRow: {
    flexDirection: "row",
    marginHorizontal: -8,
  },
  inputHalf: {
    flex: 1,
    marginHorizontal: 8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: "#E53E3E",
  },
  inputWrapper: {
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    transition: "all 0.2s ease",
  },
  inputWrapperFocused: {
    borderColor: "#0070D6",
    ...Platform.select({
      ios: {
        shadowColor: "rgba(0, 112, 214, 0.15)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inputWrapperError: {
    borderColor: "#E53E3E",
  },
  textInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#2D3748",
    fontWeight: "500",
  },
  textInputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#2D3748",
    fontWeight: "500",
  },
  passwordToggle: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passwordStrengthContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  passwordStrengthBars: {
    flexDirection: "row",
    marginRight: 12,
  },
  passwordStrengthBar: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginRight: 4,
  },
  passwordStrengthText: {
    fontSize: 12,
    fontWeight: "500",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#E53E3E",
    marginLeft: 6,
    fontWeight: "500",
  },
  termsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    marginTop: 8,
  },
  checkboxContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxChecked: {
    backgroundColor: "#0070D6",
    borderColor: "#0070D6",
  },
  termsText: {
    fontSize: 14,
    color: "#4A5568",
    lineHeight: 20,
    flex: 1,
    fontWeight: "500",
  },
  termsLink: {
    color: "#0070D6",
    fontWeight: "600",
  },
  stepButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 32,
    gap: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: "#0070D6",
    borderRadius: 12,
    flex: 1,
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
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: "#0070D6",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    fontSize: 16,
    color: "#0070D6",
    fontWeight: "600",
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
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

export default SignUpScreen;
