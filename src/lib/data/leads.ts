import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type ContactLeadKind = "b2b" | "custom" | "contact" | "creator";
export type ContactLeadStatus = "new" | "read" | "archived";
export type NewsletterStatus = "active" | "unsubscribed";

/** A private inquiry captured from one of the public contact forms. */
export interface ContactLead {
  id: string;
  kind: ContactLeadKind;
  name: string;
  email: string;
  phone?: string;
  projectType?: string;
  message: string;
  locale: "fa" | "en";
  consentAt: string;
  createdAt: string;
  status: ContactLeadStatus;
  /** Internal, short-lived duplicate detector; never returned to the browser. */
  dedupeKey: string;
}

/** Newsletter opt-ins are separate from contact inquiries and are unique by normalized e-mail. */
export interface NewsletterSubscriber {
  email: string;
  locale: "fa" | "en";
  status: NewsletterStatus;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
}

export function leadStoreBackendName(): "redis" | "file" {
  return process.env.NODE_ENV === "production"
    && Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? "redis"
    : "file";
}

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "contact-leads.json");
const NEWSLETTER_FILE = path.join(DATA_DIR, "newsletter-subscribers.json");
const CONTACT_KEY = "rosie-atelier:contact-leads";
const NEWSLETTER_KEY = "rosie-atelier:newsletter-subscribers";
const LOCK_WAIT_MS = 5_000;
const LOCK_STALE_MS = 5 * 60_000;
const DEDUPE_WINDOW_MS = 10 * 60_000;

const ADD_CONTACT_LUA = `
local rows = cjson.decode(redis.call('GET', KEYS[1]) or '[]')
local cutoff = ARGV[2]
for _, row in ipairs(rows) do
  if row.dedupeKey == ARGV[1] and tostring(row.createdAt or '') >= cutoff then
    return cjson.encode({ created = false, lead = row })
  end
end
local lead = cjson.decode(ARGV[3])
table.insert(rows, lead)
redis.call('SET', KEYS[1], cjson.encode(rows))
return cjson.encode({ created = true, lead = lead })
`;

const UPSERT_NEWSLETTER_LUA = `
local rows = cjson.decode(redis.call('GET', KEYS[1]) or '[]')
local input = cjson.decode(ARGV[1])
local email = string.lower(tostring(input.email or ''))
for index, row in ipairs(rows) do
  if string.lower(tostring(row.email or '')) == email then
    local wasActive = row.status == 'active'
    row.status = 'active'
    row.locale = input.locale
    row.consentAt = input.consentAt
    row.updatedAt = input.updatedAt
    redis.call('SET', KEYS[1], cjson.encode(rows))
    return cjson.encode({ created = false, alreadyActive = wasActive, subscriber = row })
  end
end
table.insert(rows, input)
redis.call('SET', KEYS[1], cjson.encode(rows))
return cjson.encode({ created = true, alreadyActive = false, subscriber = input })
`;

const UPDATE_CONTACT_STATUS_LUA = `
local rows = cjson.decode(redis.call('GET', KEYS[1]) or '[]')
for _, row in ipairs(rows) do
  if row.id == ARGV[1] then
    row.status = ARGV[2]
    redis.call('SET', KEYS[1], cjson.encode(rows))
    return cjson.encode(row)
  end
end
return ''
`;

const UPDATE_NEWSLETTER_STATUS_LUA = `
local rows = cjson.decode(redis.call('GET', KEYS[1]) or '[]')
for _, row in ipairs(rows) do
  if string.lower(tostring(row.email or '')) == string.lower(ARGV[1]) then
    row.status = ARGV[2]
    row.updatedAt = ARGV[3]
    redis.call('SET', KEYS[1], cjson.encode(rows))
    return cjson.encode(row)
  end
end
return ''
`;

async function redisCmd(args: string[]) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`redis ${response.status}`);
  return await response.json() as { result: unknown };
}

function parseArray<T>(raw: unknown, label: string): T[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== "string") throw new Error(`invalid_${label}_store`);
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error("not_array");
    return value as T[];
  } catch {
    throw new Error(`invalid_${label}_store`);
  }
}

