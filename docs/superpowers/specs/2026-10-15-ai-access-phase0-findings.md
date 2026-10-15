# AI Access Phase 0 — Investigation Findings

## Repo architecture (com55/node-red-mcp fork)

This repository is a **standalone MCP server**, not a Node-RED node module.

- **Entry:** `src/index.ts` — stdio and/or HTTP (`ExpressApp`)
- **MCP tools/resources/prompts:** `src/server/mcp-server.ts`
- **Node-RED integration:** HTTP Admin API client `src/services/nodered-api.ts`
- **Auth to Node-RED:** `src/utils/auth.ts` — Bearer token or password-grant exchange at `/auth/token`
- **Extra HTTP:** OAuth helper, SSE, health, rate limits in `express-app.ts`

### Fork features that must be preserved

1. **`deploy_nodes`** MCP tool → `NodeRedAPIClient.deployModifiedNodes()`
   - Uses `GET /flows` + `Node-RED-API-Version: v2` for `rev`
   - Deploys with `Node-RED-Deployment-Type: nodes`
2. **`getRuntimeInfo`** uses `/diagnostics` (not dead `/admin/info`)
3. **`MCP_READ_ONLY=true`** hides/rejects write tools (including `deploy_nodes`)

### Mapping to AI Access REST (future)

| REST (spec) | Closest existing core |
|-------------|----------------------|
| `GET .../flows` | `getFlows` / `getFlowsWithRev` |
| `GET .../flows/:id` | `getFlow` |
| `GET .../errors` | `get_node_errors` / WS `/comms` |
| Approve apply (nodes) | `deployModifiedNodes` |
| Read-only gate | `MCP_READ_ONLY` concept → grant `scope` |

## Embedded extension feasibility

**Verdict: feasible via Node-RED plugin API.**

Evidence:

- Official `package.json` `"node-red": { "plugins": { ... } }`
- Runtime: `RED.plugins.registerPlugin` + `onadd` (once per process)
- Owner auth: `RED.httpAdmin` + `RED.auth.needsPermission`
- Public routes: `RED.httpNode` (separate from `adminAuth`)
- Production precedent: FlowFuse `@flowfuse/nr-assistant` mounts MCP-ish admin routes the same way

PoC implements `/mcp` + `/mcp/connect/test` under `poc/node-red-ai-access`.

## Out of scope for Phase 0

- REST `/mcp/api/v1/*`
- Grant store / hashed tokens
- Proposals / approval UI
- Native `/mcp/rpc`
