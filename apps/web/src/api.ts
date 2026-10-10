export type Any = Record<string, any>;
import { userFacingError, type AppErrorPayload } from "../../../shared/app-errors";

export class ApiError extends Error {
  status: number;
  data: Any;

  constructor(message: string, status: number, data: Any = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }

  get code() { return this.data?.code as string | undefined; }
}

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

  const raw = await res.text();
  let data: Any = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw };
    }
  }

  if (!res.ok) {
    const contextual = path.startsWith("/billing/checkout/order") && [404, 500, 502, 503].includes(res.status)
      ? { ...data, code: "PAYMENT_UNAVAILABLE" }
      : path.startsWith("/billing/checkout/verify") && [400, 404, 500, 502, 503].includes(res.status)
        ? { ...data, code: "PAYMENT_VERIFICATION_FAILED" }
        : data;
    throw new ApiError(userFacingError(res.status, contextual as AppErrorPayload), res.status, contextual);
  }
  return data;
}

export async function updateLocation(
  locationId: string,
  body: Any,
) {
  try {
    return await api(`/locations/${locationId}`, "PUT", body);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 409 ||
      error.data?.error !== "Profile changed elsewhere. Refresh before saving." ||
      typeof body?.version !== "number"
    )
      throw error;

    // The dashboard can retain a location snapshot for a moment after another
    // successful save. Refresh once, preserve server-side profile fields that
    // this form does not own, then retry with the current optimistic-lock version.
    const latest = await api(`/locations/${locationId}`);
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

    return api(`/locations/${locationId}`, "PUT", {
      ...body,
      version: latest.version,
      ...(mergedProfile ? { profile: mergedProfile } : {}),
    });
  }
}

export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );

export const label = (s: string) => s.replaceAll("_", " ");