async function readFileArray<T>(filePath: string, label: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseArray<T>(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeFileArray<T>(filePath: string, value: T[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let lock: Awaited<ReturnType<typeof fs.open>> | null = null;

  while (!lock) {
    try {
      const opened = await fs.open(lockPath, "wx");
      try {
        await opened.writeFile(`${process.pid}:${Date.now()}`);
        lock = opened;
      } catch (error) {
        await opened.close().catch(() => undefined);
        await fs.unlink(lockPath).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.unlink(lockPath).catch(() => undefined);
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() >= deadline) throw new Error("lead_store_busy");
      await new Promise<void>((resolve) => setTimeout(resolve, 25 + Math.random() * 50));
    }
  }

  try {
    return await operation();
  } finally {
    await lock.close().catch(() => undefined);
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

function makeDedupeKey(lead: Pick<ContactLead, "kind" | "name" | "email" | "phone" | "projectType" | "message">) {
  return crypto.createHash("sha256")
    .update([lead.kind, lead.name.toLowerCase(), lead.email, lead.phone ?? "", lead.projectType ?? "", lead.message]
      .join("\u0000"))
    .digest("hex");
}

export async function createContactLead(input: Omit<ContactLead, "dedupeKey" | "status">): Promise<{ lead: ContactLead; created: boolean }> {
  const lead: ContactLead = { ...input, status: "new", dedupeKey: makeDedupeKey(input) };
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  if (leadStoreBackendName() === "redis") {
    const { result } = await redisCmd(["EVAL", ADD_CONTACT_LUA, "1", CONTACT_KEY, lead.dedupeKey, cutoff, JSON.stringify(lead)]);
    if (typeof result !== "string") throw new Error("invalid_contact_insert_response");
    try {
      return JSON.parse(result) as { lead: ContactLead; created: boolean };
    } catch {
      throw new Error("invalid_contact_insert_response");
    }
  }

  return withFileLock(LEADS_FILE, async () => {
    const rows = await readFileArray<ContactLead>(LEADS_FILE, "contact_leads");
    const previous = rows.find((row) => row.dedupeKey === lead.dedupeKey && row.createdAt >= cutoff);
    if (previous) return { lead: previous, created: false };
    rows.push(lead);
    await writeFileArray(LEADS_FILE, rows);
    return { lead, created: true };
  });
}

export async function getContactLeads(): Promise<ContactLead[]> {
  if (leadStoreBackendName() === "redis") {
    const { result } = await redisCmd(["GET", CONTACT_KEY]);
    return parseArray<ContactLead>(result, "contact_leads");
  }
  return readFileArray<ContactLead>(LEADS_FILE, "contact_leads");
}

export async function setContactLeadStatus(id: string, status: ContactLeadStatus): Promise<ContactLead | null> {
  if (leadStoreBackendName() === "redis") {
    const { result } = await redisCmd(["EVAL", UPDATE_CONTACT_STATUS_LUA, "1", CONTACT_KEY, id, status]);
    if (result === "") return null;
    if (typeof result !== "string") throw new Error("invalid_contact_update_response");
    try { return JSON.parse(result) as ContactLead; } catch { throw new Error("invalid_contact_update_response"); }
  }

  return withFileLock(LEADS_FILE, async () => {
    const rows = await readFileArray<ContactLead>(LEADS_FILE, "contact_leads");
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    const updated = { ...rows[index], status };
    rows[index] = updated;
    await writeFileArray(LEADS_FILE, rows);
    return updated;
  });
}

export async function subscribeNewsletter(input: Omit<NewsletterSubscriber, "status" | "createdAt">): Promise<{ subscriber: NewsletterSubscriber; created: boolean; alreadyActive: boolean }> {
  const subscriber: NewsletterSubscriber = {
    ...input,
    status: "active",
    createdAt: input.updatedAt,
  };

  if (leadStoreBackendName() === "redis") {
    const { result } = await redisCmd(["EVAL", UPSERT_NEWSLETTER_LUA, "1", NEWSLETTER_KEY, JSON.stringify(subscriber)]);
    if (typeof result !== "string") throw new Error("invalid_newsletter_response");
    try {
      return JSON.parse(result) as { subscriber: NewsletterSubscriber; created: boolean; alreadyActive: boolean };
    } catch {
      throw new Error("invalid_newsletter_response");
    }
  }

  return withFileLock(NEWSLETTER_FILE, async () => {
    const rows = await readFileArray<NewsletterSubscriber>(NEWSLETTER_FILE, "newsletter");
    const index = rows.findIndex((row) => row.email.toLowerCase() === subscriber.email.toLowerCase());
    if (index >= 0) {
      const wasActive = rows[index].status === "active";
      const updated = { ...rows[index], locale: subscriber.locale, consentAt: subscriber.consentAt, updatedAt: subscriber.updatedAt, status: "active" as const };
      rows[index] = updated;
      await writeFileArray(NEWSLETTER_FILE, rows);
      return { subscriber: updated, created: false, alreadyActive: wasActive };
    }
    rows.push(subscriber);
    await writeFileArray(NEWSLETTER_FILE, rows);
    return { subscriber, created: true, alreadyActive: false };
  });
}

export async function getNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  if (leadStoreBackendName() === "redis") {
    const { result } = await redisCmd(["GET", NEWSLETTER_KEY]);
    return parseArray<NewsletterSubscriber>(result, "newsletter");
  }
  return readFileArray<NewsletterSubscriber>(NEWSLETTER_FILE, "newsletter");
}

export async function setNewsletterStatus(email: string, status: NewsletterStatus): Promise<NewsletterSubscriber | null> {
  const updatedAt = new Date().toISOString();
  if (leadStoreBackendName() === "redis") {
    const { result } = await redisCmd(["EVAL", UPDATE_NEWSLETTER_STATUS_LUA, "1", NEWSLETTER_KEY, email, status, updatedAt]);
    if (result === "") return null;
    if (typeof result !== "string") throw new Error("invalid_newsletter_update_response");
    try { return JSON.parse(result) as NewsletterSubscriber; } catch { throw new Error("invalid_newsletter_update_response"); }
  }

  return withFileLock(NEWSLETTER_FILE, async () => {
    const rows = await readFileArray<NewsletterSubscriber>(NEWSLETTER_FILE, "newsletter");
    const index = rows.findIndex((row) => row.email.toLowerCase() === email.toLowerCase());
    if (index < 0) return null;
    const updated = { ...rows[index], status, updatedAt };
    rows[index] = updated;
    await writeFileArray(NEWSLETTER_FILE, rows);
    return updated;
  });
}

export function newLeadId() {
  return `REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function contactDedupeKeyFor(input: Pick<ContactLead, "kind" | "name" | "email" | "phone" | "projectType" | "message">) {
  return makeDedupeKey(input);
}
