import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
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
  Animated,
  StatusBar,
  UIManager,
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
  Stethoscope,
  ShieldCheck,
  User,
  Phone,
  Mail,
  Lock,
} from "lucide-react-native";

// AWS Amplify Auth
import { signUp } from "@aws-amplify/auth";
import { API_ENDPOINTS } from "../../Config";

// Enable LayoutAnimation for Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");

// ==========================================
// THEME CONSTANTS
// ==========================================
const COLORS = {
  primary: "#0070D6",
  primaryDark: "#005BB5",
  secondary: "#15A1B1",
  background: "#F5F7FA",
  card: "#FFFFFF",
  text: "#2D3748",
  textMuted: "#718096",
  textLight: "#A0AEC0",
  border: "#E2E8F0",
  error: "#E53E3E",
  success: "#38A169",
  warning: "#D69E2E",
  inputBg: "#F8FAFC",
  focusRing: "rgba(0, 112, 214, 0.15)",
};

const SPACING = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
};

const BORDER_RADIUS = {
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
};

// ==========================================
// VALIDATION HELPERS
// ==========================================
const validateEmail = (email: string): string | null => {
  if (!email) return "Email is required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Invalid email address";
  return null;
};

const validateName = (name: string, field: string): string | null => {
  if (!name) return `${field} is required`;
  if (name.length < 2) return `${field} must be at least 2 characters`;
  if (!/^[a-zA-Z\s]*$/.test(name))
    return "No numbers or special characters allowed";
  return null;
};

const validatePhone = (phone: string): string | null => {
  if (!phone) return "Phone number is required";
  if (phone.length !== 10) return "Phone number must be exactly 10 digits";
  if (!/^\d+$/.test(phone)) return "Phone number must contain only numbers";
  return null;
};

const validatePassword = (password: string): string | null => {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password))
    return "Must contain at least one uppercase letter";
  if (!/[a-z]/.test(password))
    return "Must contain at least one lowercase letter";
  if (!/[0-9]/.test(password)) return "Must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password))
    return "Must contain at least one special character";
  return null;
};

const validateConfirmPassword = (
  password: string,
  confirmPassword: string
): string | null => {
  if (!confirmPassword) return "Please confirm your password";
  if (password !== confirmPassword) return "Passwords do not match";
  return null;
};

// ==========================================
// SECURE INPUT COMPONENT
// ==========================================
interface SecureInputProps {
  value: string;
  onChangeText: (text: string) => void;
  label: string;
  placeholder: string;
  icon: any;
  error?: string | null;
  keyboardType?: "default" | "email-address" | "number-pad";
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  onTogglePassword?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
  editable?: boolean;
}

