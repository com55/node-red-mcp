#!/usr/bin/env node
/**
 * Phase 0 smoke tests against a running local Node-RED harness.
 *
 * Verifies:
 * 1. GET /mcp without auth → 401
 * 2. GET /mcp with admin bearer → 200 HTML owner page
 * 3. GET /mcp/connect/test without auth → 200 markdown
 * 4. Flow deploy does not duplicate registration (registerCalls stays stable / routes still single)
 * 5. Optional restart check is left to the shell harness (process recycle)
 */

const BASE = (process.env.NODERED_URL || 'http://127.0.0.1:1880').replace(/\/+$/, '');
const USER = process.env.POC_ADMIN_USERNAME || 'poc-admin';
const PASS = process.env.POC_ADMIN_PASSWORD || 'poc-admin-pass';

/** @type {{ name: string, ok: boolean, detail?: string }[]} */
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getToken() {
  const res = await fetch(`${BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'node-red-admin',
      grant_type: 'password',
      scope: '*',
      username: USER,
      password: PASS,
    }),
  });
  if (!res.ok) {
    throw new Error(`auth/token failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function main() {
  // 1) Unauthenticated owner page
  {
    const res = await fetch(`${BASE}/mcp`, { redirect: 'manual' });
    const ok = res.status === 401;
    record('GET /mcp without auth returns 401', ok, `status=${res.status}`);
  }

  const token = await getToken();

  // 2) Authenticated owner page
  {
    const res = await fetch(`${BASE}/mcp`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.text();
    const ok =
      res.status === 200 &&
      body.includes('AI Access') &&
      body.includes('Phase 0') &&
      (body.includes(USER) || body.includes('authenticated'));
    record('GET /mcp with adminAuth returns owner HTML', ok, `status=${res.status}`);
  }

  // 3) Public connect guide
  {
    const res = await fetch(`${BASE}/mcp/connect/test`);
    const body = await res.text();
    const ct = res.headers.get('content-type') || '';
    const cache = res.headers.get('cache-control') || '';
    const ok =
      res.status === 200 &&
      ct.includes('markdown') &&
      body.includes('Connect Guide') &&
      cache.includes('no-store');
    record('GET /mcp/connect/test is public markdown', ok, `status=${res.status} ct=${ct}`);
  }

  // 4) Registration introspection before deploy
  let registerCallsBefore = null;
  {
    const res = await fetch(`${BASE}/mcp/poc/registration`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    registerCallsBefore = data.registrationState?.registerCalls ?? null;
    record(
      'GET /mcp/poc/registration reports single registration',
      res.status === 200 && registerCallsBefore === 1,
      JSON.stringify(data.registrationState)
    );
  }

  // 5) Trigger a full deploy (empty/default flows) and re-check
  {
    const flowsRes = await fetch(`${BASE}/flows`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Node-RED-API-Version': 'v2',
      },
    });
    const flowsPayload = await flowsRes.json();
    const deployRes = await fetch(`${BASE}/flows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Node-RED-API-Version': 'v2',
        'Node-RED-Deployment-Type': 'full',
      },
      body: JSON.stringify(flowsPayload),
    });
    record('POST /flows full deploy succeeded', deployRes.status === 200 || deployRes.status === 204, `status=${deployRes.status}`);

    // Give runtime a moment after deploy
    await new Promise(r => setTimeout(r, 500));

    const res = await fetch(`${BASE}/mcp/poc/registration`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const after = data.registrationState?.registerCalls ?? null;
    // Plugin onadd should NOT re-fire on flow deploy; registerCalls stays 1.
    record(
      'After flow deploy, registration still single (no duplicate onadd)',
      after === 1 && after === registerCallsBefore,
      `before=${registerCallsBefore} after=${after}`
    );
  }

  // 6) Routes still respond once after deploy
  {
    const owner = await fetch(`${BASE}/mcp`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const guide = await fetch(`${BASE}/mcp/connect/test`);
    record(
      'Routes still respond after deploy',
      owner.status === 200 && guide.status === 200,
      `owner=${owner.status} guide=${guide.status}`
    );
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
