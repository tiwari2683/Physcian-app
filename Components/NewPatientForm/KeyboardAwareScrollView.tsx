/**
 * KeyboardAwareScrollView Component
 * 
 * A wrapper component that combines ScrollView with KeyboardAvoidingView to handle keyboard interactions
 * in forms and input-heavy screens. It ensures that input fields remain visible when the keyboard appears
 * and provides smooth scrolling behavior.
 * 
 * Features:
 * - Automatically adjusts content when keyboard appears
 * - Maintains keyboard visibility while scrolling
 * - Platform-specific behavior (iOS/Android)
 * - Customizable styling and behavior
 * 
 * @example
 * ```tsx
 * <KeyboardAwareScrollView>
 *   <View>
 *     <TextInput placeholder="Enter text..." />
 *     {/* Other form elements 
 *   </View>
 * </KeyboardAwareScrollView>
 * ```
 */

import React from 'react';
import { ScrollView, Platform, KeyboardAvoidingView, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';

/**
 * Props for the KeyboardAwareScrollView component
 * @interface KeyboardAwareScrollViewProps
 */
interface KeyboardAwareScrollViewProps {
  /** Child components to be rendered inside the scroll view */
  children: React.ReactNode;
  /** Additional styles for the content container */
  contentContainerStyle?: ViewStyle;
  /** Additional styles for the main container */
  style?: ViewStyle;
  /** Determines when the keyboard should be dismissed when tapping outside of the focused input */
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  /** Whether to show the vertical scroll indicator */
  showsVerticalScrollIndicator?: boolean;
}

/**
 * KeyboardAwareScrollView Component
 * 
 * @param props - Component props
 * @returns A scrollable view that handles keyboard interactions
 */
const KeyboardAwareScrollView: React.FC<KeyboardAwareScrollViewProps> = ({
  children,
  contentContainerStyle,
  style,
  keyboardShouldPersistTaps = 'always',
  showsVerticalScrollIndicator = true,
}) => {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, style]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        scrollEnabled={true}
        bounces={true}
        keyboardDismissMode="none"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 200, // Extra padding at the bottom to ensure content is scrollable above keyboard
  },
});

export default KeyboardAwareScrollView; 