export async function api(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-order-token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Connection failed");
  return data;
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );
export const label = (s: string) => s.replaceAll("_", " ");
export type Any = Record<string, any>;
