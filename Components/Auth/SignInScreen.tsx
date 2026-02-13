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
  LogIn,
  Stethoscope,
  User,
  Lock,
  Mail,
  RefreshCw,
} from "lucide-react-native";

// Imports for Refactor (Matching SignUp structure roughly, but SignIn logic is different)
// We will keep the original logic but wrap it in the new UI.
// Original used useRef for form data. We will stick to that to minimize logic breakage, 
// OR switch to react-hook-form for consistency. 
// "Senior Developer" choice: Consistency. Switch to react-hook-form.

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// AWS Amplify Auth
import { signIn, resendSignUpCode } from "@aws-amplify/auth";

const { width } = Dimensions.get("window");

// ==========================================
// THEME CONSTANTS (Duplicated for now, should be shared)
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
// ZOD SCHEMA
// ==========================================
const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type SignInFormData = z.infer<typeof signInSchema>;

// ==========================================
// MODERN INPUT COMPONENT (Duplicated)
// ==========================================
const ModernInput = ({
  name,
  control,
  label,
  placeholder,
  icon: Icon,
  keyboardType = "default",
  secureTextEntry = false,
  showPasswordToggle = false,
  onTogglePassword,
  autoCapitalize = "none",
}: {
  name: keyof SignInFormData;
  control: any;
  label: string;
  placeholder: string;
  icon?: any;
  keyboardType?: any;
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  onTogglePassword?: () => void;
  autoCapitalize?: any;
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
    <Controller
      control={control}
      name={name}
      render={({
        field: { onChange, onBlur, value },
        fieldState: { error },
      }) => (
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
              value={value as string}
              onChangeText={onChange}
              onBlur={() => {
                onBlur();
                setIsFocused(false);
              }}
              onFocus={() => setIsFocused(true)}
              placeholder={placeholder}
              placeholderTextColor={COLORS.textLight}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              secureTextEntry={secureTextEntry}
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
              <Text style={styles.errorText}>{error.message}</Text>
            </View>
          )}
        </View>
      )}
    />
  );
};

// ==========================================
// SCREEN COMPONENT
// ==========================================
interface SignInScreenProps {
  navigation: any;
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const {
    control,
    handleSubmit,
    watch,
    setError,
    formState: { isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Watch email for resend functionality
  const emailValue = watch("email");

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    try {
      console.log("🔐 Signing in...");
      const { isSignedIn, nextStep } = await signIn({
        username: data.email,
        password: data.password,
      });

      if (isSignedIn) {
        console.log("✅ Signed in");
        navigation.navigate("DoctorDashboard", { isAuthenticated: true });
      } else if (nextStep?.signInStep === "CONFIRM_SIGN_UP") {
        Alert.alert(
          "Verification Required",
          "Account not verified. Navigate to verification?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Verify",
              onPress: () =>
                navigation.navigate("ConfirmUser", { email: data.email }),
            },
          ]
        );
      } else {
        Alert.alert("Sign In Info", `Next Step: ${nextStep?.signInStep}`);
      }
    } catch (error: any) {
      console.error("Sign In Error:", error);
      let msg = error.message;
      if (error.name === "NotAuthorizedException")
        msg = "Incorrect user ID or password.";
      if (error.name === "UserNotConfirmedException") {
        msg = "User not confirmed.";
        // Consider auto-redirecting or showing resend button
      }
      Alert.alert("Sign In Failed", msg);
    } finally {
      setIsLoading(false);
    }
  };

  const onResendCode = async () => {
    if (!emailValue) {
      Alert.alert("Email Required", "Please enter your email address.");
      return;
    }
    setIsResending(true);
    try {
      await resendSignUpCode({ username: emailValue });
      Alert.alert("Code Sent", `Verification code sent to ${emailValue}`);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to resend code");
    } finally {
      setIsResending(false);
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
          {/* PREMIUM HEADER */}
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBackground}
          >
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.headerTitle}>Welcome Back</Text>
                <Text style={styles.headerSubtitle}>
                  Sign in to PhysiciansApp
                </Text>
              </View>
              <View style={styles.headerIcon}>
                <Stethoscope size={28} color={COLORS.primary} />
              </View>
            </View>
          </LinearGradient>

          {/* MAIN FORM CARD */}
          <View style={styles.formCardContainer}>
            <View style={styles.welcomeSection}>
              <View style={styles.avatarCircle}>
                <User size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.cardTitle}>Sign In</Text>
              <Text style={styles.cardSubtitle}>
                Access your dashboard
              </Text>
            </View>

            <ModernInput
              name="email"
              control={control}
              label="Email Address"
              placeholder="Enter your email"
              icon={Mail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <ModernInput
              name="password"
              control={control}
              label="Password"
              placeholder="Enter your password"
              icon={Lock}
              secureTextEntry={!showPassword}
              showPasswordToggle
              onTogglePassword={() => setShowPassword(!showPassword)}
            />

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => navigation.navigate("ForgotPassword")}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit(handleSignIn)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Sign In</Text>
                  <LogIn size={20} color="#FFF" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={onResendCode}
              disabled={isResending}
            >
              {isResending ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
                <>
                  <RefreshCw size={14} color={COLORS.primary} />
                  <Text style={styles.resendText}>Resend Verification Code</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
              <Text style={styles.footerLink}>Create Account</Text>
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
  welcomeSection: {
    alignItems: "center",
    marginBottom: SPACING.l,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.inputBg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.s,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
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
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: SPACING.l,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.l,
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
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.m,
    padding: SPACING.s,
  },
  resendText: {
    color: COLORS.primary,
    marginLeft: 6,
    fontWeight: "600",
    fontSize: 14,
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

export default SignInScreen;
