# AI Access Phase 0 harness

Disposable local Node-RED instance used to prove the embedded plugin PoC.

## Credentials (local placeholders only)

| User | Password | Permissions |
|------|----------|-------------|
| `poc-admin` | `poc-admin-pass` | `*` |
| `poc-readonly` | `poc-readonly-pass` | `read` |

Override with `POC_ADMIN_USERNAME` / `POC_ADMIN_PASSWORD` (and readonly equivalents) if needed.

## Run

```bash
./run-phase0.sh
```

This script:

1. Installs dependencies (including `file:../node-red-ai-access`)
2. Starts Node-RED on `127.0.0.1:1880`
3. Runs `smoke-test.mjs` (auth, public guide, no duplicate routes after deploy)
4. Restarts the process and re-runs smoke tests (new registration timestamp required)

## Prefix experiment

```bash
HTTP_ADMIN_ROOT=/admin PORT=1881 ./run-phase0.sh
# Owner page → http://127.0.0.1:1881/admin/mcp
# Public guide → http://127.0.0.1:1881/mcp/connect/test  (httpNodeRoot still /)
```