const SecureInput: React.FC<SecureInputProps> = ({
  value,
  onChangeText,
  label,
  placeholder,
  icon: Icon,
  error,
  keyboardType = "default",
  secureTextEntry = false,
  showPasswordToggle = false,
  onTogglePassword,
  autoCapitalize = "none",
  maxLength,
  editable = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const animatedFocus = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedFocus, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused]);

  const borderColor = animatedFocus.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.primary],
  });

  const backgroundColor = animatedFocus.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.inputBg, "#FFFFFF"],
  });

  const shadowOpacity = animatedFocus.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.1],
  });

  return (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Animated.View
        style={[
          styles.inputWrapper,
          {
            borderColor: error ? COLORS.error : borderColor,
            backgroundColor: backgroundColor,
            shadowColor: COLORS.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: shadowOpacity,
            shadowRadius: 8,
            elevation: isFocused ? 2 : 0,
          },
        ]}
      >
        {Icon && (
          <View style={styles.inputIcon}>
            <Icon
              size={20}
              color={
                error
                  ? COLORS.error
                  : isFocused
                    ? COLORS.primary
                    : COLORS.textMuted
              }
            />
          </View>
        )}
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          onBlur={() => setIsFocused(false)}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          editable={editable}
          // CRITICAL: Disable ALL autofill
          autoComplete="off"
          autoCorrect={false}
          textContentType="none"
          importantForAutofill="no"
          spellCheck={false}
        />
        {showPasswordToggle && (
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={onTogglePassword}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {!secureTextEntry ? (
              <EyeOff size={20} color={COLORS.textMuted} />
            ) : (
              <Eye size={20} color={COLORS.textMuted} />
            )}
          </TouchableOpacity>
        )}
      </Animated.View>
      {error && (
        <View style={styles.errorContainer}>
          <AlertCircle size={14} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

// ==========================================
// PASSWORD STRENGTH METER
// ==========================================
const PasswordStrengthMeter = ({ password }: { password: string }) => {
  if (!password) return null;

  const getStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = getStrength(password);
  const maxStrength = 4;

  const getColor = (s: number) => {
    if (s <= 1) return COLORS.error;
    if (s === 2) return COLORS.warning;
    if (s === 3) return "#3182CE";
    return COLORS.success;
  };

  const labels = ["Weak", "Fair", "Good", "Strong"];

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBars}>
        {[...Array(maxStrength)].map((_, index) => (
          <View
            key={index}
            style={[
              styles.strengthBar,
              {
                backgroundColor:
                  index < strength ? getColor(strength) : COLORS.border,
                flex: 1,
              },
            ]}
          />
        ))}
      </View>
      <Text
        style={[
          styles.strengthLabel,
          { color: strength > 0 ? getColor(strength) : COLORS.textMuted },
        ]}
      >
        {strength > 0 ? labels[strength - 1] : "Enter Password"}
      </Text>
    </View>
  );
};

// ==========================================
// SCREEN COMPONENT
// ==========================================
interface SignUpScreenProps {
  navigation: any;
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  // Form State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Error State
  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Animated Values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Clear errors when user types
  const handleFieldChange = (field: string, value: string) => {
    setErrors((prev) => ({ ...prev, [field]: null }));

    switch (field) {
      case "firstName":
        setFirstName(value);
        break;
      case "lastName":
        setLastName(value);
        break;
      case "email":
        setEmail(value);
        break;
      case "phone":
        setPhone(value);
        break;
      case "password":
        setPassword(value);
        break;
      case "confirmPassword":
        setConfirmPassword(value);
        break;
    }
  };

  // Step Navigation Animation
  const animateStepTransition = useCallback(
    (direction: "forward" | "backward") => {
      const toValue = direction === "forward" ? -20 : 20;

      Animated.sequence([
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: toValue,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
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
        ]),
      ]).start();
    },
    [fadeAnim, slideAnim]
  );

  // Validate Step 1
  const validateStep1 = (): boolean => {
    const newErrors: { [key: string]: string | null } = {};

    newErrors.firstName = validateName(firstName, "First name");
    newErrors.lastName = validateName(lastName, "Last name");
    newErrors.email = validateEmail(email);
    newErrors.phone = validatePhone(phone);

    setErrors(newErrors);

    return !Object.values(newErrors).some((error) => error !== null);
  };

  // Validate Step 2
  const validateStep2 = (): boolean => {
    const newErrors: { [key: string]: string | null } = {};

    newErrors.password = validatePassword(password);
    newErrors.confirmPassword = validateConfirmPassword(
      password,
      confirmPassword
    );

    if (!acceptTerms) {
      Alert.alert(
        "Terms Required",
        "Please accept the Terms of Service and Privacy Policy to continue."
      );
      return false;
    }

    setErrors(newErrors);

    return !Object.values(newErrors).some((error) => error !== null);
  };

  // Navigate to Step 2
  const handleContinue = () => {
    Keyboard.dismiss();

    if (validateStep1()) {
      animateStepTransition("forward");
      setCurrentStep(2);
    }
  };

  // Go Back to Step 1
  const handleBack = () => {
    Keyboard.dismiss();
    animateStepTransition("backward");
    setCurrentStep(1);
  };

  // Backend Validation
  const checkBackendValidation = async (
    emailToCheck: string,
    phoneToCheck: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validateRegistration",
          email: emailToCheck,
          phone: phoneToCheck,
        }),
      });
      const result = await response.json();

      if (!result.success) {
        if (result.field === "email") {
          setErrors((prev) => ({ ...prev, email: result.error }));
          setCurrentStep(1);
        } else if (result.field === "phone") {
          setErrors((prev) => ({ ...prev, phone: result.error }));
          setCurrentStep(1);
        } else {
          Alert.alert("Registration Error", result.error);
        }
        return false;
      }
      return true;
    } catch (error) {
      Alert.alert(
        "Connection Error",
        "Could not verify details. Please check your internet connection."
      );
      return false;
    }
  };

  // Form Submission
  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (!validateStep2()) {
      return;
    }

    setIsLoading(true);

    try {
      // Backend validation
      const isAvailable = await checkBackendValidation(email, phone);
      if (!isAvailable) {
        setIsLoading(false);
        return;
      }

      // Format phone number
      const formattedPhone = phone.startsWith("+")
        ? phone
        : `+1${phone.replace(/\D/g, "")}`;

      // Sign up with Amplify
      await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email,
            phone_number: formattedPhone,
            given_name: firstName,
            family_name: lastName,
            name: `${firstName} ${lastName}`,
            'custom:role': 'Doctor'
          },
          autoSignIn: false,
        },
      });

      Alert.alert(
        "Welcome! 🎉",
        "Account created successfully. Please verify your email to continue.",
        [
          {
            text: "Verify Now",
            onPress: () =>
              navigation.navigate("ConfirmUser", {
                email: email,
                phone: formattedPhone,
                firstName: firstName,
                lastName: lastName,
              }),
          },
        ]
      );
    } catch (error: any) {
      console.error("Signup error:", error);
      Alert.alert(
        "Registration Failed",
        error.message || "An error occurred during registration. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* PREMIUM BACKGROUND HEADER */}
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBackground}
          >
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.headerTitle}>Join PhysiciansApp</Text>
                <Text style={styles.headerSubtitle}>
                  Create your professional account
                </Text>
              </View>
              <View style={styles.headerIcon}>
                <Stethoscope size={28} color={COLORS.primary} />
              </View>
            </View>
          </LinearGradient>

          {/* MAIN FORM CARD */}
          <View style={styles.formCardContainer}>
            {/* Step Progress */}
            <View style={styles.progressContainer}>
              <View style={styles.stepInfo}>
                <Text style={styles.stepNumber}>Step {currentStep} of 2</Text>
                <Text style={styles.stepName}>
                  {currentStep === 1 ? "Personal Details" : "Security & Terms"}
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: currentStep === 1 ? "50%" : "100%" },
                  ]}
                />
              </View>
            </View>

            <Animated.View
              style={{
                opacity: fadeAnim,
                transform: [{ translateX: slideAnim }],
              }}
            >
              {currentStep === 1 ? (
                // STEP 1 CONTENT
                <View>
                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <SecureInput
                        value={firstName}
                        onChangeText={(text) =>
                          handleFieldChange("firstName", text)
                        }
                        label="First Name"
                        placeholder="Enter first name"
                        icon={User}
                        error={errors.firstName}
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <SecureInput
                        value={lastName}
                        onChangeText={(text) =>
                          handleFieldChange("lastName", text)
                        }
                        label="Last Name"
                        placeholder="Enter last name"
                        icon={User}
                        error={errors.lastName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>

                  <SecureInput
                    value={email}
                    onChangeText={(text) => handleFieldChange("email", text)}
                    label="Email Address"
                    placeholder="Enter your email"
                    icon={Mail}
                    error={errors.email}
                    keyboardType="email-address"
                  />

                  <SecureInput
                    value={phone}
                    onChangeText={(text) => handleFieldChange("phone", text)}
                    label="Phone Number"
                    placeholder="Enter phone number"
                    icon={Phone}
                    error={errors.phone}
                    keyboardType="number-pad"
                    maxLength={10}
                  />

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleContinue}
                  >
                    <Text style={styles.primaryButtonText}>Continue</Text>
                    <ArrowRight size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                // STEP 2 CONTENT
                <View>
                  <SecureInput
                    value={password}
                    onChangeText={(text) => handleFieldChange("password", text)}
                    label="Password"
                    placeholder="Min. 8 characters"
                    icon={Lock}
                    error={errors.password}
                    secureTextEntry={!showPassword}
                    showPasswordToggle
                    onTogglePassword={() => setShowPassword(!showPassword)}
                  />
                  <PasswordStrengthMeter password={password} />

                  <SecureInput
                    value={confirmPassword}
                    onChangeText={(text) =>
                      handleFieldChange("confirmPassword", text)
                    }
                    label="Confirm Password"
                    placeholder="Re-enter password"
                    icon={ShieldCheck}
                    error={errors.confirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    showPasswordToggle
                    onTogglePassword={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                  />

                  {/* Terms Checkbox */}
                  <View style={styles.termsWrapper}>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setAcceptTerms(!acceptTerms)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          acceptTerms && styles.checkboxChecked,
                        ]}
                      >
                        {acceptTerms && <Check size={14} color="#FFF" />}
                      </View>
                      <Text style={styles.termsText}>
                        I agree to the{" "}
                        <Text style={styles.linkText}>Terms of Service</Text>{" "}
                        and <Text style={styles.linkText}>Privacy Policy</Text>
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={handleBack}
                      disabled={isLoading}
                    >
                      <ArrowLeft size={20} color={COLORS.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.submitButton}
                      onPress={handleSubmit}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Text style={styles.primaryButtonText}>
                            Create Account
                          </Text>
                          <Check size={20} color="#FFF" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  headerBackground: {
    paddingTop: Platform.OS === "ios" ? 60 : 80,
    paddingBottom: 100,
    paddingHorizontal: SPACING.l,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  headerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginTop: 4,
    textAlign: "center",
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.m,
  },
  formCardContainer: {
    marginTop: -70,
    marginHorizontal: SPACING.l,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.l,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 8,
  },
  progressContainer: {
    marginBottom: SPACING.xl,
  },
  stepInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.s,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
  stepName: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  inputContainer: {
    marginBottom: SPACING.m,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.s,
    marginLeft: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    height: 52,
  },
  inputIcon: {
    marginRight: SPACING.s,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    height: "100%",
  },
  passwordToggle: {
    padding: SPACING.s,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.l,
    marginTop: SPACING.m,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
  },
  strengthContainer: {
    marginTop: -8,
    marginBottom: SPACING.m,
    marginLeft: SPACING.xs,
  },
  strengthBars: {
    flexDirection: "row",
    height: 4,
    gap: 4,
    marginBottom: 6,
  },
  strengthBar: {
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "right",
  },
  termsWrapper: {
    marginBottom: SPACING.l,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: SPACING.m,
    marginTop: SPACING.s,
  },
  secondaryButton: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.l,
    backgroundColor: "rgba(0, 112, 214, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.l,
    height: 52,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: SPACING.l,
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  footerLink: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 4,
  },
});

export default SignUpScreen;