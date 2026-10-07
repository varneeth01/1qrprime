import { spawn } from "node:child_process";
import process from "node:process";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const webPort = Number(process.env.WEB_PORT || 5173);
const apiPort = Number(process.env.PORT || 3001);
const children = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function healthy(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await reachable(url)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });

if (!await reachable(`http://127.0.0.1:${webPort}`)) {
  start("npm", ["run", "dev", "-w", "apps/web"], { PORT: String(webPort) });
  await waitFor(`http://127.0.0.1:${webPort}`);
} else {
  console.log(`Using the already-running web service on port ${webPort}.`);
}

if (await healthy(`http://127.0.0.1:${apiPort}/api/health`)) {
  throw new Error(`API port ${apiPort} is already in use. Stop the existing API and rerun npm run dev:share so PUBLIC_ORIGIN can be set safely.`);
}

const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${webPort}`], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(tunnel);
let output = "";
let publicOrigin;
const readTunnel = (chunk) => {
  output += chunk.toString();
  const match = output.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
  if (match) publicOrigin = match[0];
};
tunnel.stdout.on("data", readTunnel);
tunnel.stderr.on("data", readTunnel);
const started = Date.now();
while (!publicOrigin && Date.now() - started < 30000) await sleep(250);
if (!publicOrigin) throw new Error(`Cloudflare Quick Tunnel did not provide a URL.\n${output}`);

start("npm", ["run", "dev", "-w", "apps/api"], {
  PORT: String(apiPort),
  PUBLIC_ORIGIN: publicOrigin,
  NODE_ENV: "development",
});
await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
let externalReachable = false;
try {
  const started = Date.now();
  while (!await healthy(`${publicOrigin}/api/health`) && Date.now() - started < 10000) await sleep(250);
  if (!await healthy(`${publicOrigin}/api/health`)) throw new Error("Public health endpoint did not return HTTP 2xx");
  const runtime = await fetch(`${publicOrigin}/api/runtime-config`);
  if (!runtime.ok) throw new Error(`Runtime config returned HTTP ${runtime.status}`);
  const runtimeConfig = await runtime.json();
  if (runtimeConfig.apiBaseUrl !== "/api" || /localhost|127\.\d+\.\d+\.\d+|10\.0\.2\.2/i.test(JSON.stringify(runtimeConfig)))
    throw new Error("Runtime config is not remote-safe");
  const signup = await fetch(`${publicOrigin}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-client": "browser" }, body: "{}" });
  if (![400, 422].includes(signup.status)) throw new Error(`Auth endpoint returned HTTP ${signup.status}`);
  externalReachable = true;
} catch (error) {
  console.warn(`\nPreview hostname was issued, but this machine could not verify it externally: ${error.message}`);
  console.warn("Try the printed URL from a separate network/device; DNS or egress restrictions may affect the developer machine.\n");
}

console.log(`\n1QR PREVIEW READY${externalReachable ? " · REMOTE SAFE" : " · external verification unavailable"}:\n\nPublic web: ${publicOrigin}\nAPI: ${publicOrigin}/api\nAuth: ${externalReachable ? "REMOTE SAFE" : "UNVERIFIED"}\nQR: ${publicOrigin}/q/<publicId>\nLoopback public URLs: ${externalReachable ? "NONE" : "UNVERIFIED"}\n\nQuick Tunnel order status uses the existing polling fallback. Do not print this temporary QR for production use.\nPress Ctrl-C to stop the tunnel and local services.\n`);
await new Promise((resolve) => tunnel.on("close", resolve));
stop();
