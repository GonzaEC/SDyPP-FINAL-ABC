import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import net from "node:net";

type Status = "healthy" | "unreachable";

// TCP check sin dependencias nuevas: verifica que el host/puerto acepta
// conexiones. Suficiente para reportar "alcanzable/inaccesible" sin protocolo.
async function checkTcp(host: string, port: number, timeoutMs = 3000): Promise<Status> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok ? "healthy" : "unreachable");
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}

async function checkHttp(url: string, timeoutMs = 3000): Promise<Status> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res.ok ? "healthy" : "unreachable";
    } finally {
      clearTimeout(id);
    }
  } catch {
    return "unreachable";
  }
}

async function checkPostgres(): Promise<Status> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "healthy";
  } catch {
    return "unreachable";
  }
}

export async function GET() {
  const nctUrl = process.env.NCT_URL;
  const isNctMock = !nctUrl || nctUrl === "mock";
  const redisHost = process.env.REDIS_HOST || "redis";
  const rabbitHost = process.env.RABBITMQ_HOST || "rabbitmq";

  const [nct, postgres, redis, rabbitmq] = await Promise.all([
    isNctMock ? Promise.resolve("mock" as Status) : checkHttp(`${nctUrl}/status`),
    checkPostgres(),
    checkTcp(redisHost, 6379),
    checkTcp(rabbitHost, 5671), // RabbitMQ es TLS-only en 5671
  ]);

  return NextResponse.json({
    frontend: "healthy" as const,
    nct,
    postgres,
    redis,
    rabbitmq,
    gpu_workers: "cluster externo (profesor)",
    timestamp: new Date().toISOString(),
  });
}