/** Keep server-side payment contact normalization aligned with the clients. */
export function normalizeCustomerPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()\-]/g, "");
  if (/^\+91[6-9]\d{9}$/.test(compact)) return compact;
  if (/^91[6-9]\d{9}$/.test(compact)) return `+${compact}`;
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`;
  return null;
}
