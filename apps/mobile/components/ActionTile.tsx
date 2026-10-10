import React from "react";
import { Pressable, Text } from "react-native";
import { theme } from "../theme";

export function ActionTile({ title, detail, accent = theme.colors.muted, onPress }: { title: string; detail: string; accent?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={{ flex: 1, minWidth: "46%", minHeight: 82, padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.line }}>
    <Text style={{ color: accent, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>{title.toUpperCase()}</Text>
    <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 12, marginTop: 10 }}>{detail}</Text>
    <Text style={{ color: theme.colors.text, fontSize: 18, marginTop: 4 }}>↗</Text>
  </Pressable>;
}
