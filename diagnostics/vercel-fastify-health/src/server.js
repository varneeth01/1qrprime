import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/", async () => ({ hello: "world" }));
fastify.get("/api/health", async () => ({ ok: true }));

fastify.listen({ port: 3000 });
