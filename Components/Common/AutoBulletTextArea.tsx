import React, { useRef } from "react";
import { TextInput, StyleSheet } from "react-native";

// Auto-Bulleting Text Area Component
const AutoBulletTextArea = ({
    value,
    onChangeText,
    placeholder,
    style,
    numberOfLines = 10,
    onEndEditing = null,
}: any) => {
    const inputRef = useRef(null);

    // Handle text changes including auto-bulleting feature
    const handleChangeText = (text: string) => {
        // Check if Enter key was pressed (by seeing if a new line was added)
        if (text.length > value.length && text.endsWith("\n")) {
            const lines = text.split("\n");
            const previousLine = lines[lines.length - 2] || "";

            // Check if the previous line starts with a bullet point or dash
            if (previousLine.match(/^\s*[-•*]\s/)) {
                // Extract the bullet pattern (including any leading whitespace)
                const bulletMatch = previousLine.match(/^(\s*[-•*]\s)/);
                if (bulletMatch) {
                    const bulletPattern = bulletMatch[1];

                    // Add the same bullet pattern to the new line
                    const newText = text + bulletPattern;
                    onChangeText(newText);
                    return;
                }
            }
        }

        onChangeText(text);
    };

    return (
        <TextInput
            ref={inputRef}
            style={[styles.textArea, style]}
            value={value}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            multiline
            numberOfLines={numberOfLines}
            textAlignVertical="top"
            placeholderTextColor="#C8C8C8"
            blurOnSubmit={false}
            onEndEditing={onEndEditing}
        />
    );
};

const styles = StyleSheet.create({
    textArea: {
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        padding: 12,
        fontSize: 16,
        color: "#2D3748",
        textAlignVertical: "top",
    },
});

export default AutoBulletTextArea;
