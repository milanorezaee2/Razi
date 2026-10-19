import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const baseRequire = createRequire(import.meta.url);

const source = fs.readFileSync("src/lib/data/leads.ts", "utf8");

function loadStore(tempDirectory) {
  const previousCwd = process.cwd();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.chdir(tempDirectory);
  process.env.NODE_ENV = "test";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const exports = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("exports", "require", compiled)(exports, (name) => {
    if (name === "server-only") return {};
    return baseRequire(name);
  });

  return {
    store: exports,
    cleanup() {
      process.chdir(previousCwd);
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousRedisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = previousRedisUrl;
      if (previousRedisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = previousRedisToken;
    },
  };
}

test("contact leads persist, concurrent repeats dedupe, and newsletter opt-ins are unique and reversible", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "razi-leads-test-"));
  const { store, cleanup } = loadStore(tempDirectory);
  try {
    assert.equal(store.leadStoreBackendName(), "file");
    const createdAt = new Date().toISOString();
    const contact = {
      id: "REQ-TEST-1",
      kind: "contact",
      name: "Ari Example",
      email: "ari@example.com",
      phone: "+32 2 555 0100",
      projectType: "Interior",
      message: "Please contact me about a project.",
      locale: "en",
      consentAt: createdAt,
      createdAt,
    };

    const results = await Promise.all([
      store.createContactLead(contact),
      store.createContactLead({ ...contact, id: "REQ-TEST-2" }),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => !result.created).length, 1);
    assert.equal(results[0].lead.id, results[1].lead.id);
    assert.equal((await store.getContactLeads()).length, 1);

    const updated = await store.setContactLeadStatus(results[0].lead.id, "read");
    assert.equal(updated.status, "read");
    assert.equal((await store.getContactLeads())[0].status, "read");

    const firstAt = new Date().toISOString();
    const first = await store.subscribeNewsletter({ email: "news@example.com", locale: "en", consentAt: firstAt, updatedAt: firstAt });
    const secondAt = new Date(Date.now() + 1000).toISOString();
    const repeated = await store.subscribeNewsletter({ email: "NEWS@example.com", locale: "fa", consentAt: secondAt, updatedAt: secondAt });
    assert.equal(first.created, true);
    assert.equal(repeated.created, false);
    assert.equal(repeated.alreadyActive, true);
    assert.equal((await store.getNewsletterSubscribers()).length, 1);
    assert.equal((await store.getNewsletterSubscribers())[0].email, "news@example.com");

    const unsubscribed = await store.setNewsletterStatus("NEWS@example.com", "unsubscribed");
    assert.equal(unsubscribed.status, "unsubscribed");
    const resubscribed = await store.subscribeNewsletter({ email: "news@example.com", locale: "en", consentAt: secondAt, updatedAt: secondAt });
    assert.equal(resubscribed.created, false);
    assert.equal(resubscribed.alreadyActive, false);
    assert.equal(resubscribed.subscriber.status, "active");

    assert.ok(fs.existsSync(path.join(tempDirectory, "data", "contact-leads.json")));
    assert.ok(fs.existsSync(path.join(tempDirectory, "data", "newsletter-subscribers.json")));
  } finally {
    cleanup();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
