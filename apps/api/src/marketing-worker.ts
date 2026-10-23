import type { AsyncDatabase } from "./async-db.js";
import { MarketingRepository } from "./repositories/marketing-repository.js";
import type { WhatsAppProvider } from "./whatsapp.js";

type WorkerOptions = { batchSize?: number; maxAttempts?: number; paceMs?: number };

/** One bounded worker tick. HTTP requests never perform bulk delivery. */
export class MarketingWorker {
  constructor(private readonly db: AsyncDatabase, private readonly provider: WhatsAppProvider) {}

  async runOnce(options: WorkerOptions = {}) {
    const batchSize = Math.max(1, Math.min(100, options.batchSize ?? 20));
    const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    const paceMs = Math.max(0, options.paceMs ?? 100);
    const repository = new MarketingRepository(this.db);
    const jobs = await repository.claimDueJobs(10);
    const summary = { claimed: jobs.length, sent: 0, skipped: 0, failed: 0 };
    for (const job of jobs) {
      if (job.job_type !== "campaign_delivery" || !job.campaign_id) {
        await this.finishJob(job.id, "succeeded");
        continue;
      }
      try {
        const campaign = await this.db.get<any>("SELECT * FROM campaigns WHERE id=? AND tenant_id=?", [job.campaign_id, job.tenant_id]);
        if (!campaign || !campaign.template_id) {
          await this.finishJob(job.id, "failed", "Campaign template is missing");
          summary.failed++;
          continue;
        }
        const template = await this.db.get<any>("SELECT * FROM whatsapp_templates WHERE id=? AND tenant_id=?", [campaign.template_id, job.tenant_id]);
        if (!template || template.status !== "approved") {
          await this.finishJob(job.id, "failed", "Campaign template is not approved");
          summary.failed++;
          continue;
        }
        const recipients = await this.db.all<any>(
          "SELECT cr.*,c.phone_e164 AS current_phone FROM campaign_recipients cr JOIN campaigns ca ON ca.id=cr.campaign_id JOIN customers c ON c.id=cr.customer_id AND c.tenant_id=ca.tenant_id WHERE cr.campaign_id=? AND ca.tenant_id=? AND cr.status='queued' ORDER BY cr.created_at LIMIT ?",
          [campaign.id, job.tenant_id, batchSize],
        );
        if (!recipients.length) {
          await this.db.run("UPDATE campaigns SET status='sent',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?", [campaign.id, job.tenant_id]);
          await this.finishJob(job.id, "succeeded");
          continue;
        }
        for (const recipient of recipients) {
          const consent = await this.db.get<any>("SELECT status FROM customer_consents WHERE tenant_id=? AND customer_id=? AND channel='whatsapp' AND purpose='marketing'", [job.tenant_id, recipient.customer_id]);
          if (consent?.status !== "opted_in") {
            await this.db.run("UPDATE campaign_recipients SET status='skipped',failure_code='OPTED_OUT' WHERE id=? AND status='queued'", [recipient.id]);
            summary.skipped++;
            continue;
          }
          const sent = await this.provider.sendTemplate({ to: recipient.current_phone, templateName: template.name, language: template.language });
          await this.db.run("UPDATE campaign_recipients SET status='sent',provider_message_id=?,sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'", [sent.providerMessageId, recipient.id]);
          summary.sent++;
          if (paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs));
        }
        const remaining = await this.db.get<any>("SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id=? AND status='queued'", [campaign.id]);
        await this.db.run("UPDATE campaigns SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?", [Number(remaining?.count || 0) ? "sending" : "sent", campaign.id, job.tenant_id]);
        if (Number(remaining?.count || 0)) await this.db.run("UPDATE marketing_jobs SET status='queued',available_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'", [new Date(Date.now() + paceMs).toISOString(), job.id]);
        else await this.finishJob(job.id, "succeeded");
      } catch (error: any) {
        const attempts = Number(job.attempts || 1);
        if (attempts < maxAttempts) {
          await this.db.run("UPDATE marketing_jobs SET status='queued',available_at=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'", [new Date(Date.now() + Math.min(300000, 1000 * 2 ** attempts)).toISOString(), String(error?.message || "delivery failed").slice(0, 500), job.id]);
        } else {
          await this.finishJob(job.id, "failed", String(error?.message || "delivery failed").slice(0, 500));
          summary.failed++;
        }
      }
    }
    return summary;
  }

  private finishJob(id: string, status: "succeeded" | "failed", lastError?: string) {
    return this.db.run("UPDATE marketing_jobs SET status=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'", [status, lastError || null, id]);
  }
}
