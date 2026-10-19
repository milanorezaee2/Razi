import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/*
 * Serialize operations that can add or remove a product-family reference.
 * Upload-session creation, upload completion, and admin taxonomy writes share
 * this lock so an open upload cannot slip in during a deletion check. The
 * process queue is supplemented by Redis (when configured) or an exclusive file
 * lock, so separate Node workers use the same critical section too.
 */
const REDIS_LOCK_KEY = "rosie-atelier:product-families:write-lock";
const LEASE_MS = 90_000;
const LOCK_WAIT_MS = 15_000;
const FILE_LOCK = path.join(process.cwd(), "data", ".product-family.lock");
const FILE_LOCK_STALE_MS = 5 * 60_000;
let queue: Promise<unknown> = Promise.resolve();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as NodeJS.ErrnoException).code === code;
}

async function redisCommand(args: string[]): Promise<unknown> {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`product_family_lock_redis_${response.status}`);
  const body = await response.json() as { result?: unknown };
  return body.result;
}

async function withRedisLock<T>(operation: () => Promise<T>): Promise<T> {
  const token = `${process.pid}:${crypto.randomUUID()}`;
  const startedAt = Date.now();
  while (true) {
    const result = await redisCommand(["SET", REDIS_LOCK_KEY, token, "NX", "PX", String(LEASE_MS)]);
    if (result === "OK") break;
    if (Date.now() - startedAt >= LOCK_WAIT_MS) throw new Error("product_family_lock_timeout");
    await wait(25 + Math.floor(Math.random() * 40));
  }

  try {
    return await operation();
  } finally {
    const releaseScript = [
      "if redis.call('GET', KEYS[1]) == ARGV[1] then",
      "  return redis.call('DEL', KEYS[1])",
      "end",
      "return 0",
    ].join("\n");
    await redisCommand(["EVAL", releaseScript, "1", REDIS_LOCK_KEY, token]).catch(() => undefined);
  }
}

async function withFileLock<T>(operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(FILE_LOCK), { recursive: true });
  const startedAt = Date.now();
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  const owner = `${process.pid}:${Date.now()}:${crypto.randomBytes(6).toString("hex")}`;

  while (!handle) {
    try {
      handle = await fs.open(FILE_LOCK, "wx");
      await handle.writeFile(owner, "utf8");
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
        handle = null;
        await fs.unlink(FILE_LOCK).catch(() => undefined);
        throw error;
      }
      if (!isErrorCode(error, "EEXIST")) throw error;

      try {
        const [stat, currentOwner] = await Promise.all([
          fs.stat(FILE_LOCK),
          fs.readFile(FILE_LOCK, "utf8").catch(() => ""),
        ]);
        const ownerPid = Number(currentOwner.split(":", 1)[0]);
        let ownerAlive = false;
        if (Number.isInteger(ownerPid) && ownerPid > 0) {
          try {
            process.kill(ownerPid, 0);
            ownerAlive = true;
          } catch (probeError) {
            ownerAlive = (probeError as NodeJS.ErrnoException).code === "EPERM";
          }
        }
        if (!ownerAlive && Date.now() - stat.mtimeMs > FILE_LOCK_STALE_MS) {
          await fs.unlink(FILE_LOCK).catch(() => undefined);
          continue;
        }
      } catch (error) {
        if (isErrorCode(error, "ENOENT")) continue;
        throw error;
      }

      if (Date.now() - startedAt >= LOCK_WAIT_MS) throw new Error("product_family_lock_timeout");
      await wait(25 + Math.floor(Math.random() * 40));
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    const currentOwner = await fs.readFile(FILE_LOCK, "utf8").catch(() => "");
    if (currentOwner === owner) await fs.unlink(FILE_LOCK).catch(() => undefined);
  }
}

function withSharedLock<T>(operation: () => Promise<T>): Promise<T> {
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? withRedisLock(operation)
    : withFileLock(operation);
}

export function withProductFamilyLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(() => withSharedLock(operation), () => withSharedLock(operation));
  queue = result.catch(() => undefined);
  return result;
}
