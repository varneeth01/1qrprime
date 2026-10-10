import React from "react";
import { Pressable, Text, View } from "react-native";
import { theme } from "../theme";

export function AppHeader({ businessName, environment, onBusinessPress, onProfilePress }: { businessName?: string; environment: string; onBusinessPress?: () => void; onProfilePress?: () => void }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={businessName ? `Switch business, ${businessName}` : "Select business"} onPress={onBusinessPress} style={{ flex: 1 }}>
      <Text style={{ color: theme.colors.faint, fontSize: 10, fontWeight: "700", letterSpacing: 1.3 }}>1QR PRIME · {environment}</Text>
      <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 18, fontWeight: "700", marginTop: 5, letterSpacing: -0.3 }}>{businessName || "Your workspace"} <Text style={{ color: theme.colors.muted, fontWeight: "400" }}>⌄</Text></Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={onProfilePress} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.lineStrong }}>
      <Text style={{ color: theme.colors.accent, fontSize: 15, fontWeight: "800" }}>{businessName?.trim()?.[0]?.toUpperCase() || "P"}</Text>
    </Pressable>
  </View>;
}
