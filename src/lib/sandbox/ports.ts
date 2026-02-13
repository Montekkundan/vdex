// Vercel Sandbox reserves ports like 8080, 3000, etc.
// Use high ports to avoid conflicts.
// Max 4 ports per sandbox.
export const PORTS = {
  // Generic display transport slot. Backed by the selected display client.
  DISPLAY: 14080,
  // HTTP file/process API + WS PTY (at /ws/terminal)
  SERVICES: 14081,
  CODE_SERVER: 14082,
  PREVIEW: 14083,
} as const;

export const SANDBOX_PORTS = [
  PORTS.DISPLAY,
  PORTS.SERVICES,
  PORTS.CODE_SERVER,
  PORTS.PREVIEW,
];
