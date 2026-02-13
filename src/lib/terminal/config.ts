export const TERMINAL_SETTINGS_STORAGE_PREFIX = "vdesk:terminal-settings:";

export type TerminalFontPreset =
  | "geist_pixel_square"
  | "geist_pixel_grid"
  | "geist_pixel_circle"
  | "geist_pixel_triangle"
  | "geist_pixel_line"
  | "geist_mono";

export type TerminalCursorStyle = "block" | "underline" | "bar";

export interface TerminalThemeSettings {
  background: string;
  foreground: string;
  cursor: string;
}

export interface TerminalSettings {
  fontPreset: TerminalFontPreset;
  fontSize: number;
  cursorBlink: boolean;
  cursorStyle: TerminalCursorStyle;
  theme: TerminalThemeSettings;
}

export const TERMINAL_FONT_PRESETS: Array<{
  id: TerminalFontPreset;
  label: string;
  fontFamily: string;
}> = [
  {
    id: "geist_pixel_square",
    label: "Geist Pixel Square",
    fontFamily:
      'var(--font-geist-pixel-square), var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
  {
    id: "geist_pixel_grid",
    label: "Geist Pixel Grid",
    fontFamily:
      'var(--font-geist-pixel-grid), var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
  {
    id: "geist_pixel_circle",
    label: "Geist Pixel Circle",
    fontFamily:
      'var(--font-geist-pixel-circle), var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
  {
    id: "geist_pixel_triangle",
    label: "Geist Pixel Triangle",
    fontFamily:
      'var(--font-geist-pixel-triangle), var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
  {
    id: "geist_pixel_line",
    label: "Geist Pixel Line",
    fontFamily:
      'var(--font-geist-pixel-line), var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
  {
    id: "geist_mono",
    label: "Geist Mono",
    fontFamily:
      'var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
];

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontPreset: "geist_mono",
  fontSize: 14,
  cursorBlink: true,
  cursorStyle: "block",
  theme: {
    background: "#000000",
    foreground: "#ededed",
    cursor: "#ffffff",
  },
};

export function getFontFamilyForPreset(preset: TerminalFontPreset): string {
  return (
    TERMINAL_FONT_PRESETS.find((item) => item.id === preset)?.fontFamily ??
    TERMINAL_FONT_PRESETS[0].fontFamily
  );
}

function asHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

export function normalizeTerminalSettings(input: unknown): TerminalSettings {
  if (!input || typeof input !== "object") {
    return DEFAULT_TERMINAL_SETTINGS;
  }
  const record = input as Record<string, unknown>;
  const theme = (record.theme ?? {}) as Record<string, unknown>;
  const fontPreset = record.fontPreset;
  const fontSizeRaw = record.fontSize;
  const cursorStyle = record.cursorStyle;

  const normalizedPreset = TERMINAL_FONT_PRESETS.some(
    (item) => item.id === fontPreset,
  )
    ? (fontPreset as TerminalFontPreset)
    : DEFAULT_TERMINAL_SETTINGS.fontPreset;
  const normalizedFontSize = Number.isFinite(fontSizeRaw)
    ? Math.min(32, Math.max(10, Number(fontSizeRaw)))
    : DEFAULT_TERMINAL_SETTINGS.fontSize;
  const normalizedCursorStyle =
    cursorStyle === "block" ||
    cursorStyle === "underline" ||
    cursorStyle === "bar"
      ? cursorStyle
      : DEFAULT_TERMINAL_SETTINGS.cursorStyle;

  return {
    fontPreset: normalizedPreset,
    fontSize: normalizedFontSize,
    cursorBlink:
      typeof record.cursorBlink === "boolean"
        ? record.cursorBlink
        : DEFAULT_TERMINAL_SETTINGS.cursorBlink,
    cursorStyle: normalizedCursorStyle,
    theme: {
      background: asHexColor(
        theme.background,
        DEFAULT_TERMINAL_SETTINGS.theme.background,
      ),
      foreground: asHexColor(
        theme.foreground,
        DEFAULT_TERMINAL_SETTINGS.theme.foreground,
      ),
      cursor: asHexColor(theme.cursor, DEFAULT_TERMINAL_SETTINGS.theme.cursor),
    },
  };
}

export function getSandboxTerminalSettingsStorageKey(sandboxId: string): string {
  return `${TERMINAL_SETTINGS_STORAGE_PREFIX}${sandboxId}`;
}

export function loadSandboxTerminalSettings(sandboxId: string): TerminalSettings {
  try {
    const raw = localStorage.getItem(getSandboxTerminalSettingsStorageKey(sandboxId));
    if (!raw) return DEFAULT_TERMINAL_SETTINGS;
    return normalizeTerminalSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_TERMINAL_SETTINGS;
  }
}

export function saveSandboxTerminalSettings(
  sandboxId: string,
  settings: TerminalSettings,
) {
  try {
    localStorage.setItem(
      getSandboxTerminalSettingsStorageKey(sandboxId),
      JSON.stringify(normalizeTerminalSettings(settings)),
    );
  } catch {
    // ignore storage failures
  }
}
