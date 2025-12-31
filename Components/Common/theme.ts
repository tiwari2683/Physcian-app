
import { Dimensions, Platform } from "react-native";

const { width, height } = Dimensions.get("window");

// Responsive Scaling Utility
const scale = (size: number) => (width / 375) * size;

export const SIZES = {
    // Global sizes
    base: 8,
    font: 14,
    radius: 12,
    padding: 24,

    // Font Sizes
    h1: 30,
    h2: 22,
    h3: 16,
    h4: 14,
    body1: 30,
    body2: 22,
    body3: 16,
    body4: 14,

    // App Dimensions
    width,
    height,

    // Spacing
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
};

export const COLORS = {
    // Brand Colors
    primary: "#2563EB", // Modern Royal Blue
    primaryDark: "#1E40AF",
    primaryLight: "#DBEAFE",

    secondary: "#10B981", // Emerald Green (Success/Safe)
    secondaryDark: "#059669",
    secondaryLight: "#D1FAE5",

    // State Colors
    success: "#00C851",
    error: "#FF4444",
    warning: "#FFBB33",
    info: "#33B5E5",

    // Neutrals
    black: "#1F2937",
    white: "#FFFFFF",
    gray: "#6B7280", // Body text
    lightGray: "#F3F4F6", // Backgrounds
    lightGray2: "#E5E7EB", // Borders
    darkGray: "#374151", // Headings
    transparent: "transparent",

    // Overlay
    overlay: "rgba(0,0,0,0.5)",
};

export const SHADOWS = {
    light: {
        shadowColor: COLORS.black,
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    medium: {
        shadowColor: COLORS.black,
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    dark: {
        shadowColor: COLORS.black,
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 8,
    },
};

export const FONTS = {
    h1: { fontSize: SIZES.h1, lineHeight: 36, fontWeight: "700" as "700", color: COLORS.black },
    h2: { fontSize: SIZES.h2, lineHeight: 30, fontWeight: "700" as "700", color: COLORS.black },
    h3: { fontSize: SIZES.h3, lineHeight: 22, fontWeight: "600" as "600", color: COLORS.black },
    h4: { fontSize: SIZES.h4, lineHeight: 22, fontWeight: "600" as "600", color: COLORS.black },
    body1: { fontSize: SIZES.body1, lineHeight: 36, color: COLORS.gray },
    body2: { fontSize: SIZES.body2, lineHeight: 30, color: COLORS.gray },
    body3: { fontSize: SIZES.body3, lineHeight: 22, color: COLORS.gray },
    body4: { fontSize: SIZES.body4, lineHeight: 22, color: COLORS.gray },
};

const appTheme = { COLORS, SIZES, FONTS, SHADOWS };

export default appTheme;
