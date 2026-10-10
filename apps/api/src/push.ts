import type { AsyncDatabase } from "./async-db.js";
import { NotificationRepository } from "./repositories/notification-repository.js";

/** Process one bounded batch from a Vercel Cron/function invocation. */
export async function processPushOutbox(db: AsyncDatabase, log: { error: Function }) {
  const notifications = new NotificationRepository(db);
  const jobs = await notifications.pending(10);
  for (const job of jobs) {
    try {
      const tokens = job.recipient_user_id
        ? await db.all<any>("SELECT DISTINCT p.token FROM push_tokens p WHERE p.user_id=? AND p.enabled=TRUE", [job.recipient_user_id])
        : await db.all<any>(
          "SELECT DISTINCT p.token FROM push_tokens p JOIN memberships m ON m.user_id=p.user_id JOIN locations l ON l.tenant_id=m.tenant_id WHERE l.id=? AND p.enabled=TRUE",
          [job.location_id],
        );
      if (!tokens.length) {
        await notifications.markDelivered(db, job.id);
        continue;
      }
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(tokens.map((token) => ({
          to: token.token,
          title: job.title,
          body: job.body,
          sound: "default",
          data: { locationId: job.location_id, notificationId: job.id },
        }))),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Push delivery failed");
      const result = await response.json() as any;
      let retry = !Array.isArray(result.data) || result.data.length !== tokens.length;
      for (const [index, ticket] of (result.data || []).entries()) {
        if (ticket.status !== "error") continue;
        if (ticket.details?.error === "DeviceNotRegistered")
          await db.run("DELETE FROM push_tokens WHERE token=?", [tokens[index].token]);
        else retry = true;
      }
      if (retry) await notifications.markFailed(db, job.id);
      else await notifications.markDelivered(db, job.id);
    } catch (error) {
      await notifications.markFailed(db, job.id);
      log.error({ err: error }, "Push delivery failed; outbox retry retained");
    }
  }
}
