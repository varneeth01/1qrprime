import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppTemplateMessage = {
  to: string;
  templateName: string;
  language: string;
  parameters?: string[];
};

export type WhatsAppWebhookEvent = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  failureCode?: string;
};

export interface WhatsAppProvider {
  sendTemplate(message: WhatsAppTemplateMessage): Promise<{ providerMessageId: string }>;
  getTemplateStatus(providerTemplateId: string): Promise<string>;
  getMessageStatus(providerMessageId: string): Promise<string>;
  normalizeWebhook(payload: unknown): WhatsAppWebhookEvent[];
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
}

function webhookEvents(payload: any): WhatsAppWebhookEvent[] {
  const events: WhatsAppWebhookEvent[] = [];
  for (const entry of payload?.entry || []) for (const change of entry.changes || []) for (const status of change.value?.statuses || []) {
    const mapped = status.status === "sent" || status.status === "delivered" || status.status === "read" || status.status === "failed" ? status.status : undefined;
    if (mapped && typeof status.id === "string") events.push({ providerMessageId: status.id, status: mapped, failureCode: status.errors?.[0]?.code ? String(status.errors[0].code) : undefined });
  }
  return events;
}

/**
 * Deliberately does not pretend to send. A real Meta Cloud API adapter can be
 * plugged in once a merchant sender is connected and credentials are stored
 * through a secrets manager.
 */
export class UnconfiguredWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(_message: WhatsAppTemplateMessage): Promise<{ providerMessageId: string }> {
    throw Object.assign(new Error("Connect WhatsApp to start campaigns"), { statusCode: 503, appCode: "WHATSAPP_NOT_CONFIGURED" });
  }
  async getTemplateStatus(): Promise<string> { return "pending"; }
  async getMessageStatus(): Promise<string> { return "unknown"; }
  normalizeWebhook(payload: unknown) { return webhookEvents(payload); }
  verifyWebhook() { return false; }
}

/** Explicit local/test adapter. It never contacts a provider. */
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(message: WhatsAppTemplateMessage) {
    return { providerMessageId: `mock-${Buffer.from(`${message.templateName}:${message.to}`).toString("hex").slice(0, 24)}` };
  }
  async getTemplateStatus() { return "approved"; }
  async getMessageStatus() { return "sent"; }
  normalizeWebhook(payload: unknown) { return webhookEvents(payload); }
  verifyWebhook() { return true; }
}

export class MetaWhatsAppCloudProvider implements WhatsAppProvider {
  private readonly graphOrigin = "https://graph.facebook.com/v23.0";
  constructor(private readonly config: { accessToken: string; phoneNumberId: string; businessAccountId: string; appSecret: string }) {}
  private async graph(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.graphOrigin}${path}`, { ...init, headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error("WhatsApp provider request failed"), { statusCode: 502, appCode: "WHATSAPP_PROVIDER_ERROR", providerStatus: response.status });
    return body;
  }
  async sendTemplate(message: WhatsAppTemplateMessage) {
    const body = await this.graph(`/${this.config.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", to: message.to, type: "template", template: { name: message.templateName, language: { code: message.language }, ...(message.parameters?.length ? { components: [{ type: "body", parameters: message.parameters.map((text) => ({ type: "text", text })) }] } : {}) } }) });
    return { providerMessageId: String(body.messages?.[0]?.id || "") };
  }
  async getTemplateStatus(providerTemplateId: string) {
    const body = await this.graph(`/${this.config.businessAccountId}/message_templates?fields=id,name,status&ids=${encodeURIComponent(providerTemplateId)}`);
    return String(body.data?.[0]?.status || "UNKNOWN").toLowerCase();
  }
  async getMessageStatus(providerMessageId: string) {
    const body = await this.graph(`/${encodeURIComponent(providerMessageId)}?fields=status`);
    return String(body.status || "unknown").toLowerCase();
  }
  normalizeWebhook(payload: unknown) { return webhookEvents(payload); }
  verifyWebhook(rawBody: string, signature: string | undefined) {
    if (!signature?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", this.config.appSecret).update(rawBody).digest("hex");
    const actual = signature.slice("sha256=".length);
    if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
  }
}

export function createWhatsAppProvider(config: { NODE_ENV?: string; WHATSAPP_PROVIDER: string; WHATSAPP_ACCESS_TOKEN?: string; WHATSAPP_PHONE_NUMBER_ID?: string; WHATSAPP_BUSINESS_ACCOUNT_ID?: string; WHATSAPP_APP_SECRET?: string }): WhatsAppProvider {
  if (config.WHATSAPP_PROVIDER === "mock" && config.NODE_ENV === "test") return new MockWhatsAppProvider();
  if (config.WHATSAPP_PROVIDER === "meta_cloud_api" && config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_BUSINESS_ACCOUNT_ID && config.WHATSAPP_APP_SECRET) return new MetaWhatsAppCloudProvider({ accessToken: config.WHATSAPP_ACCESS_TOKEN, phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID, businessAccountId: config.WHATSAPP_BUSINESS_ACCOUNT_ID, appSecret: config.WHATSAPP_APP_SECRET });
  return new UnconfiguredWhatsAppProvider();
}
