# ADR 015 — AI Access Phase 0: Investigation & Embedded PoC

**Status:** Proposed (Phase 0 complete when PoC verified)  
**Date:** 2026-10-15  
**Context:** Product spec v0.1 for Node-RED AI Access (`/mcp` owner UI, temporary grants, REST adapter, later native MCP).

## Decision summary

1. **Feasible:** Ship AI Access as a Node-RED **plugin** (`package.json` → `node-red.plugins`), not a custom flow node.
2. **Owner routes** mount on `RED.httpAdmin` and use `RED.auth.needsPermission(...)`.
3. **Public grant/connect/API routes** mount on `RED.httpNode` (no admin session required; grant bearer auth later).
4. **Share a transport-agnostic core** between today's standalone MCP server and the future embedded REST/MCP adapters.
5. **Preserve** fork-local `deploy_nodes` / `deployModifiedNodes` and `MCP_READ_ONLY`.

## Current repository findings

| Area | Finding |
|------|---------|
| Role today | Standalone MCP server (stdio and/or HTTP Express), talks to Node-RED **Admin API** over HTTP |
| Admin client | `src/services/nodered-api.ts` (`NodeRedAPIClient`) — axios, circuit breaker, retries |
| Auth to Node-RED | Bearer token (`NODERED_API_TOKEN`) or username/password exchanged via `POST /auth/token` (`resolveNodeRedAuthHeader`) |
| MCP surface | `src/server/mcp-server.ts` — tools/resources/prompts; HTTP/SSE in `express-app.ts` |
| Fork deltas to keep | `deploy_nodes` → `deployModifiedNodes` (v2 + `Node-RED-Deployment-Type: nodes`); `getRuntimeInfo` via `/diagnostics`; `MCP_READ_ONLY` |
| Not present | No Node-RED plugin/package, no `/mcp` owner UI, no grant store, no proposal workflow |

### Tool inventory (high level)

Read-ish: `get_flows`, `get_flow`, `search_flows`, `semantic_search_flows`, `get_context`, `get_node_errors`, `get_flow_state`, `get_settings`, `get_runtime_info`, `get_installed_modules`, `search_modules`, `validate_flow`.

Write-ish: `create_flow`, `update_flow`, `deploy_nodes` (**fork**), `enable_flow`, `disable_flow`, `delete_flow`, `set_context`, `delete_context`, `install_module`.

## Packaging decision

### Option A — Node-RED plugin (chosen for embedded path)

- Loads once via `RED.plugins.registerPlugin(..., { onadd })`.
- Survives flow deploy without re-binding routes (unlike node `registerType` constructors).
- Matches FlowFuse `nr-assistant` pattern (`httpAdmin` + `needsPermission`).

### Option B — Config/custom node

- Re-runs on deploy → duplicate route risk unless global guards + careful teardown.
- Rejected for HTTP surface; may still be used later only for editor UI chrome if needed.

### Option C — Sidecar only (current MCP process)

- Keep for standalone MCP compatibility.
- Insufficient alone for in-editor `/mcp` owner UX inside each AMERRU instance.

**Hybrid:** core library + (1) existing MCP/Express adapter + (2) Node-RED plugin adapter.

## Recommended architecture (core vs adapters)

```text
                    ┌─────────────────────────────┐
                    │  @scope/nodered-ai-core     │
                    │  - NodeRedAdminPort         │
                    │  - GrantStore / ProposalStore│
                    │  - Scope policy             │
                    │  - Flow sanitize / rev ops  │
                    │  - deployModifiedNodes etc. │
                    └─────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
   MCP Tool Adapter        REST HTTP Adapter       Future /mcp/rpc
   (existing server)       (plugin httpNode)       (Streamable HTTP)
          │                       │
          └───────────┬───────────┘
                      ▼
            Node-RED Admin API (v2)
```

### Refactor direction (incremental, not big-bang)

1. Extract `NodeRedAPIClient` + error/auth helpers behind a `NodeRedAdminPort` interface.
2. Keep `McpNodeRedServer` as an adapter calling the port (behavior unchanged; `deploy_nodes` stays).
3. New plugin adapter owns Express routes, grant middleware, Markdown guide, OpenAPI filter.
4. Embedded mode may call Admin API **in-process** later; Phase 1 can still use HTTP loopback to keep one code path.

### Route mounting rules

| Surface | Express app | Auth |
|---------|-------------|------|
| `/mcp` owner UI + `/mcp/admin/*` | `RED.httpAdmin` | `adminAuth` + permission + CSRF (Phase 2+) |
| `/mcp/connect/:secret`, `/mcp/api/v1/*` | `RED.httpNode` | Grant bearer (hashed at rest) |
| `/mcp/rpc` (later) | Prefer `httpNode` or dedicated mount | MCP auth |

Honor `httpAdminRoot` / `httpNodeRoot` / proxy prefix; derive public links from `PUBLIC_BASE_URL`.

**PoC observation:** when `httpAdminRoot=/admin`, owner + `/auth/token` move under `/admin/*` while `httpNode` public routes stay on `httpNodeRoot` (often `/`). UI and generated guides must never hard-code unprefixed `/mcp` if the instance uses a non-root admin path.

## Security notes from Phase 0

- `RED.httpAdmin` routes are **not** automatically safe without `needsPermission` (or equivalent) — always attach it.
- Public connect URLs are capability credentials; PoC sets `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`.
- Do not log raw `/mcp/connect/:secret` paths or `Authorization` headers.
- Instance isolation is an AMERRU deployment property (per-instance volume + network), not something the grant token can invent.

## Risks

1. **Dual packaging** — npm package consumed both as Node-RED plugin and as standalone MCP dependency; build/export matrix can drift.
2. **httpAdminRoot vs public URL** — owner page path may be prefixed while AI connect URL stays on `httpNodeRoot`; docs/UI must show the correct absolute URLs.
3. **In-process Admin API** — calling internal runtime APIs vs HTTP Admin API may diverge (rev headers, deploy types); prefer one path.
4. **Upstream sync** — `deploy_nodes` is fork-local; rebase/cherry-pick discipline required.
5. **Plugin uninstall / disable** — Express cannot easily `unuse` routes; document restart requirement or use a single mounted Router that can short-circuit.
6. **Prompt injection** via flow labels into generated Markdown/OpenAPI descriptions.

## Open questions (ask before Phase 1)

See Phase 0 report / PR description. Highest priority: package name & monorepo layout; AMERRU Node-RED version + `httpAdminRoot`; whether embedded mode may use loopback Admin API with instance credentials; persistence path on the volume.

## PoC evidence location

- Plugin: `poc/node-red-ai-access/`
- Harness + smoke: `poc/harness/`
- Smoke logs produced by `poc/harness/run-phase0.sh`
