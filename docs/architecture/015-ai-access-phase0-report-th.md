# รายงาน Phase 0 — AI Access (ภาษาไทย)

## สรุปผล

**ฝังเป็น Node-RED plugin ทำได้** และ PoC บน instance จริงใน VM ผ่านการทดสอบครบ: หน้า owner ที่ `/mcp` ถูก `adminAuth` ป้องกัน, คู่มือสาธารณะที่ `/mcp/connect/test` เปิดได้โดยไม่ต้อง login, และไม่เกิด route ซ้ำหลัง deploy/restart

## 1) ผลสำรวจ repo (com55/node-red-mcp)

- โปรเจกต์ปัจจุบันเป็น **standalone MCP server** (stdio / HTTP Express) ไม่ใช่แพ็กเกจ Node-RED
- คุยกับ Node-RED ผ่าน **Admin API** (`NodeRedAPIClient` + axios) โดยยืนยันตัวตนด้วย Bearer หรือแลก token จาก username/password ที่ `/auth/token`
- มีเครื่องมือ MCP ครอบคลุมอ่าน/เขียน flow, context, modules, diagnostics, semantic search
- **ของ fork ที่ต้องคงไว้:** `deploy_nodes` (deploy แบบ `nodes` + revision v2), แก้ `getRuntimeInfo` ให้ใช้ `/diagnostics`, และโหมด `MCP_READ_ONLY`

## 2) ความเป็นไปได้ของ embedded extension

| ทางเลือก | สรุป |
|----------|------|
| **Plugin (`node-red.plugins`)** | โหลดครั้งเดียวผ่าน `onadd` — **แนะนำและใช้ใน PoC** |
| Custom/config node | เสี่ยง register route ซ้ำทุกครั้งที่ deploy |
| Sidecar MCP อย่างเดียว | คงไว้เพื่อความเข้ากันได้ แต่ไม่ตอบโจทย์หน้า `/mcp` ใน instance |

รูปแบบที่พิสูจน์แล้ว:

- Owner: `RED.httpAdmin` + `RED.auth.needsPermission('settings.read')`
- Public connect: `RED.httpNode` (ไม่ผ่าน adminAuth)
- เมื่อ `httpAdminRoot=/admin` หน้า owner อยู่ที่ `/admin/mcp` ส่วน guide สาธารณะยังอยู่ที่ `/mcp/connect/test`

## 3) หลักฐาน PoC

รันด้วย `poc/harness/run-phase0.sh` บน Node-RED v4.x ท้องถิ่น

| เคส | ผล |
|-----|----|
| `GET /mcp` ไม่มี auth | **401** |
| `GET /mcp` + Bearer admin | **200** HTML owner |
| `GET /mcp/connect/test` ไม่มี auth | **200** `text/markdown` + `Cache-Control: no-store` |
| หลัง `POST /flows` full deploy | `registerCalls` ยังเป็น **1** |
| หลัง process restart | timestamp การ register **เปลี่ยน** และ smoke ผ่านอีกครั้ง |
| `httpAdminRoot=/admin` | owner ที่ `/admin/mcp` ยังถูกป้องกัน; guide ที่ `/mcp/connect/test` ยังสาธารณะ |

## 4) สถาปัตยกรรมที่แนะนำ (core vs adapters)

แยก **core กลางที่ไม่มี Express/RED** แล้วมี adapter:

1. **MCP adapter** — ของเดิมใน repo นี้ (คง `deploy_nodes` / read-only)
2. **REST/plugin adapter** — หน้า owner + grant + `/mcp/api/v1` (Phase 1+)
3. **MCP Streamable HTTP** ภายหลังที่ `/mcp/rpc` ใช้ core ชุดเดียวกัน

ทิศทาง refactor แบบค่อยเป็นค่อยไป: ดึง `NodeRedAPIClient` หลัง `NodeRedAdminPort` → ให้ MCP เรียกพอร์ตเดิม → เพิ่ม plugin โดยยังไม่เขียน REST ใน Phase 0

รายละเอียดอยู่ใน `docs/architecture/015-ai-access-phase0.md`

## 5) ความเสี่ยงหลัก

1. แพ็กเกจคู่ (plugin + standalone) ทำให้ build/export เพี้ยนได้
2. `httpAdminRoot` / proxy prefix ทำให้ URL ที่โชว์ให้ AI ต้อง derive จาก `PUBLIC_BASE_URL`
3. เรียก Admin API แบบ in-process กับ HTTP loopback อาจพฤติกรรมไม่เท่ากัน
4. `deploy_nodes` เป็นของ fork — ต้องมีวินัย sync upstream
5. Express ถอน route ตอน disable plugin ได้ยาก → ควรมount เป็น Router เดียว / บังคับ restart
6. Prompt injection จากชื่อ/คำอธิบายใน flow เข้า Markdown guide

## 6) คำถามที่ควรถามก่อน Phase 1

1. ชื่อแพ็กเกจและรูปแบบ monorepo ที่ต้องการ (เช่น คง repo นี้แล้วเพิ่ม `packages/*` หรือแยก `@amerru/node-red-ai-access`)?
2. เวอร์ชัน Node-RED ใน AMERRU template และค่า `httpAdminRoot` / reverse-proxy prefix จริง?
3. Embedded mode อนุญาตให้ใช้ loopback Admin API ด้วย credentials ของ instance ได้หรือไม่ หรือต้อง in-process API เท่านั้น?
4. พาธ persistence บน volume ต่อ instance (ตำแหน่งไฟล์ grant/proposal) และสิทธิ์ไฟล์ที่ต้องการ?
5. ขอบเขต sanitize ของ flow ใน Phase 1 (ฟิลด์ที่ต้อง redact เพิ่มจาก credentials)?
6. ต้องการรองรับ `permissions: read` ของ Node-RED ให้เข้าหน้า owner ได้แค่ไหน (`settings.read` vs `write`)?
7. แผน sync กับ upstream `ziv-daniel/node-red-mcp` ระหว่างทำ AI Access?
