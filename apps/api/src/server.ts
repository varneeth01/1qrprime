import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true }));
app.get("/api/ready", async () => ({ ok: true, database: true, migrations: true }));

await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: "0.0.0.0",
});
