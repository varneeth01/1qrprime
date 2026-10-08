import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Image,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  RefreshControl,
  Switch,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
const ENVIRONMENT = process.env.EXPO_PUBLIC_ENVIRONMENT || (process.env.APP_VARIANT === "development" ? "local" : "production");
const configuredApi = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_ORIGIN;
const configuredWeb = process.env.EXPO_PUBLIC_WEB_ORIGIN;
const apiValue = configuredApi || (ENVIRONMENT === "local" ? "http://localhost:3001" : "");
const webValue = configuredWeb || (ENVIRONMENT === "local" ? "http://localhost:5173" : "");
function checkedOrigin(value: string, label: string) {
  if (!value) throw new Error(`${label} is required for ${ENVIRONMENT} mobile builds`);
  const parsed = new URL(value);
  const loopback = /^(localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2)$/i.test(parsed.hostname);
  if (ENVIRONMENT !== "local" && (loopback || parsed.protocol !== "https:"))
    throw new Error(`Invalid ${label} for ${ENVIRONMENT}: ${value}. Remote builds require a public HTTPS URL.`);
  if (ENVIRONMENT === "production" && (parsed.hostname !== "api.1qrprime.com" || parsed.pathname !== "/api"))
    throw new Error(`Production mobile builds must use https://api.1qrprime.com/api, received ${value}`);
  return value.replace(/\/$/, "");
}
const ORIGIN = checkedOrigin(apiValue, "EXPO_PUBLIC_API_URL").replace(/\/api$/, "");
const API_BASE = `${ORIGIN}/api`;
const WEB = checkedOrigin(webValue, "EXPO_PUBLIC_WEB_ORIGIN");
const webHost = (() => { try { return new URL(WEB).hostname; } catch { return "localhost"; } })();
const environmentLabel = ENVIRONMENT === "production" ? "PRODUCTION" : /^(localhost|127\.0\.0\.1)$/i.test(webHost) ? "LOCAL" : /\.trycloudflare\.com$/i.test(webHost) ? "PREVIEW" : "STAGING";
type Row = Record<string, any>;
const OwnerRoutes = {
  Home: "Home",
  Orders: "Orders",
  Menu: "Menu",
  QR: "QR",
  More: "More",
  Businesses: "Businesses",
  Tables: "Tables",
  Payments: "Payments",
  CustomerPage: "Customer Page",
  Analytics: "Analytics",
  Staff: "Staff",
  Profile: "Profile",
  Settings: "Settings",
  Support: "Support",
  New: "New",
} as const;
const money = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(n / 100),
  label = (s: string) => s.replaceAll("_", " ");
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
function Button({ title, onPress, secondary = false, disabled = false }: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && { color: "#ffffff" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Input({ title, ...props }: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{title}</Text>
      <TextInput
        accessibilityLabel={title}
        style={s.input}
        placeholderTextColor="#A3A3A3"
        {...props}
      />
    </View>
  );
}
function Card({ children }: any) {
  return <View style={s.card}>{children}</View>;
}
function Title({ children }: any) {
  return <Text style={s.title}>{children}</Text>;
}
function Hint({ children }: any) {
  return <Text style={s.hint}>{children}</Text>;
}
function Stars() {
  const stars = [[8,10,2],[24,18,1],[78,7,1],[92,24,2],[51,14,1],[15,42,1],[68,38,1],[87,51,1],[38,58,2],[4,72,1],[73,78,1],[28,88,1],[96,91,2],[57,95,1]];
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{stars.map(([left, top, size], i) => <View key={i} style={[s.star, { left: `${left}%`, top: `${top}%`, width: size, height: size }]} />)}</View>;
}
function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/unknownhost|network request failed|fetch failed|failed to fetch|timed out/i.test(message)) return "Unable to connect to 1QR preview. Check your internet or restart the preview server.";
  if (/unauthorized|invalid token|session expired/i.test(message)) return "Your session expired. Please sign in again.";
  if (/forbidden|permission/i.test(message)) return "You do not have permission to do that.";
  return message || "Something went wrong. Please try again.";
}
async function updateLocationRequest(
  request: (path: string, method?: string, body?: unknown) => Promise<Row>,
  locationId: string,
  body: Row,
) {
  try {
    return await request(`/locations/${locationId}`, "PUT", body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message !== "Profile changed elsewhere. Refresh before saving." ||
      typeof body.version !== "number"
    )
      throw error;

    const latest = await request(`/locations/${locationId}`);
    const requestedProfile = body.profile;
    const mergedProfile =
      requestedProfile && typeof requestedProfile === "object"
        ? {
            ...(latest.profile || {}),
            ...requestedProfile,
            ...(requestedProfile.appearance
              ? {
                  appearance: {
                    ...(latest.profile?.appearance || {}),
                    ...requestedProfile.appearance,
                  },
                }
              : {}),
          }
        : requestedProfile;

    return request(`/locations/${locationId}`, "PUT", {
      ...body,
      version: latest.version,
      ...(mergedProfile ? { profile: mergedProfile } : {}),
    });
  }
}
function Choices({ values, value, onChange }: any) {
  return (
    <View style={s.wrap}>
      {values.map((v: string) => (
        <Button
          key={v}
          title={label(v)}
          secondary={value !== v}
          onPress={() => onChange(v)}
        />
      ))}
    </View>
  );
}
export default function App() {
  const [token, setToken] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [me, setMe] = useState<Row | null>(null),
    [lid, setLid] = useState(""),
    [tab, setTab] = useState("Home"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          "x-client": "native",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 && token) {
          await SecureStore.deleteItemAsync("prime.session");
          setToken(null);
          setMe(null);
        }
        throw Error(data.error || "Request failed");
      }
      return data;
    },
    [token],
  );
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await request("/me");
      setMe(data);
      setLid((old) =>
        old === "all" && data.locations.length > 1
          ? "all"
          : data.locations.some((l: Row) => l.id === old)
          ? old
          : data.locations.length > 1 ? "all" : data.locations[0]?.id || "",
      );
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [request, token]);
  useEffect(() => {
    SecureStore.getItemAsync("prime.session")
      .then(setToken)
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const navigateOwner = useCallback((next: string) => {
    setLid((current) => {
      if (current === "all" && next !== OwnerRoutes.Home && me?.locations.length) {
        return me.locations[0].id;
      }
      return current;
    });
    setTab(next);
  }, [me?.locations]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (tab !== OwnerRoutes.Home) {
        setTab(OwnerRoutes.Home);
        return true;
      }
      if (lid !== "all" && me?.locations.length && me.locations.length > 1) {
        setLid("all");
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [lid, me?.locations.length, tab]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function login(register: boolean, body: Row) {
    const data = await request(
      `/auth/${register ? "register" : "login"}`,
      "POST",
      body,
    );
    await SecureStore.setItemAsync("prime.session", data.token);
    setToken(data.token);
  }
  const l = me?.locations.find((x: Row) => x.id === lid),
    tenant =
      me?.tenants.find((t: Row) => t.id === l?.tenant_id) || me?.tenants[0];
  if (!ready)
    return (
      <View style={s.loading}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  return (
    <View style={s.safe}>
      <Stars />
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.brand}>
          ▦ 1QR <Text style={{ fontWeight: "400" }}>Prime</Text>
        </Text>
        <Text style={s.kicker}>MERCHANT</Text>
      </View>
      <Text style={[s.environmentTag, environmentLabel === "PREVIEW" && s.previewTag]}>{environmentLabel}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {!token ? (
        <Auth login={login} run={run} busy={busy} />
      ) : !me ? (
        <View style={s.loading}>
          <Text style={s.loadingTitle}>Connecting to 1QR Prime</Text>
          <Hint>Loading your business workspace…</Hint>
          <Button title="Retry connection" onPress={() => run(refresh)} />
        </View>
      ) : (
        <>
          <ScrollView
            style={s.content}
            contentContainerStyle={{ paddingBottom: 125 }}
            refreshControl={
              <RefreshControl
                refreshing={busy}
                onRefresh={() => run(refresh)}
              />
            }
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
            >
              {me.locations.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="All businesses" onPress={() => { setLid("all"); setTab(OwnerRoutes.Home); }} style={[s.chip, lid === "all" && { backgroundColor: "#dce9c4" }]}><Text style={s.chipText}>All businesses</Text></Pressable>}
              {me.locations.map((x: Row) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${x.name}`}
                  key={x.id}
                  onPress={() => { setLid(x.id); setTab(OwnerRoutes.Home); }}
                  style={[
                    s.chip,
                    lid === x.id && { backgroundColor: "#dce9c4" },
                  ]}
                >
                  <Text style={s.chipText}>{x.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {tab === OwnerRoutes.New ? (
              <CreateLocation
                tenant={tenant}
                request={request}
                run={run}
                done={async () => {
                  await refresh();
                  setTab(OwnerRoutes.Home);
                }}
                token={token}
              />
            ) : lid === "all" && tab === OwnerRoutes.Home ? (
              <OwnerPortfolio me={me} request={request} setLid={setLid} setTab={setTab} />
            ) : !l ? (
              <CreateLocation tenant={tenant} request={request} run={run} done={async () => { await refresh(); setTab(OwnerRoutes.Home); }} token={token} />
            ) : (
              <>
                {tab === OwnerRoutes.Home && (
                  <>
                    <Text style={s.kicker}>{label(l.category).toUpperCase()}</Text>
                    <Title>Good day</Title>
                    <View style={s.businessHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.businessName}>{l.name}</Text>
                        <Text style={s.openPill}>{l.published ? "LIVE" : "DRAFT"}</Text>
                      </View>
                      <Text style={s.businessChevron}>⌄</Text>
                    </View>
                    <View style={s.hero}>
                      <Text style={s.heroEyebrow}>TODAY AT A GLANCE</Text>
                      <Text style={s.heroTitle}>{l.items.length} menu items ready</Text>
                      <Text style={s.heroText}>
                        {l.published
                          ? "Your customer page is live and ready for customers."
                          : "Finish setup to make your customer page live."}
                      </Text>
                    </View>
                    <View style={s.quickGrid}>
                      {[['Orders', 'Live order desk', OwnerRoutes.Orders], ['Menu', 'Edit dishes', OwnerRoutes.Menu], ['Tables', 'Table QR codes', OwnerRoutes.Tables], ['QR', 'Share your QR', OwnerRoutes.QR]].map(([title, detail, target]) => <Pressable key={title} accessibilityRole="button" style={s.quickAction} onPress={() => navigateOwner(target)}><Text style={s.quickActionTitle}>{title}</Text><Text style={s.quickActionDetail}>{detail}</Text><Text style={s.arrow}>→</Text></Pressable>)}
                    </View>
                    <Pressable style={s.warningCard} onPress={() => navigateOwner(OwnerRoutes.Payments)}><Text style={s.warningTitle}>Payments are not set up</Text><Text style={s.warningText}>Configure UPI so customers can pay from your page.</Text><Text style={s.warningLink}>Configure UPI →</Text></Pressable>
                  </>
                )}
                {(tab === OwnerRoutes.Menu || tab === OwnerRoutes.CustomerPage) && (
                  tab === OwnerRoutes.Menu ? <NativeMenu
                    key={l.id + ":menu:" + l.version}
                    l={l}
                    request={request}
                    run={run}
                    refresh={refresh}
                  /> : <NativeProfile
                    key={l.id + ":" + l.version}
                    l={l}
                    request={request}
                    run={run}
                    refresh={refresh}
                    token={token}
                  />
                )}{" "}
                {tab === OwnerRoutes.Orders && (
                  <NativeOrders key={l.id} l={l} request={request} run={run} />
                )}{" "}
                {tab === OwnerRoutes.Tables && (
                  <NativeTables key={l.id} l={l} request={request} run={run} token={token} />
                )} {" "}
                {tab === OwnerRoutes.Payments && (
                  <NativePayments
                    key={l.id}
                    l={l}
                    emailVerified={!!me.emailVerified}
                    request={request}
                    run={run}
                  />
                )}{" "}
                {tab === OwnerRoutes.QR && <NativeQr l={l} token={token} run={run} />}
                {tab === OwnerRoutes.More && <MoreMenu setTab={navigateOwner} l={l} />}
                {(tab === "Account" || tab === OwnerRoutes.Settings) && (
                  <>
                    <Title>Account & plan</Title>
                    <Card>
                      <Text style={s.itemTitle}>{me.email}</Text>
                      <Hint>
                        {tenant.plan_name} · {label(tenant.billing_state)}
                      </Hint>
                      <Hint>
                        Locations: {tenant.entitlements.locations}. Staff seats:{" "}
                        {tenant.entitlements.staff}. Purchases are not available
                        in this app.
                      </Hint>
                      <Button
                        title="Verify email address"
                        secondary
                        onPress={() =>
                          run(async () => {
                            await request("/auth/request-verification", "POST");
                            Alert.alert(
                              "Check your email",
                              "Open the verification link to verify your account.",
                            );
                          })
                        }
                      />
                      <Button
                        title="Add a location"
                        secondary
                        onPress={() => navigateOwner(OwnerRoutes.New)}
                      />
                      <Button
                        title="Enable order notifications"
                        onPress={() =>
                          run(async () => {
                            if (!Device.isDevice)
                              throw Error(
                                "Push notifications require a physical device",
                              );
                            if (Platform.OS === "android")
                              await Notifications.setNotificationChannelAsync(
                                "default",
                                {
                                  name: "Business notifications",
                                  importance:
                                    Notifications.AndroidImportance.HIGH,
                                },
                              );
                            const permission =
                              await Notifications.requestPermissionsAsync();
                            if (permission.status !== "granted")
                              throw Error(
                                "Notification permission was not granted",
                              );
                            const projectId =
                              Constants.expoConfig?.extra?.eas?.projectId;
                            if (!projectId)
                              throw Error(
                                "EAS project must be configured before push can be enabled",
                              );
                            const push =
                              await Notifications.getExpoPushTokenAsync({
                                projectId,
                              });
                            await request("/push", "POST", {
                              token: push.data,
                            });
                            Alert.alert(
                              "Notifications enabled",
                              "Keep the order desk available; push is an additional alert.",
                            );
                          })
                        }
                      />
                      <Button
                        title="Disable notifications"
                        secondary
                        onPress={() => run(() => request("/push", "DELETE"))}
                      />
                    </Card>
                    <Card>
                      <Title>Privacy & control</Title>
                      <Button
                        title="Export my data"
                        secondary
                        onPress={() =>
                          run(async () => {
                            const data = await request("/account/export");
                            const file = new File(
                              Paths.cache,
                              "1qr-export.json",
                            );
                            file.create({ overwrite: true });
                            file.write(JSON.stringify(data, null, 2));
                            await Sharing.shareAsync(file.uri, {
                              mimeType: "application/json",
                            });
                          })
                        }
                      />
                      <Button
                        title="Privacy policy"
                        secondary
                        onPress={() => Linking.openURL(`${WEB}/privacy`)}
                      />
                      <DeleteAccount
                        request={request}
                        run={run}
                        done={async () => {
                          await SecureStore.deleteItemAsync("prime.session");
                          setToken(null);
                          setMe(null);
                        }}
                      />
                      <Button
                        title="Sign out"
                        secondary
                        onPress={() =>
                          run(async () => {
                            await request("/push", "DELETE");
                            // Fastify's JSON parser rejects an empty body when the
                            // content type is application/json. Send an explicit
                            // empty object so logout works against the remote API.
                            await request("/auth/logout", "POST", {});
                            await SecureStore.deleteItemAsync("prime.session");
                            setToken(null);
                            setMe(null);
                          })
                        }
                      />
                    </Card>
                  </>
                )} 
                {tab === OwnerRoutes.Businesses && <BusinessList me={me} setLid={setLid} setTab={navigateOwner} />}
                {tab === OwnerRoutes.Profile && <OwnerProfile me={me} request={request} run={run} />}
                {tab === OwnerRoutes.Analytics && <NativeInfoScreen title="Analytics" detail="Business activity and customer actions" request={request} path={`/locations/${l.id}/analytics`} />}
                {tab === OwnerRoutes.Staff && <NativeStaff tenant={tenant} request={request} run={run} />}
                {tab === OwnerRoutes.Support && <NativeSupport />}
              </>
            )}
          </ScrollView>
          <View style={s.nav}>
            {["Home", "Orders", "Menu", "QR", "More"]
              .filter(
                (t) =>
                  !(l?.role === "staff" && ["Profile", "Payments"].includes(t)),
              )
              .map((t) => (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  key={t}
                  onPress={() => navigateOwner(t)}
                  style={[s.navButton, tab === t && s.navActive]}
                >
                  <Text
                    style={[
                      s.navText,
                      tab === t && { color: "#194f42", fontWeight: "700" },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
          </View>
        </>
      )}
    </View>
  );
}
function Auth({ login, run, busy }: any) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView style={s.content} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <View style={s.hero}>
        <Text style={s.heroEyebrow}>✦ MERCHANT WORKSPACE</Text>
        <Text style={s.heroTitle}>One QR.{"\n"}Your whole business.</Text>
        <Text style={s.heroText}>
          Run your business from one calm, focused workspace.
        </Text>
      </View>
      <Card>
        <Title>{register ? "Create your account" : "Welcome back"}</Title>
        {register && (
          <Input title="Business name" value={name} onChangeText={setName} />
        )}
        <Input
          title="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Input
          title="Password (at least 12 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={register ? "new-password" : "current-password"}
        />
        <Button
          title={
            busy ? "Please wait…" : register ? "Create account" : "Sign in"
          }
          disabled={busy}
          onPress={() =>
            run(() =>
              login(register, {
                email,
                password,
                ...(register ? { name } : {}),
              }),
            )
          }
        />
        <Button
          title="Forgot password"
          secondary
          onPress={() => Linking.openURL(`${WEB}/recovery`)}
        />
        <Button
          title={
            register ? "I already have an account" : "Create a free account"
          }
          secondary
          onPress={() => setRegister(!register)}
        />
      </Card>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
function CreateLocation({ tenant, request, run, done, token }: any) {
  const [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [category, setCategory] = useState("restaurant"),
    [step, setStep] = useState(0),
    [location, setLocation] = useState<Row | null>(null),
    [description, setDescription] = useState(""),
    [address, setAddress] = useState(""),
    [phone, setPhone] = useState(""),
    [tax, setTax] = useState("0"),
    [packaging, setPackaging] = useState("0");
  const restaurant = ["restaurant", "cafe", "cloud_kitchen"].includes(category);
  async function next() {
    if (step === 0) {
      const created = await request("/locations", "POST", { name, slug, category, tenantId: tenant.id });
      setLocation(created); setStep(1); return;
    }
    if (!location) return;
    const profile = { ...location.profile, description, address, phone, orderEnabled: restaurant, orderTypes: restaurant ? ["dine_in", "takeaway"] : ["takeaway"], payAtCounter: true, taxBps: Math.round(Number(tax || 0) * 100), packagingFeePaise: Math.round(Number(packaging || 0) * 100) };
    if (step < 2) { const saved = await request(`/locations/${location.id}/onboarding`, "PATCH", { step: step + 1, name, category, profile }); setLocation(saved); setStep(step + 1); return; }
    const published = await updateLocationRequest(request, location.id, { name, category, profile, published: true, version: location.version });
    setLocation(published);
    setStep(3);
  }
  if (step >= 3 && location) return <Card><Title>Your business is live 🎉</Title><Hint>Print or share this QR anywhere. Your QR stays the same when your menu or details change.</Hint><Image accessibilityLabel="Permanent business QR" source={{ uri: `${API_BASE}/locations/${location.id}/qr?format=png&kind=page`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={{ width: 280, height: 280, alignSelf: "center" }} /><Button title="Go to My QR" onPress={done} /></Card>;
  return <Card><Text style={s.kicker}>STEP {step + 1} OF 3</Text><Title>{step === 0 ? "Create your first business" : step === 1 ? "Tell customers about you" : "Restaurant setup"}</Title><Hint>Setup is saved as you continue.</Hint>{step === 0 && <><Input title="Business name" value={name} onChangeText={setName} /><Input title="Permanent URL slug" autoCapitalize="none" value={slug} onChangeText={setSlug} /><Hint>Printed QR codes keep this URL.</Hint><Choices values={["restaurant", "cafe", "cloud_kitchen", "retail", "salon", "clinic", "hotel", "professional_services", "generic"]} value={category} onChange={setCategory} /></>}{step === 1 && <><Input title="Description" value={description} onChangeText={setDescription} /><Input title="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Input title="Address" value={address} onChangeText={setAddress} /></>}{step === 2 && restaurant && <><Hint>Ordering is enabled with dine-in and takeaway defaults.</Hint><Input title="Tax percent" value={tax} onChangeText={setTax} keyboardType="decimal-pad" /><Input title="Packaging fee in rupees" value={packaging} onChangeText={setPackaging} keyboardType="decimal-pad" /></>}{step === 2 && !restaurant && <Hint>Your category page is ready. You can add actions and payments after publishing.</Hint>}<Button title={step === 2 ? "Publish Business" : "Continue"} onPress={() => run(next)} disabled={step === 0 && (!name || !slug)} /></Card>;
}
function OwnerPortfolio({ me, request, setLid, setTab }: any) {
  const [metrics, setMetrics] = useState<Record<string, Row>>({});
  useEffect(() => { Promise.all(me.locations.map(async (location: Row) => [location.id, await request(`/locations/${location.id}/orders`).catch(() => ({ orders: [] }))] as const)).then((rows) => setMetrics(Object.fromEntries(rows))); }, [me.locations, request]);
  const orders = me.locations.flatMap((location: Row) => metrics[location.id]?.orders || []);
  const open = orders.filter((order: Row) => !["completed", "cancelled", "rejected"].includes(order.state)).length;
  const completedValue = orders.filter((order: Row) => order.state === "completed").reduce((sum: number, order: Row) => sum + (order.amount_paise || 0), 0);
  return <>
    <Text style={s.kicker}>OWNER PORTFOLIO</Text><Title>Your businesses</Title><Hint>Switch locations without leaving the operating desk.</Hint>
    <View style={s.portfolioMetrics}><View><Text style={s.metricValue}>{me.locations.length}</Text><Text style={s.metricLabel}>Businesses</Text></View><View><Text style={s.metricValue}>{money(completedValue)}</Text><Text style={s.metricLabel}>Completed value</Text></View><View><Text style={s.metricValue}>{open}</Text><Text style={s.metricLabel}>Open orders</Text></View></View>
    <Button title="+ Add business" onPress={() => setTab(OwnerRoutes.New)} />
    {me.locations.map((location: Row) => <Pressable key={location.id} style={s.businessRow} onPress={() => { setLid(location.id); setTab(OwnerRoutes.Home); }}><View style={s.businessMark}><Text style={s.businessMarkText}>{location.name.slice(0, 1)}</Text></View><View style={{ flex: 1 }}><Text style={s.itemTitle}>{location.name}</Text><Hint>{label(location.category)} · {location.published ? "OPEN / LIVE" : "DRAFT"}</Hint></View><Text style={s.arrow}>→</Text></Pressable>)}
  </>;
}

function BusinessList({ me, setLid, setTab }: any) {
  return <><Text style={s.kicker}>WORKSPACE</Text><Title>Businesses</Title><Hint>Choose the location you want to operate.</Hint>{me.locations.map((location: Row) => <Pressable key={location.id} style={s.businessRow} onPress={() => { setLid(location.id); setTab(OwnerRoutes.Home); }}><View style={s.businessMark}><Text style={s.businessMarkText}>{location.name.slice(0, 1)}</Text></View><View style={{ flex: 1 }}><Text style={s.itemTitle}>{location.name}</Text><Hint>{location.profile?.address || label(location.category)}</Hint></View><Text style={s.openPill}>{location.published ? "LIVE" : "DRAFT"}</Text></Pressable>)}<Button title="+ Add business" onPress={() => setTab(OwnerRoutes.New)} /></>;
}

function OwnerProfile({ me, request, run }: any) {
  const role = me.locations.find((location: Row) => location.id === me.activeLocationId)?.role || me.tenants?.[0]?.role || "owner";
  return <>
    <Text style={s.kicker}>ACCOUNT</Text><Title>Profile</Title>
    <View style={s.profileHero}><View style={s.profileAvatar}><Text style={s.profileAvatarText}>{(me.email || "?")[0].toUpperCase()}</Text></View><View><Text style={s.profileName}>{me.email?.split("@")[0] || "Owner"}</Text><Text style={s.profileRole}>{label(role)} · {me.locations.length} businesses</Text><Text style={s.profileEmail}>{me.email}</Text></View></View>
    <Text style={s.sectionLabel}>SECURITY</Text><View style={s.settingsSection}><Pressable style={s.settingsRow} onPress={() => run(async () => { await request("/auth/request-verification", "POST"); Alert.alert("Check your email", "A verification link has been sent if your account requires one."); })}><View><Text style={s.itemTitle}>Email verification</Text><Hint>{me.emailVerified ? "Verified" : "Verification available"}</Hint></View><Text style={s.arrow}>→</Text></Pressable><Pressable style={s.settingsRow} onPress={() => Linking.openURL(`${WEB}/recovery`)}><View><Text style={s.itemTitle}>Change password</Text><Hint>Use secure account recovery</Hint></View><Text style={s.arrow}>→</Text></Pressable></View>
    <Text style={s.sectionLabel}>SUPPORT & PRIVACY</Text><View style={s.settingsSection}><Pressable style={s.settingsRow} onPress={() => Linking.openURL(`${WEB}/support`)}><View><Text style={s.itemTitle}>Help & support</Text><Hint>Get help with your workspace</Hint></View><Text style={s.arrow}>→</Text></Pressable><Pressable style={s.settingsRow} onPress={() => Linking.openURL(`${WEB}/privacy`)}><View><Text style={s.itemTitle}>Privacy policy</Text><Hint>How 1QR Prime handles account data</Hint></View><Text style={s.arrow}>→</Text></Pressable></View>
    <Hint>Account deletion remains under Account & settings to keep it separate from everyday profile actions.</Hint>
  </>;
}

function NativeInfoScreen({ title, detail, request, path }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    request(path).then((value: any) => { if (mounted) setData(value); }).catch(() => {}).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [path, request]);
  return <>
    <Text style={s.kicker}>WORKSPACE</Text>
    <Title>{title}</Title>
    <Hint>{detail}</Hint>
    {loading ? <Card><ActivityIndicator color="#ffffff" /><Hint>Loading {title.toLowerCase()}…</Hint></Card> : <Card><Text style={s.itemTitle}>{Array.isArray(data) ? `${data.length} records available` : "Connected"}</Text><Hint>Data is scoped to the selected business.</Hint><Button title="Refresh" secondary onPress={() => { setLoading(true); request(path).then(setData).catch(() => {}).finally(() => setLoading(false)); }} /></Card>}
  </>;
}

function NativeStaff({ tenant, request, run }: any) {
  const [staff, setStaff] = useState<Row[]>([]);
  const load = useCallback(async () => setStaff(await request(`/tenants/${tenant.id}/staff`)), [request, tenant.id]);
  useEffect(() => { run(load); }, [load]);
  return <>
    <Text style={s.kicker}>TEAM</Text><Title>Staff</Title><Hint>Manage people who help run your businesses.</Hint>
    {!staff.length && <Card><Text style={s.itemTitle}>No staff members yet</Text><Hint>Staff invitations and role changes are managed by the owner.</Hint></Card>}
    {staff.map((member) => <Card key={member.id}><Text style={s.itemTitle}>{member.email}</Text><Text style={s.staffRole}>{label(member.role)}</Text></Card>)}
  </>;
}

function NativeSupport() {
  return <>
    <Text style={s.kicker}>HELP</Text><Title>Support</Title><Hint>Get help with your 1QR Prime workspace.</Hint>
    <Card><Text style={s.itemTitle}>Need help?</Text><Hint>Open the support center for account, QR, menu and order assistance.</Hint><Button title="Open support center" onPress={() => Linking.openURL(`${WEB}/support`)} /><Button title="Privacy policy" secondary onPress={() => Linking.openURL(`${WEB}/privacy`)} /></Card>
  </>;
}

function MoreMenu({ setTab, l }: any) {
  const entries = [
    [OwnerRoutes.Businesses, "Switch locations or add a business", "Businesses"],
    [OwnerRoutes.Tables, "Create and share table QR codes", "Tables"],
    [OwnerRoutes.Payments, "Configure UPI payments", "Payments"],
    [OwnerRoutes.CustomerPage, "Control what customers see", "Customer Page"],
    [OwnerRoutes.Analytics, "QR, menu and order activity", "Analytics"],
    [OwnerRoutes.Staff, "Manage your team", "Staff"],
    [OwnerRoutes.Profile, "Your owner account and security", "Profile"],
    [OwnerRoutes.Settings, "Notifications, privacy and settings", "Settings"],
    [OwnerRoutes.Support, "Get help with your workspace", "Support"],
  ];
  return <>
    <Text style={s.kicker}>WORKSPACE</Text>
    <Title>More tools</Title>
    {entries.map(([route, detail, title]) => <Pressable key={route} accessibilityRole="button" accessibilityLabel={title} style={s.moreRow} onPress={() => setTab(route)}><View style={{ flex: 1 }}><Text style={s.moreTitle}>{title}</Text><Text style={s.moreDetail}>{detail}</Text></View><Text style={s.arrow}>→</Text></Pressable>)}
    <Card><Text style={s.itemTitle}>Preview diagnostics</Text><Hint>{environmentLabel} · {API_BASE}</Hint><Button title="Check API" secondary onPress={() => Linking.openURL(`${API_BASE}/health`)} /></Card>
  </>;
}

function PublicQrImage({ uri, labelText }: { uri: string; labelText: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return <View style={s.qrPlate}>
    {state === "failed" ? <View style={s.qrFallback}><Text style={s.itemTitle}>QR unavailable</Text><Hint>Check the preview server and try again.</Hint></View> : <Image accessibilityLabel={labelText} source={{ uri, cache: "reload" }} onLoad={() => setState("ready")} onError={() => setState("failed")} style={s.qrImage} />}
    {state === "loading" && <View pointerEvents="none" style={s.qrLoading}><Text style={s.qrLoadingText}>Loading QR…</Text></View>}
  </View>;
}

function tableToken(table: Row) {
  return String(table.public_token || table.publicToken || "");
}

function NativeQr({ l, token, run }: any) {
  const [format, setFormat] = useState("png");
  const uri = `${API_BASE}/public/${encodeURIComponent(l.publicId || l.public_id || l.slug)}/qr?format=${format}`;
  return <>
    <Text style={s.kicker}>CUSTOMER ENTRY</Text>
    <Title>Your QR</Title>
    {environmentLabel === "PREVIEW" && <View style={s.previewWarning}><Text style={s.warningTitle}>TEST QR</Text><Text style={s.warningText}>Temporary preview URL. Do not print for permanent use.</Text></View>}
    <Card>
      <PublicQrImage uri={uri} labelText="Business QR code" />
      <Text style={s.qrName}>{l.name}</Text>
      <Hint>One QR. Your whole business.</Hint>
      <Button title="Download and share QR" onPress={() => run(async () => { const file = await File.downloadFileAsync(uri, new File(Paths.cache, `1qr-${l.slug || l.id}.${format}`), { headers: { Authorization: `Bearer ${token}` } }); if (!await Sharing.isAvailableAsync()) throw Error("Sharing is unavailable on this device"); await Sharing.shareAsync(file.uri, { mimeType: format === "svg" ? "image/svg+xml" : "image/png", dialogTitle: "Share business QR" }); })} />
      <Button title="Preview customer hub" secondary onPress={() => Linking.openURL(`${WEB}/q/${l.publicId || l.public_id || l.slug}`)} />
    </Card>
  </>;
}

function NativeMenu({ l, request, run, refresh }: any) {
  const [query, setQuery] = useState(""), [editing, setEditing] = useState<Row | null>(null), [name, setName] = useState(""), [description, setDescription] = useState(""), [price, setPrice] = useState(""), [discount, setDiscount] = useState(""), [foodType, setFoodType] = useState("OTHER");
  const items = (l.items || []).filter((item: Row) => item.name.toLowerCase().includes(query.toLowerCase()));
  function openEditor(item?: Row) { setEditing(item || {}); setName(item?.name || ""); setDescription(item?.description || ""); setPrice(String((item?.price_paise || 0) / 100 || "")); setDiscount(item?.discounted_price_paise ? String(item.discounted_price_paise / 100) : ""); setFoodType(item?.food_type || "OTHER"); }
  return <>
    <View style={s.sectionHeader}><View><Text style={s.kicker}>RESTAURANT OPERATIONS</Text><Title>Menu</Title></View><Pressable style={s.addCircle} accessibilityLabel="Add menu item" onPress={() => openEditor()}><Text style={s.addCircleText}>+</Text></Pressable></View>
    <TextInput accessibilityLabel="Search menu items" style={s.search} placeholder="Search items" placeholderTextColor="#A3A3A3" value={query} onChangeText={setQuery} />
    {editing !== null && <Card><Text style={s.formTitle}>{editing.id ? "Edit item" : "Add item"}</Text><Input title="Name" value={name} onChangeText={setName} /><Input title="Description" value={description} onChangeText={setDescription} /><Input title="Price (₹)" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /><Input title="Discounted price (optional)" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} /><Choices values={["VEG", "NON_VEG", "EGG", "VEGAN", "OTHER"]} value={foodType} onChange={setFoodType} /><Button title="Save changes" disabled={!name.trim() || !price} onPress={() => run(async () => { const body = { name: name.trim(), description, price_paise: Math.round(Number(price) * 100), discountedPricePaise: discount ? Math.round(Number(discount) * 100) : null, foodType, available: editing.available ?? true, section: editing.section || "Menu" }; await request(`/locations/${l.id}/items${editing.id ? `/${editing.id}` : ""}`, editing.id ? "PUT" : "POST", body); setEditing(null); await refresh(); })} /><Button title="Cancel" secondary onPress={() => setEditing(null)} /></Card>}
    {!items.length && <Card><Text style={s.itemTitle}>{query ? "No matching items" : "Your menu is empty"}</Text><Hint>{query ? "Try another search." : "Add your first item to start accepting orders."}</Hint><Button title="Add first item" onPress={() => openEditor()} /></Card>}
    {items.map((item: Row) => <Card key={item.id}><View style={s.menuItemRow}><View style={{ flex: 1 }}><Text style={s.itemTitle}>{item.name}</Text><Text style={s.price}>{money(item.discounted_price_paise || item.price_paise)}</Text><Text style={[s.availability, { color: item.available ? "#b9df9d" : "#f0aa9d" }]}>{item.available ? "AVAILABLE" : "SOLD OUT"}</Text></View><Pressable style={s.smallButton} onPress={() => openEditor(item)}><Text style={s.smallButtonText}>Edit</Text></Pressable><Switch accessibilityLabel={`${item.name} available`} value={!!item.available} onValueChange={(available) => run(async () => { await request(`/locations/${l.id}/items/${item.id}`, "PUT", { ...item, available }); await refresh(); })} /></View></Card>)}
  </>;
}

const nativeAppearanceDefaults = {
  themePreset: "minimal", layoutPreset: "restaurant", primaryColor: "#174f43",
  secondaryColor: "#deedaf", backgroundColor: "#f6f7f4", textColor: "#202f2c",
  buttonColor: "#174f43", buttonTextColor: "#ffffff", logoUrl: null, coverUrl: null,
  actionOrder: [], hiddenActions: [],
};
const nativeThemes: Record<string, Row> = {
  minimal: { backgroundColor: "#f6f7f4", textColor: "#202f2c", primaryColor: "#174f43", secondaryColor: "#deedaf", buttonColor: "#174f43", buttonTextColor: "#ffffff" },
  midnight: { backgroundColor: "#090b0c", textColor: "#f7faf8", primaryColor: "#d9f0a6", secondaryColor: "#1a2422", buttonColor: "#f7faf8", buttonTextColor: "#090b0c" },
  warm: { backgroundColor: "#fff8ed", textColor: "#3f2c20", primaryColor: "#a9552f", secondaryColor: "#f2d39b", buttonColor: "#a9552f", buttonTextColor: "#ffffff" },
  elegant: { backgroundColor: "#f9f8f5", textColor: "#252525", primaryColor: "#252525", secondaryColor: "#e6e1d7", buttonColor: "#252525", buttonTextColor: "#ffffff" },
  bold: { backgroundColor: "#ffffff", textColor: "#161616", primaryColor: "#101010", secondaryColor: "#f0d24f", buttonColor: "#101010", buttonTextColor: "#ffffff" },
};
const customerActionFields: [string, string, string][] = [
  ["googleReviewUrl", "Google Review", "https://g.page/.../review"],
  ["instagramUrl", "Instagram", "https://instagram.com/..."],
  ["facebookUrl", "Facebook", "https://facebook.com/..."],
  ["youtubeUrl", "YouTube", "https://youtube.com/@..."],
  ["xUrl", "X / Twitter", "https://x.com/..."],
  ["linkedinUrl", "LinkedIn", "https://linkedin.com/company/..."],
  ["websiteUrl", "Website", "https://example.com"],
  ["directionsUrl", "Google Maps", "https://maps.google.com/?q=..."],
];
const customerActionKeys = ["menu", "pay", "whatsapp", "call", "directions", "review", "website", "instagram", "facebook", "youtube", "linkedin", "x"];
const customerActionLabels: Record<string, string> = { menu: "Menu", pay: "Pay", whatsapp: "WhatsApp", call: "Call", directions: "Directions", review: "Google Review", website: "Website", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", linkedin: "LinkedIn", x: "X / Twitter" };

function NativeProfile({ l, request, run, refresh, token }: any) {
  const [name, setName] = useState(l.name);
  const [profile, setProfile] = useState({ ...l.profile, actions: l.profile.actions || [], appearance: { ...nativeAppearanceDefaults, ...(l.profile.appearance || {}) } });
  const [published, setPublished] = useState(!!l.published);
  const [category, setCategory] = useState(l.category);
  const [saved, setSaved] = useState(false);
  const appearance = profile.appearance;
  const hidden = appearance.hiddenActions || [];
  const ordered = [...(appearance.actionOrder || []), ...customerActionKeys.filter((x) => !(appearance.actionOrder || []).includes(x))];
  const setProfileValue = (key: string, value: any) => setProfile((x: Row) => ({ ...x, [key]: value }));
  const setAppearance = (key: string, value: any) => setProfile((x: Row) => ({ ...x, appearance: { ...x.appearance, [key]: value } }));
  async function upload(target: "logoUrl" | "coverUrl") {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const form = new FormData();
    const nativeFile = new File(asset.uri);
    form.append("file", nativeFile as any);
    const response = await fetch(`${API_BASE}/locations/${l.id}/upload`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}`, "x-client": "native" } : { "x-client": "native" }, body: form });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Image upload failed");
    setAppearance(target, data.url);
  }
  async function save() {
    await updateLocationRequest(request, l.id, { name, category, profile, published, version: l.version });
    setSaved(true);
    await refresh();
  }
  function move(key: string, delta: number) {
    const next = [...ordered], index = next.indexOf(key), target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setAppearance("actionOrder", next);
  }
  const preview = (key: string) => !hidden.includes(key) && (key === "menu" || key === "pay" || key === "call" || key === "whatsapp" || key === "directions" || key === "review" || !!profile[({ website: "websiteUrl", instagram: "instagramUrl", facebook: "facebookUrl", youtube: "youtubeUrl", linkedin: "linkedinUrl", x: "xUrl" } as Row)[key]]);
  return <>
    <Text style={s.kicker}>CUSTOMER EXPERIENCE</Text><Title>Customer page</Title>
    <Hint>What customers see after scanning this business QR. Changes never replace the QR.</Hint>
    <Card>
      <Text style={s.sectionLabel}>LIVE PREVIEW</Text>
      <View style={[s.customerPreview, { backgroundColor: appearance.backgroundColor }]}>
        {appearance.logoUrl ? <Image source={{ uri: appearance.logoUrl }} style={s.customerPreviewLogo} /> : <View style={[s.customerPreviewAvatar, { backgroundColor: appearance.secondaryColor }]}><Text style={{ color: appearance.textColor, fontSize: 26, fontWeight: "800" }}>{name.slice(0, 1)}</Text></View>}
        <Text style={[s.customerPreviewName, { color: appearance.textColor }]}>{name}</Text>
        <Text style={{ color: appearance.textColor, opacity: 0.7 }}>{label(category)} · Open now</Text>
        {preview("menu") && <View style={[s.customerPreviewButton, { backgroundColor: appearance.buttonColor }]}><Text style={{ color: appearance.buttonTextColor, fontWeight: "800" }}>VIEW MENU</Text></View>}
        {preview("pay") && <View style={[s.customerPreviewButton, { backgroundColor: appearance.primaryColor }]}><Text style={{ color: appearance.buttonTextColor, fontWeight: "800" }}>PAY NOW</Text></View>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>{ordered.filter(preview).slice(2, 6).map((key) => <View key={key} style={[s.customerPreviewPill, { borderColor: appearance.primaryColor }]}><Text style={{ color: appearance.textColor, fontSize: 11 }}>{customerActionLabels[key]}</Text></View>)}</View>
        <Text style={{ color: appearance.textColor, opacity: 0.6, fontSize: 11, marginTop: 8 }}>Powered by 1QR Prime</Text>
      </View>
      <Button title="Preview as Customer" secondary onPress={() => Linking.openURL(`${WEB}/q/${l.publicId || l.public_id || l.slug}`)} />
    </Card>
    <Card><Text style={s.sectionLabel}>BRANDING</Text><Button title={appearance.logoUrl ? "Replace logo" : "Upload logo"} onPress={() => run(() => upload("logoUrl"))} />{appearance.logoUrl && <><Image source={{ uri: appearance.logoUrl }} style={s.customerAssetPreview} /><Button title="Remove logo" secondary onPress={() => setAppearance("logoUrl", null)} /></>}<Button title={appearance.coverUrl ? "Replace cover image" : "Upload cover image"} secondary onPress={() => run(() => upload("coverUrl"))} />{appearance.coverUrl && <><Image source={{ uri: appearance.coverUrl }} style={s.customerCoverPreview} /><Button title="Remove cover image" secondary onPress={() => setAppearance("coverUrl", null)} /></>}<Text style={s.label}>Theme preset</Text><Choices values={["minimal", "midnight", "warm", "elegant", "bold", "custom"]} value={appearance.themePreset} onChange={(value: string) => setProfile((x: Row) => ({ ...x, appearance: { ...x.appearance, themePreset: value, ...(nativeThemes[value] || {}) } }))} />{[["backgroundColor", "Background"], ["primaryColor", "Primary"], ["textColor", "Text"], ["buttonColor", "Button"], ["buttonTextColor", "Button text"]].map(([key, title]) => <Input key={key} title={`${title} color (#RRGGBB)`} value={appearance[key]} autoCapitalize="none" onChangeText={(value: string) => setAppearance(key, value)} />)}</Card>
    <Card><Text style={s.sectionLabel}>CONTACT, REVIEWS & SOCIALS</Text>{customerActionFields.map(([key, title, placeholder]) => <Input key={key} title={title} placeholder={placeholder} autoCapitalize="none" value={profile[key] || ""} onChangeText={(value: string) => setProfileValue(key, value || null)} />)}<Input title="WhatsApp number" keyboardType="phone-pad" value={profile.whatsappNumber || ""} onChangeText={(value: string) => setProfileValue("whatsappNumber", value)} /><Hint>Call uses the business phone number. Directions can use the Maps URL or the saved address.</Hint></Card>
    <Card><Text style={s.sectionLabel}>VISIBLE ACTIONS & ORDER</Text>{ordered.map((key, index) => <View key={key} style={s.settingsRow}><View style={{ flex: 1 }}><Text style={s.itemTitle}>{customerActionLabels[key]}</Text><Hint>{preview(key) ? "Visible to customers" : "Needs configuration or is hidden"}</Hint></View><Switch accessibilityLabel={`Show ${customerActionLabels[key]}`} value={!hidden.includes(key)} onValueChange={(on) => setAppearance("hiddenActions", on ? hidden.filter((x: string) => x !== key) : [...hidden, key])} /><Pressable accessibilityLabel={`Move ${customerActionLabels[key]} up`} disabled={index === 0} onPress={() => move(key, -1)}><Text style={s.arrow}>↑</Text></Pressable><Pressable accessibilityLabel={`Move ${customerActionLabels[key]} down`} disabled={index === ordered.length - 1} onPress={() => move(key, 1)}><Text style={s.arrow}>↓</Text></Pressable></View>)}</Card>
    <Card><Text style={s.sectionLabel}>BUSINESS PAGE</Text>{[ ["description", "Description"], ["address", "Address"], ["hours", "Operating hours"], ["phone", "Phone"] ].map(([key, title]) => <Input key={key} title={title} value={profile[key] || ""} onChangeText={(value: string) => setProfileValue(key, value)} />)}<View style={s.row}><Text style={s.itemTitle}>Accept orders</Text><Switch value={!!profile.orderEnabled} onValueChange={(value) => setProfileValue("orderEnabled", value)} /></View><View style={s.row}><Text style={s.itemTitle}>Publish page</Text><Switch accessibilityLabel="Publish page" value={published} onValueChange={setPublished} /></View><Button title="Save & publish customer page" onPress={() => run(save)} />{saved && <Text style={s.success}>Published. The existing QR now reflects these changes.</Text>}</Card>
  </>;
}
function NativeTables({ l, request, run, token }: any) {
  const [tables, setTables] = useState<Row[]>([]), [name, setName] = useState("");
  const load = useCallback(async () => setTables((await request(`/locations/${l.id}/tables`)).tables), [l.id, request]);
  useEffect(() => { run(load); }, [load]);
  const publicId = l.publicId || l.public_id || l.slug;
  return <>
    <Title>Tables</Title>
    <Hint>Each active table has its own QR context. Rename without reprinting.</Hint>
    {tables.map((t: Row) => { const tokenValue = tableToken(t); const uri = `${API_BASE}/public/${encodeURIComponent(publicId)}/qr?format=png&t=${encodeURIComponent(tokenValue)}`; return <Card key={t.id}><View style={s.row}><View style={{ flex: 1 }}><Text style={s.itemTitle}>{t.name}</Text><Hint>{t.enabled ? "Active table QR" : "Disabled"}</Hint></View><Button title={t.enabled ? "Disable" : "Enable"} secondary onPress={() => run(async () => { await request(`/locations/${l.id}/tables/${t.id}`, "PATCH", { name: t.name, enabled: !t.enabled }); await load(); })} /></View>{t.enabled && (tokenValue ? <PublicQrImage uri={uri} labelText={`${t.name} QR code`} /> : <View style={s.qrMissing}><Text style={s.itemTitle}>QR unavailable</Text><Hint>Table identity is still being prepared. Refresh and try again.</Hint></View>)}<Button title="Share table QR" onPress={() => run(async () => { if (!tokenValue) throw Error("This table does not have a QR token yet"); const file = await File.downloadFileAsync(uri, new File(Paths.cache, `1qr-${t.name.replace(/[^a-z0-9]/gi, "-")}.png`)); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: `${t.name} QR` }); })} /></Card>; })}
    <Card><Title>Add table</Title><Input title="Table name" value={name} onChangeText={setName} /><Button title="Create table" onPress={() => run(async () => { if (!name.trim()) return; await request(`/locations/${l.id}/tables`, "POST", { name: name.trim() }); setName(""); await load(); })} /></Card>
  </>;
}
function NativeOrders({ l, request, run }: any) {
  const [orders, setOrders] = useState<Row[]>([]),
    [connected, setConnected] = useState(false),
    [statusFilter, setStatusFilter] = useState("all"),
    [tableFilter, setTableFilter] = useState("all");
  const load = useCallback(async () => {
    try {
      const data = await request(`/locations/${l.id}/orders`);
      setOrders(data.orders);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [l.id, request]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);
  const next: Record<string, string[]> = {
    submitted: ["accepted", "rejected", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["completed", "cancelled"],
  };
  const statuses = [["all", "All"], ["submitted", "New"], ["accepted", "Accepted"], ["preparing", "Preparing"], ["ready", "Ready"], ["completed", "Completed"]];
  const tables = Array.from(new Map(orders.filter((o) => o.tableName || o.table_id).map((o) => [o.tableName || String(o.table_id), o.tableName || String(o.table_id)])).entries());
  const visibleOrders = orders.filter((o) => (statusFilter === "all" || o.state === statusFilter) && (tableFilter === "all" || (o.tableName || String(o.table_id)) === tableFilter));
  return (
    <>
      <Title>Order desk</Title>
      <Text accessibilityLiveRegion="polite" style={s.hint}>
        {connected
          ? "Connected · polling every 4 seconds"
          : "Reconnecting · orders remain saved"}
      </Text>
      <Button title="Refresh orders" secondary onPress={load} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
        {statuses.map(([value, text]) => <Pressable key={value} style={[s.filterChip, statusFilter === value && s.filterChipActive]} onPress={() => setStatusFilter(value)}><Text style={[s.filterChipText, statusFilter === value && s.filterChipTextActive]}>{text}</Text></Pressable>)}
      </ScrollView>
      {tables.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>{[["all", "All tables"], ...tables].map(([value, text]) => <Pressable key={value} style={[s.filterChip, tableFilter === value && s.filterChipActive]} onPress={() => setTableFilter(value)}><Text style={[s.filterChipText, tableFilter === value && s.filterChipTextActive]}>{text}</Text></Pressable>)}</ScrollView>}
      {visibleOrders.length === 0 && (
        <Card>
          <Text style={s.itemTitle}>{orders.length ? "No orders in this view" : "No new orders yet"}</Text>
          <Hint>{orders.length ? "Try another status or table filter." : "Incoming orders will appear here."}</Hint>
        </Card>
      )}
      {visibleOrders.map((o) => (
        <Card key={o.id}>
          <View style={s.row}>
            <Text style={s.itemTitle}>#{o.publicOrderNumber || o.id.slice(0, 8)}</Text>
            <Text style={s.tag}>{label(o.state)}</Text>
          </View>
          <Text style={s.tableLabel}>{o.tableName ? (String(o.tableName).toUpperCase().startsWith("TABLE ") ? o.tableName : `TABLE ${o.tableName}`) : (o.table_id ? `TABLE ${o.table_id}` : "NO TABLE")}</Text>
          <Hint>{label(o.order_type)} · {label(o.payment_state)}</Hint>
          {o.customer_name || o.customer_phone ? <Hint>{o.customer_name || "Guest"}{o.customer_phone ? ` · ${o.customer_phone}` : ""}</Hint> : null}
          {o.lines.map((i: Row) => (
            <View style={s.row} key={i.itemId}>
              <Text style={s.orderLine}>
                {i.quantity} × {i.name}
              </Text>
              <Text style={s.orderLine}>{money(i.pricePaise * i.quantity)}</Text>
            </View>
          ))}
          {o.instructions ? <Hint>{o.instructions}</Hint> : null}
          <Text style={s.itemTitle}>{money(o.amount_paise)}</Text>
          {(next[o.state] || []).map((state, i) => (
            <Button
              key={state}
              title={label(state)}
              secondary={i !== 0}
              onPress={() =>
                run(async () => {
                  await request(
                    `/locations/${l.id}/orders/${o.id}/state`,
                    "POST",
                    { state, expectedState: o.state, reason: state === "rejected" ? "Rejected by restaurant staff" : "" },
                  );
                  await load();
                })
              }
            />
          ))}
          {o.payment_state === "pending" && l.role !== "staff" && (
            <ConfirmPayment
              l={l}
              o={o}
              request={request}
              run={run}
              load={load}
            />
          )}
        </Card>
      ))}
    </>
  );
}
function ConfirmPayment({ l, o, request, run, load }: any) {
  const [reason, setReason] = useState("");
  return (
    <>
      <Input
        title="Receipt evidence / cash reference"
        value={reason}
        onChangeText={setReason}
      />
      <Button
        title="Record merchant confirmation"
        secondary
        onPress={() =>
          Alert.alert(
            "Confirm received payment",
            "Only continue after checking the bank/provider or receiving cash. This is not provider verification.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Record",
                onPress: () =>
                  run(async () => {
                    await request(
                      `/locations/${l.id}/orders/${o.id}/confirm-payment`,
                      "POST",
                      { reason },
                    );
                    await load();
                  }),
              },
            ],
          )
        }
      />
    </>
  );
}
function NativePayments({ l, emailVerified, request, run }: any) {
  const [data, setData] = useState<Row>({ routes: [] }),
    [name, setName] = useState(""),
    [vpa, setVpa] = useState(""),
    [payee, setPayee] = useState(""),
    [evidence, setEvidence] = useState("");
  const load = useCallback(
    async () => setData(await request(`/locations/${l.id}/routes`)),
    [l.id, request],
  );
  useEffect(() => {
    run(load);
  }, [load]);
  async function action(path: string, body: Row = {}) {
    await request(`/locations/${l.id}/routes/${path}`, "POST", body);
    await load();
  }
  return (
    <>
      <Title>Payment destinations</Title>
      <Hint>
        Only verified destinations can be activated. New attempts use the active
        route; existing attempts retain their original destination. Switching
        cannot fix payer-side bank failures.
      </Hint>
      {!emailVerified && l.role === "owner" && (
        <Card>
          <Text style={s.itemTitle}>Verify your email first</Text>
          <Hint>
            Production blocks new payment destinations until the owner email is
            verified. Open Account & plan to send a verification link.
          </Hint>
        </Card>
      )}
      {data.routes.map((r: Row) => (
        <Card key={r.id}>
          <Text style={s.itemTitle}>{r.label}</Text>
          <Text style={s.tag}>{label(r.state)}</Text>
          <Text style={s.itemTitle}>{r.vpa}</Text>
          <Hint>{r.payee} · Basic UPI · Confirmation pending</Hint>
          {r.state === "draft" && l.role === "owner" && (
            <>
              <Input
                title="Ownership evidence reference"
                value={evidence}
                onChangeText={setEvidence}
              />
              <Button
                title="Request verification"
                secondary
                onPress={() =>
                  run(() =>
                    action(`${r.id}/request-verification`, { evidence }),
                  )
                }
              />
            </>
          )}
          {r.state === "verified" && (
            <Button
              title="Make active"
              onPress={() =>
                run(() =>
                  action(`${r.id}/activate`, {
                    reason: "Merchant switched from native app",
                  }),
                )
              }
            />
          )}
        </Card>
      ))}
      {data.previousId && (
        <Button
          title="Rollback to last verified route"
          secondary
          onPress={() => run(() => action("rollback"))}
        />
      )}{" "}
      {l.role === "owner" && (
        <Card>
          <Title>Add destination</Title>
          <Input title="Label" value={name} onChangeText={setName} />
          <Input
            title="Merchant UPI ID"
            autoCapitalize="none"
            value={vpa}
            onChangeText={setVpa}
          />
          <Input title="Payee name" value={payee} onChangeText={setPayee} />
          <Button
            title="Save draft route"
            disabled={!emailVerified}
            onPress={() =>
              run(async () => {
                if (!emailVerified)
                  throw Error("Verify your email before adding payment destinations.");
                await request(`/locations/${l.id}/routes`, "POST", {
                  label: name,
                  vpa,
                  payee,
                });
                setName("");
                setVpa("");
                setPayee("");
                await load();
              })
            }
          />
        </Card>
      )}
    </>
  );
}
function DeleteAccount({ request, run, done }: any) {
  const [password, setPassword] = useState("");
  return (
    <>
      <Input
        title="Password to delete account"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button
        title="Delete my account"
        secondary
        onPress={() =>
          Alert.alert(
            "Permanently delete account?",
            "Owned businesses, public pages and orders will be removed. Printed QR codes will stop working. Restricted audit and expiring backups remain under the retention policy.",
            [
              { text: "Keep account", style: "cancel" },
              {
                text: "Delete permanently",
                style: "destructive",
                onPress: () =>
                  run(async () => {
                    await request("/account/delete", "POST", {
                      password,
                      confirmation: "DELETE",
                    });
                    await done();
                  }),
              },
            ],
          )
        }
      />
    </>
  );
}
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#050505",
    paddingTop: Platform.OS === "ios" ? 58 : 42,
    paddingBottom: Platform.OS === "ios" ? 24 : 16,
  },
  star: { position: "absolute", backgroundColor: "#ffffff", borderRadius: 99, opacity: 0.22 },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  brand: { fontSize: 25, fontWeight: "800", color: "#ffffff" },
  kicker: {
    fontSize: 10,
    color: "#aeb4af",
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  environmentTag: {
    alignSelf: "flex-end",
    marginRight: 20,
    marginTop: -8,
    marginBottom: 2,
    color: "#d9e7ae",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
  },
  previewTag: { backgroundColor: "#fff1c7", color: "#765a08" },
  content: { paddingHorizontal: 20, paddingTop: 22 },
  title: {
    fontSize: 23,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 17,
  },
  hero: {
    backgroundColor: "#111111",
    padding: 22,
    borderRadius: 19,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroEyebrow: { color: "#8e8e8e", fontSize: 11, letterSpacing: 1.4, fontWeight: "700", marginBottom: 12 },
  heroTitle: {
    fontSize: 31,
    color: "#ffffff",
    fontWeight: "700",
    lineHeight: 39,
  },
  heroText: {
    color: "#a8a8a8",
    lineHeight: 23,
    marginVertical: 17,
    fontSize: 14,
  },
  card: {
    padding: 20,
    backgroundColor: "#101010",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 18,
  },
  hint: { color: "#aeb4af", fontSize: 13, lineHeight: 21, marginVertical: 8 },
  field: { marginVertical: 9 },
  label: {
    fontSize: 12,
    color: "#c6ccc7",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "capitalize",
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    padding: 12,
    color: "#ffffff",
    minHeight: 46,
    fontSize: 15,
    backgroundColor: "#171717",
  },
  button: {
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: "center",
    marginVertical: 6,
    minHeight: 46,
  },
  buttonText: { color: "#050505", fontWeight: "700", fontSize: 13 },
  secondary: {
    backgroundColor: "#1d1d1d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginVertical: 10,
  },
  chipText: { color: "#050505", fontSize: 14, fontWeight: "600" },
  itemTitle: { fontWeight: "700", fontSize: 16, color: "#ffffff" },
  tag: {
    fontSize: 11,
    backgroundColor: "#1d2a1e",
    color: "#d9e7ae",
    padding: 6,
    borderRadius: 5,
    alignSelf: "flex-start",
    marginVertical: 8,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  nav: {
    flexDirection: "row",
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingTop: 10,
    backgroundColor: "#090909",
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 8,
  },
  navText: { fontSize: 11, color: "#aeb4af" },
  navActive: { backgroundColor: "#ffffff" },
  error: {
    backgroundColor: "#281815",
    color: "#ffb7a8",
    padding: 15,
    fontSize: 13,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  loadingTitle: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginBottom: 4 },
  businessHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 4, marginBottom: 18 },
  businessName: { color: "#ffffff", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  businessChevron: { color: "#ffffff", fontSize: 28, paddingHorizontal: 10 },
  openPill: { color: "#d9e7ae", fontSize: 10, letterSpacing: 1.2, fontWeight: "800" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  quickAction: { width: "48%", minHeight: 108, backgroundColor: "#101010", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 14, padding: 15 },
  quickActionTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  quickActionDetail: { color: "#969696", fontSize: 12, lineHeight: 17 },
  arrow: { color: "#ffffff", fontSize: 20, alignSelf: "flex-end", marginTop: 8 },
  warningCard: { backgroundColor: "#211d12", borderColor: "#5b4c23", borderWidth: 1, borderRadius: 14, padding: 17, marginBottom: 18 },
  warningTitle: { color: "#f3d879", fontSize: 15, fontWeight: "700", marginBottom: 5 },
  warningText: { color: "#c3b98d", fontSize: 13, lineHeight: 19 },
  warningLink: { color: "#ffffff", marginTop: 12, fontWeight: "700" },
  moreRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#101010", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 14, padding: 17, marginBottom: 10, minHeight: 72 },
  moreTitle: { color: "#ffffff", fontWeight: "700", fontSize: 16, marginBottom: 4 },
  moreDetail: { color: "#989898", fontSize: 12 },
  qrImage: { width: 270, height: 270, alignSelf: "center", backgroundColor: "#ffffff", marginBottom: 17 },
  qrPlate: { backgroundColor: "#ffffff", borderRadius: 18, padding: 12, alignSelf: "center", marginBottom: 17 },
  qrFallback: { width: 270, height: 270, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 24 },
  qrLoading: { position: "absolute", left: 12, top: 12, right: 12, bottom: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  qrLoadingText: { color: "#555555", fontSize: 14, fontWeight: "600" },
  qrMissing: { alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a", borderRadius: 14, borderWidth: 1, borderColor: "#4a4a4a", minHeight: 120, padding: 20, marginTop: 14, marginBottom: 17 },
  qrName: { color: "#ffffff", fontSize: 20, fontWeight: "700", textAlign: "center" },
  previewWarning: { backgroundColor: "#241f11", borderRadius: 12, borderWidth: 1, borderColor: "#5b4c23", padding: 14, marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  addCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  addCircleText: { color: "#050505", fontSize: 28, lineHeight: 30, fontWeight: "400" },
  search: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "#101010", color: "#ffffff", paddingHorizontal: 16, fontSize: 15, marginBottom: 14 },
  formTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginBottom: 5 },
  menuItemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  price: { color: "#ffffff", fontSize: 15, fontWeight: "600", marginTop: 5 },
  availability: { fontSize: 10, letterSpacing: 1.1, fontWeight: "800", marginTop: 8 },
  smallButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  smallButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 12 },
  filterScroll: { marginBottom: 10, flexGrow: 0 },
  filterChip: { minHeight: 40, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: "#151515", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginRight: 8 },
  filterChipActive: { backgroundColor: "#ffffff", borderColor: "#ffffff" },
  filterChipText: { color: "#aaaaaa", fontSize: 12, fontWeight: "700" },
  filterChipTextActive: { color: "#050505" },
  portfolioMetrics: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#101010", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 18, marginVertical: 16 },
  metricValue: { color: "#ffffff", fontSize: 21, fontWeight: "800" },
  metricLabel: { color: "#999999", fontSize: 11, marginTop: 5 },
  businessRow: { flexDirection: "row", alignItems: "center", minHeight: 78, padding: 14, marginBottom: 10, borderRadius: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "#101010", gap: 12 },
  businessMark: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  businessMarkText: { color: "#050505", fontSize: 19, fontWeight: "800" },
  sectionLabel: { color: "#8f8f8f", fontSize: 11, letterSpacing: 1.4, fontWeight: "800", marginTop: 24, marginBottom: 9 },
  settingsSection: { backgroundColor: "#101010", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  settingsRow: { flexDirection: "row", alignItems: "center", padding: 17, minHeight: 70, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 15, paddingVertical: 15 },
  profileAvatar: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#050505", fontSize: 28, fontWeight: "800" },
  profileName: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  profileRole: { color: "#d9e7ae", fontSize: 13, fontWeight: "700", marginTop: 5 },
  profileEmail: { color: "#999999", fontSize: 12, marginTop: 4 },
  tableLabel: { color: "#f3d879", fontSize: 13, fontWeight: "800", letterSpacing: 1.2, marginBottom: 2 },
  orderLine: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  staffRole: { color: "#d9e7ae", fontSize: 13, fontWeight: "700", marginTop: 6 },
  chip: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: "#edf0e7",
    marginRight: 8,
  },
  preview: { padding: 20, backgroundColor: "#f5f7ee", borderRadius: 10 },
  previewAction: {
    backgroundColor: "#e2ebd5",
    padding: 12,
    borderRadius: 7,
    marginTop: 8,
    color: "#294c32",
  },
  success: { color: "#cfe8a7", fontWeight: "700", marginTop: 10, lineHeight: 20 },
  customerPreview: { borderRadius: 18, padding: 16, minHeight: 290, alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  customerPreviewLogo: { width: 54, height: 54, borderRadius: 27, resizeMode: "contain", backgroundColor: "#ffffff", marginBottom: 8 },
  customerPreviewAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  customerPreviewName: { fontSize: 18, fontWeight: "800", marginBottom: 3 },
  customerPreviewButton: { minWidth: 190, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: "center", marginTop: 10 },
  customerPreviewPill: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, marginTop: 8 },
  customerAssetPreview: { width: 96, height: 96, resizeMode: "contain", borderRadius: 12, backgroundColor: "#ffffff", marginVertical: 8 },
  customerCoverPreview: { width: "100%", height: 100, resizeMode: "cover", borderRadius: 12, marginVertical: 8 },
});
