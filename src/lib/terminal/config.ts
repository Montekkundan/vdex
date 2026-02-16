export const TERMINAL_SETTINGS_STORAGE_PREFIX = "vdex:terminal-settings:";

export type TerminalFontPreset = "geist_mono" | "jetbrains_mono";

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
  cssVariable: string;
  fallback: string;
}> = [
  {
    id: "geist_mono",
    label: "Geist Mono",
    cssVariable: "--font-geist-mono",
    fallback:
      '"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
  {
    id: "jetbrains_mono",
    label: "JetBrains Mono",
    cssVariable: "--font-jetbrains-mono",
    fallback:
      '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, monospace',
  },
];

export const TERMINAL_FONT_SIZE_MIN = 8;
export const TERMINAL_FONT_SIZE_MAX = 96;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontPreset: "geist_mono",
  fontSize: 14,
  cursorBlink: true,
  cursorStyle: "bar",
  theme: {
    background: "#000000",
    foreground: "#ededed",
    cursor: "#ffffff",
  },
};

export function getFontFamilyForPreset(preset: TerminalFontPreset): string {
  const selected =
    TERMINAL_FONT_PRESETS.find((item) => item.id === preset) ??
    TERMINAL_FONT_PRESETS[0];
  if (typeof window === "undefined") return selected.fallback;
  try {
    const probe = document.createElement("span");
    probe.textContent = ".";
    probe.style.position = "fixed";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.fontFamily = `var(${selected.cssVariable}), ${selected.fallback}`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).fontFamily.trim();
    probe.remove();
    return resolved || selected.fallback;
  } catch {
    return selected.fallback;
  }
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
    ? Math.min(
        TERMINAL_FONT_SIZE_MAX,
        Math.max(TERMINAL_FONT_SIZE_MIN, Number(fontSizeRaw)),
      )
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

export function getSandboxTerminalSettingsStorageKey(
  sandboxId: string,
): string {
  return `${TERMINAL_SETTINGS_STORAGE_PREFIX}${sandboxId}`;
}

export function loadSandboxTerminalSettings(
  sandboxId: string,
): TerminalSettings {
  try {
    const raw = localStorage.getItem(
      getSandboxTerminalSettingsStorageKey(sandboxId),
    );
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
