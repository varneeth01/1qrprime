import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const mobileAndroid = join(root, "apps", "mobile", "android");
const expected = {
  NODE_ENV: "production",
  EXPO_PUBLIC_ENVIRONMENT: "production",
  EXPO_PUBLIC_API_URL: "https://api.1qrprime.com/api",
  EXPO_PUBLIC_WEB_ORIGIN: "https://1qrprime.com",
};

const env = { ...process.env, ...expected };
for (const [key, value] of Object.entries(expected)) {
  if (env[key] !== value) throw new Error(`Android release preflight failed: ${key} must be ${value}`);
}

const localProperties = readFileSync(join(mobileAndroid, "local.properties"), "utf8");
const ndkLine = localProperties.match(/^ndk\.dir=(.+)$/m);
const ndkPath = ndkLine?.[1] || join(env.ANDROID_HOME || join(homedir(), "Android", "Sdk"), "ndk", "27.0.12077973");
const sourceProperties = join(ndkPath, "source.properties");
if (!existsSync(sourceProperties) || !/Pkg\.Revision\s*=\s*27\.0\.12077973/.test(readFileSync(sourceProperties, "utf8"))) {
  throw new Error(`Android release preflight failed: NDK 27.0.12077973 not found at ${ndkPath}`);
}

const result = spawnSync("./gradlew", ["assembleRelease"], {
  cwd: mobileAndroid,
  env,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

const apk = join(mobileAndroid, "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!existsSync(apk)) throw new Error(`Android release build completed without APK: ${apk}`);
const sha256 = createHash("sha256").update(readFileSync(apk)).digest("hex");
console.log(`APK: ${apk}`);
console.log(`SHA256: ${sha256}`);
