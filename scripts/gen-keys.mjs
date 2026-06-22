#!/usr/bin/env node
// Generate ANON_KEY and SERVICE_ROLE_KEY JWTs for self-hosted Supabase.
// Usage:  JWT_SECRET="$(openssl rand -base64 48)" node scripts/gen-keys.mjs

import { createHmac } from "node:crypto";

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("ERROR: set JWT_SECRET env var first.");
  console.error('  e.g.  JWT_SECRET="$(openssl rand -base64 48)" node scripts/gen-keys.mjs');
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function sign(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10; // 10 years

const anon = sign({ role: "anon", iss: "supabase", iat, exp });
const service = sign({ role: "service_role", iss: "supabase", iat, exp });

console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${anon}`);
console.log(`SERVICE_ROLE_KEY=${service}`);