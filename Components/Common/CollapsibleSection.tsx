import React, { useRef, useEffect } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Animated,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// New Collapsible Section Component
const CollapsibleSection = ({
    title,
    children,
    isExpanded,
    onToggle,
    icon,
}: any) => {
    const animatedHeight = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(animatedHeight, {
            toValue: isExpanded ? 1 : 0,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [isExpanded]);

    return (
        <View style={styles.collapsibleContainer}>
            <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={onToggle}
                activeOpacity={0.7}
            >
                <View style={styles.collapsibleTitleContainer}>
                    {icon && (
                        <Ionicons
                            name={icon}
                            size={20}
                            color="#0070D6"
                            style={styles.collapsibleHeaderIcon}
                        />
                    )}
                    <Text
                        style={styles.collapsibleTitle}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {title}
                    </Text>
                </View>
                <View style={styles.chevronContainer}>
                    <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={22}
                        color="#4A5568"
                    />
                </View>
            </TouchableOpacity>
            <Animated.View
                style={[
                    styles.collapsibleContent,
                    {
                        maxHeight: animatedHeight.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 2000],
                        }),
                        opacity: animatedHeight,
                        overflow: "hidden",
                    },
                ]}
            >
                {children}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    collapsibleContainer: {
        marginBottom: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    collapsibleHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        backgroundColor: "#F8FAFC",
    },
    collapsibleTitleContainer: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    collapsibleHeaderIcon: {
        marginRight: 10,
    },
    collapsibleTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#2D3748",
    },
    chevronContainer: {
        marginLeft: 8,
    },
    collapsibleContent: {
        backgroundColor: "#FFFFFF",
    },
});

export default CollapsibleSection;
