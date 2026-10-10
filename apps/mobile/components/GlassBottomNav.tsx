import React from "react";
import { Pressable, Text, View } from "react-native";
import { theme } from "../theme";

const icons: Record<string, string> = { Home: "⌂", Orders: "◷", Menu: "☷", QR: "▦", More: "•••" };
export function GlassBottomNav({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  return <View style={{ flexDirection: "row", marginHorizontal: 14, marginBottom: 10, padding: 6, borderWidth: 1, borderColor: theme.colors.lineStrong, borderRadius: 25, backgroundColor: "rgba(20,20,22,0.82)", shadowColor: "#000", shadowOpacity: .35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}>
    {Object.keys(icons).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: active === item }} accessibilityLabel={item} onPress={() => onChange(item)} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: active === item ? theme.colors.accent : "transparent" }}>
      <Text style={{ color: active === item ? theme.colors.accentInk : theme.colors.muted, fontSize: 18, lineHeight: 20 }}>{icons[item]}</Text>
      <Text style={{ color: active === item ? theme.colors.accentInk : theme.colors.muted, fontSize: 10, fontWeight: active === item ? "700" : "500", marginTop: 2 }}>{item}</Text>
    </Pressable>)}
  </View>;
}
