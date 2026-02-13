import React, { useState, useRef, useEffect } from "react";
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
    Animated,
    StatusBar,
    Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
    ArrowLeft,
    Mail,
    Lock,
    ShieldCheck,
    CheckCircle,
    Eye,
    EyeOff,
    AlertCircle,
} from "lucide-react-native";
import { resetPassword, confirmResetPassword } from "@aws-amplify/auth";

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
    inputBg: "#F8FAFC",
};

const SPACING = { xs: 4, s: 8, m: 16, l: 24, xl: 32 };
const BORDER_RADIUS = { s: 8, m: 12, l: 16, xl: 24 };

// ==========================================
// VALIDATION HELPERS
// ==========================================
const validateEmail = (email: string): string | null => {
    if (!email) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Invalid email address";
    return null;
};

const validateCode = (code: string): string | null => {
    if (!code) return "Verification code is required";
    if (code.length < 6) return "Code must be at least 6 digits";
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

    return (
        <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{label}</Text>
            <Animated.View
                style={[
                    styles.inputWrapper,
                    {
                        borderColor: error ? COLORS.error : borderColor,
                        backgroundColor: isFocused ? "#FFFFFF" : COLORS.inputBg,
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
// SCREEN COMPONENT
// ==========================================
const ForgotPasswordScreen = ({ navigation }: any) => {
    // Form State
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Error State
    const [errors, setErrors] = useState<{ [key: string]: string | null }>({});

    // UI State
    const [step, setStep] = useState(1); // 1: Email, 2: Code + New Password
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Clear errors when user types
    const handleFieldChange = (field: string, value: string) => {
        setErrors((prev) => ({ ...prev, [field]: null }));

        switch (field) {
            case "email":
                setEmail(value);
                break;
            case "code":
                setCode(value);
                break;
            case "newPassword":
                setNewPassword(value);
                break;
            case "confirmPassword":
                setConfirmPassword(value);
                break;
        }
    };

    // Validate Email Step
    const validateEmailStep = (): boolean => {
        const emailError = validateEmail(email);
        setErrors({ email: emailError });
        return emailError === null;
    };

    // Validate Reset Step
    const validateResetStep = (): boolean => {
        const newErrors: { [key: string]: string | null } = {};

        newErrors.code = validateCode(code);
        newErrors.newPassword = validatePassword(newPassword);
        newErrors.confirmPassword = validateConfirmPassword(
            newPassword,
            confirmPassword
        );

        setErrors(newErrors);

        return !Object.values(newErrors).some((error) => error !== null);
    };

    // Step 1: Send Code
    const handleSendCode = async () => {
        Keyboard.dismiss();

        if (!validateEmailStep()) {
            return;
        }

        setIsLoading(true);
        try {
            const output = await resetPassword({ username: email });
            const { nextStep } = output;

            if (nextStep.resetPasswordStep === "CONFIRM_RESET_PASSWORD_WITH_CODE") {
                setStep(2);
                Alert.alert(
                    "Code Sent",
                    `A verification code has been sent to ${email}. Please check your email.`
                );
            } else {
                Alert.alert("Error", "Unexpected reset flow.");
            }
        } catch (error: any) {
            console.error("Reset password error:", error);
            Alert.alert(
                "Error",
                error.message || "Failed to send verification code. Please try again."
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Confirm Reset
    const handleReset = async () => {
        Keyboard.dismiss();

        if (!validateResetStep()) {
            return;
        }

        setIsLoading(true);
        try {
            await confirmResetPassword({
                username: email,
                confirmationCode: code,
                newPassword: newPassword,
            });

            Alert.alert(
                "Success",
                "Your password has been reset successfully! Please sign in with your new password.",
                [
                    {
                        text: "Sign In",
                        onPress: () => navigation.navigate("Login"),
                    },
                ]
            );
        } catch (error: any) {
            console.error("Confirm reset error:", error);
            Alert.alert(
                "Error",
                error.message || "Failed to reset password. Please check your verification code."
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
                    {/* HEADER */}
                    <LinearGradient
                        colors={[COLORS.primary, COLORS.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.headerBackground}
                    >
                        <View style={styles.headerContent}>
                            <View>
                                <Text style={styles.headerTitle}>
                                    {step === 1 ? "Forgot Password" : "Reset Password"}
                                </Text>
                                <Text style={styles.headerSubtitle}>
                                    {step === 1
                                        ? "Enter email to receive code"
                                        : "Create a new secure password"}
                                </Text>
                            </View>
                            <View style={styles.headerIcon}>
                                <Lock size={28} color={COLORS.primary} />
                            </View>
                        </View>
                    </LinearGradient>

                    {/* FORM CARD */}
                    <View style={styles.formCardContainer}>
                        {step === 1 ? (
                            // STEP 1: EMAIL
                            <View>
                                <View style={styles.welcomeSection}>
                                    <View style={styles.avatarCircle}>
                                        <Mail size={32} color={COLORS.primary} />
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
                                    autoCapitalize="none"
                                />

                                <TouchableOpacity
                                    style={styles.submitButton}
                                    onPress={handleSendCode}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <>
                                            <Text style={styles.primaryButtonText}>Send Code</Text>
                                            <ArrowLeft
                                                size={20}
                                                color="#FFF"
                                                style={{ transform: [{ rotate: "180deg" }] }}
                                            />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            // STEP 2: RESET
                            <View>
                                <SecureInput
                                    value={code}
                                    onChangeText={(text) => handleFieldChange("code", text)}
                                    label="Verification Code"
                                    placeholder="Enter 6-digit code"
                                    icon={CheckCircle}
                                    error={errors.code}
                                    keyboardType="number-pad"
                                />

                                <SecureInput
                                    value={newPassword}
                                    onChangeText={(text) =>
                                        handleFieldChange("newPassword", text)
                                    }
                                    label="New Password"
                                    placeholder="Min. 8 characters"
                                    icon={Lock}
                                    error={errors.newPassword}
                                    secureTextEntry={!showPassword}
                                    showPasswordToggle
                                    onTogglePassword={() => setShowPassword(!showPassword)}
                                />

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

                                <TouchableOpacity
                                    style={styles.submitButton}
                                    onPress={handleReset}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <>
                                            <Text style={styles.primaryButtonText}>
                                                Reset Password
                                            </Text>
                                            <CheckCircle size={20} color="#FFF" />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.backLink}
                            onPress={() => navigation.navigate("Login")}
                        >
                            <Text style={styles.backLinkText}>Back to Sign In</Text>
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
        paddingBottom: SPACING.xl,
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
        elevation: 5,
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
    },
    inputContainer: {
        marginBottom: SPACING.m,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.text,
        marginBottom: SPACING.xs,
        marginLeft: 4,
    },
    inputWrapper: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1.5,
        borderRadius: BORDER_RADIUS.m,
        paddingHorizontal: SPACING.m,
        height: 56,
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
        marginTop: 4,
        marginLeft: 4,
    },
    errorText: {
        fontSize: 12,
        color: COLORS.error,
        marginLeft: 4,
    },
    submitButton: {
        flexDirection: "row",
        backgroundColor: COLORS.primary,
        height: 56,
        borderRadius: BORDER_RADIUS.l,
        justifyContent: "center",
        alignItems: "center",
        marginTop: SPACING.m,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButtonText: {
        fontSize: 18,
        fontWeight: "600",
        color: "#FFFFFF",
        marginRight: 8,
    },
    backLink: {
        alignSelf: "center",
        marginTop: SPACING.l,
        padding: SPACING.s,
    },
    backLinkText: {
        fontSize: 14,
        color: COLORS.secondary,
        fontWeight: "600",
    },
});

export default ForgotPasswordScreen;