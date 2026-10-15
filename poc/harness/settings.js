/**
 * Node-RED settings for AI Access Phase 0 PoC harness.
 * Credentials are local-only placeholders for the smoke test — not for production.
 */

'use strict';

const bcrypt = require('bcryptjs');

// Deterministic local PoC password: "poc-admin-pass"
// Generated at install time if missing; fallback hash baked in for offline start.
const POC_PASSWORD_HASH =
  process.env.POC_ADMIN_PASSWORD_HASH ||
  bcrypt.hashSync(process.env.POC_ADMIN_PASSWORD || 'poc-admin-pass', 8);

module.exports = {
  uiPort: process.env.PORT || 1880,
  uiHost: '127.0.0.1',

  // Explicit flows file so harness restarts are deterministic across hostnames.
  flowFile: 'flows.json',
  flowFilePretty: true,

  // Default roots (both `/`) so owner + public paths share the same origin prefix.
  httpAdminRoot: process.env.HTTP_ADMIN_ROOT || '/',
  httpNodeRoot: process.env.HTTP_NODE_ROOT || '/',

  // Explicit public base for generated links in the PoC pages.
  // Override with PUBLIC_BASE_URL=https://<instance-host> in real deployments.
  functionGlobalContext: {},

  adminAuth: {
    type: 'credentials',
    users: [
      {
        username: process.env.POC_ADMIN_USERNAME || 'poc-admin',
        password: POC_PASSWORD_HASH,
        permissions: '*',
      },
      {
        username: process.env.POC_READONLY_USERNAME || 'poc-readonly',
        password:
          process.env.POC_READONLY_PASSWORD_HASH ||
          bcrypt.hashSync(process.env.POC_READONLY_PASSWORD || 'poc-readonly-pass', 8),
        permissions: 'read',
      },
    ],
  },

  logging: {
    console: {
      level: process.env.NODE_RED_LOG_LEVEL || 'info',
      metrics: false,
      audit: false,
    },
  },

  editorTheme: {
    page: {
      title: 'AI Access Phase 0 Harness',
    },
  },

  // Disable projects for a simpler disposable instance.
  editorThemeProjectsEnabled: false,
};
