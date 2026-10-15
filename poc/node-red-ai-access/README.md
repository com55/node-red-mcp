# node-red-ai-access (Phase 0 PoC)

Minimal Node-RED **plugin** that mounts:

| Route | Mount | Auth |
|-------|-------|------|
| `GET /mcp` | `RED.httpAdmin` | `adminAuth` + `needsPermission('settings.read')` |
| `GET /mcp/poc/registration` | `RED.httpAdmin` | same |
| `GET /mcp/connect/test` | `RED.httpNode` | none (public smoke guide) |

## Why a plugin (not a custom node)

Plugins load once via `onadd` at runtime start. Custom nodes re-instantiate on every deploy, which risks duplicate Express handlers unless carefully guarded. Phase 0 verifies the plugin path.

## Install into a Node-RED userDir

```bash
cd /path/to/node-red-userdir
npm install /path/to/this/package
# ensure settings.js enables adminAuth, then start node-red
```

See `../harness/` for a local smoke harness.
