import React, { useState, useRef, useEffect, useMemo } from "react";
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_ENDPOINTS } from "../../Config";

// ============================================================================
// DYNAMIC MEDICINE AUTOCOMPLETE
// ============================================================================
interface MedicineAutocompleteProps {
    value: string;
    onSelect: (value: string) => void;
    // medications prop is NOT used but kept for interface compatibility if needed
    // We prefer fetching from backend now
    medications?: string[];
    placeholder?: string;
    label?: string;
    isReadOnly?: boolean;
}

const MedicineAutocomplete: React.FC<MedicineAutocompleteProps> = ({
    value,
    onSelect,
    medications = [], // Fallback
    placeholder = "Type medicine name...",
    label = "Medication Name",
    isReadOnly = false,
}) => {
    const [inputValue, setInputValue] = useState(value);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isMedicineSelected, setIsMedicineSelected] = useState(false); // Track if a valid selection was made
    const inputRef = useRef<TextInput>(null);

    // Local Cache to avoid redundant API calls for recently typed lookups
    const localCache = useRef<Map<string, string[]>>(new Map());

    // Debounce Timer
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Flag to prevent search after selection
    const selectionMade = useRef(false);

    // Sync external value
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Search API Logic
    const searchMedicines = async (query: string) => {
        // 1. Check Cache
        const normalizedQuery = query.trim().toUpperCase();
        if (localCache.current.has(normalizedQuery)) {
            console.log(`[Cache Hit] ${normalizedQuery}`);
            setSuggestions(localCache.current.get(normalizedQuery) || []);
            setShowSuggestions(true);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            console.log("🔍 Searching medicines:", query);
            console.log("🚀 URL:", API_ENDPOINTS.PATIENT_PROCESSOR);

            const payload = {
                action: "searchMedicines",
                query: query
            };

            const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const text = await response.text(); // Get raw text first to debug
            console.log("📩 Raw Response:", text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("❌ Invalid JSON response:", text);
                return;
            }

            if (data.success) {
                console.log(`✅ Found ${data.medicines.length} medicines`);
                setSuggestions(data.medicines);
                localCache.current.set(normalizedQuery, data.medicines);
                setShowSuggestions(true);
            } else {
                console.warn("⚠️ API reported failure:", data);
                setSuggestions([]); // Clear if failed
            }
        } catch (error) {
            console.error("❌ Search Request Failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Wrapper to ensure synchronous execution on button press
    // This prevents the touch event from being lost during keyboard dismissal
    const handleAddPress = () => {
        console.log("🎯 ADD BUTTON PRESSED!");
        Alert.alert("Debug", "Button pressed - adding: " + inputValue);
        const medicineName = inputValue; // Capture value synchronously
        addNewMedicine(medicineName);
    };

    // Add Medicine API Logic
    const addNewMedicine = async (name: string) => {
        setIsLoading(true);
        try {
            const payload = {
                action: "addMedicine",
                name: name
            };

            const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("Failed to add medicine:", response.status);
                Alert.alert("Error", "Could not add medicine to database");
                return;
            }

            const data = await response.json();

            if (data.success) {
                Alert.alert("Success", `Added "${name}" to database`);
                const cleanName = name.trim();
                selectionMade.current = true; // Prevent search after add
                setIsMedicineSelected(true); // Mark as selected
                setInputValue(cleanName);
                onSelect(cleanName);
                setSuggestions([]);
                setShowSuggestions(false);
                inputRef.current?.blur();
            } else {
                Alert.alert("Error", data.error || "Could not save medicine");
            }
        } catch (error: unknown) {
            console.error("Error adding medicine:", error);
            Alert.alert("Network Error", "Please check your connection");
        } finally {
            setIsLoading(false);
        }
    };

    // Debounced Effect
    useEffect(() => {
        if (isReadOnly) return;

        if (inputValue.trim().length < 1) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        // Skip search if selection was just made
        if (selectionMade.current) {
            selectionMade.current = false;
            return;
        }

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(() => {
            // Trigger Search
            searchMedicines(inputValue);
        }, 300); // 300ms debounce

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        }
    }, [inputValue, isReadOnly]);


    // Simplified sync handler for selection
    const handleSelectSuggestion = (medicine: string) => {
        console.log("✅ SELECTION MADE:", medicine);
        selectionMade.current = true; // Prevent search from re-triggering
        setIsMedicineSelected(true); // Mark as selected - hides all search UI
        setInputValue(medicine);
        onSelect(medicine);
        // Clear suggestions immediately to hide the list
        setSuggestions([]);
        setShowSuggestions(false);
        setIsFocused(false);
        inputRef.current?.blur();
    };

    const isExactMatch = suggestions.some(
        s => s.toLowerCase() === inputValue.trim().toLowerCase()
    );

    const renderHighlightedText = (text: string, query: string) => {
        // Simple highlight logic
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === 0) {
            return (
                <Text style={styles.suggestionText}>
                    <Text style={styles.suggestionHighlight}>{text.substring(0, query.length)}</Text>
                    {text.substring(query.length)}
                </Text>
            );
        }
        return <Text style={styles.suggestionText}>{text}</Text>;
    };

    if (isReadOnly) {
        return (
            <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>{label}</Text>
                <View style={styles.autocompleteInputDisabled}>
                    <Text style={styles.autocompleteInputText}>{value || "—"}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{label}</Text>
            <View style={styles.autocompleteContainer}>
                <View style={[styles.autocompleteInputContainer, isFocused && styles.autocompleteInputFocused]}>
                    <Ionicons name="search-outline" size={18} color="#718096" style={{ marginRight: 8 }} />
                    <TextInput
                        ref={inputRef}
                        style={styles.autocompleteTextInput}
                        value={inputValue}
                        onChangeText={(text) => {
                            setInputValue(text);
                            // User is typing/editing - reset to search mode
                            if (isMedicineSelected) {
                                setIsMedicineSelected(false);
                            }
                        }}
                        onFocus={() => { setIsFocused(true); if (inputValue) setShowSuggestions(true); }}
                        onBlur={() => setTimeout(() => { setIsFocused(false); setShowSuggestions(false); }, 200)}
                        placeholder={placeholder}
                        placeholderTextColor="#A0AEC0"
                        autoCapitalize="words"
                        autoCorrect={false}
                    />
                    {isLoading ? (
                        <ActivityIndicator size="small" color="#0070D6" style={{ marginRight: 5 }} />
                    ) : (
                        inputValue.length > 0 && (
                            <TouchableOpacity onPress={() => { setInputValue(""); setSuggestions([]); }}>
                                <Ionicons name="close-circle" size={20} color="#A0AEC0" />
                            </TouchableOpacity>
                        )
                    )}
                </View>

                {/* Suggestions List - visible when there are results */}
                {suggestions.length > 0 && inputValue.trim().length > 0 && (
                    <View style={styles.suggestionsContainer}>
                        <ScrollView style={styles.suggestionsList} keyboardShouldPersistTaps="always" nestedScrollEnabled>
                            {suggestions.map((item, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.suggestionItem}
                                    onPress={() => handleSelectSuggestion(item)}
                                    delayPressIn={0}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 5, bottom: 5, left: 10, right: 10 }}
                                >
                                    <Ionicons name="medical-outline" size={16} color="#0070D6" />
                                    {renderHighlightedText(item, inputValue)}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Add New Medicine Section - ONLY in search mode, not after selection */}
                {!isMedicineSelected && !isExactMatch && inputValue.trim().length > 0 && (
                    <View style={styles.addNewSection}>
                        <View style={styles.addNewCard}>
                            <Ionicons name="information-circle-outline" size={20} color="#718096" />
                            <Text style={styles.addNewHint}>
                                Medicine not found in database
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.addNewButton, isLoading && { opacity: 0.6 }]}
                            onPress={handleAddPress}
                            disabled={isLoading}
                            delayPressIn={0}
                            activeOpacity={0.8}
                        >
                            {isLoading ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                                    <Text style={styles.addNewButtonText}>
                                        Add "{inputValue.trim()}" to Database
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    inputWrapper: { marginBottom: 16 },
    inputLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: "#2D3748",
        marginBottom: 8,
    },
    autocompleteContainer: {
        zIndex: 10,
        position: "relative",
    },
    autocompleteInputContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
    },
    autocompleteInputFocused: {
        borderColor: "#0070D6",
        borderWidth: 2,
    },
    autocompleteTextInput: {
        flex: 1,
        fontSize: 16,
        color: "#2D3748",
    },
    suggestionsContainer: {
        position: "absolute",
        top: 55,
        left: 0,
        right: 0,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        maxHeight: 250,
        zIndex: 1000,
    },
    suggestionsList: {
        padding: 8,
    },
    suggestionItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#F7FAFC",
    },
    suggestionText: {
        marginLeft: 10,
        fontSize: 15,
        color: "#4A5568",
    },
    suggestionHighlight: {
        fontWeight: "bold",
        color: "#2D3748",
    },
    autocompleteInputDisabled: {
        backgroundColor: "#F7FAFC",
        borderWidth: 1,
        borderColor: "#EDF2F7",
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
        justifyContent: "center",
    },
    autocompleteInputText: {
        fontSize: 16,
        color: "#4A5568",
    },
    // New Add Medicine Section Styles
    addNewSection: {
        marginTop: 8,
        gap: 8,
    },
    addNewCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F7FAFC",
        padding: 12,
        borderRadius: 8,
        gap: 8,
    },
    addNewHint: {
        fontSize: 14,
        color: "#718096",
        flex: 1,
    },
    addNewButton: {
        backgroundColor: "#0070D6",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        borderRadius: 10,
        gap: 8,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },
    addNewButtonText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "600",
    }
});

export default MedicineAutocomplete;
