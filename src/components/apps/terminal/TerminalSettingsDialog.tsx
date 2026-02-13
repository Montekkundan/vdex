"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TERMINAL_SETTINGS,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_PRESETS,
  type TerminalCursorStyle,
  type TerminalSettings,
} from "@/lib/terminal/config";

interface TerminalSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TerminalSettings;
  onChange: (settings: TerminalSettings) => void;
  onReset: () => void;
}

export function TerminalSettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
  onReset,
}: TerminalSettingsDialogProps) {
  const [fontSizeInput, setFontSizeInput] = useState(String(settings.fontSize));

  useEffect(() => {
    setFontSizeInput(String(settings.fontSize));
  }, [settings.fontSize]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Terminal Settings</DialogTitle>
          <DialogDescription>
            Changes apply immediately and are saved for this sandbox.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="terminal-font-preset">Font family</Label>
            <Select
              value={settings.fontPreset}
              onValueChange={(value) =>
                onChange({
                  ...settings,
                  fontPreset: value as TerminalSettings["fontPreset"],
                })
              }
            >
              <SelectTrigger id="terminal-font-preset" className="w-full">
                <SelectValue placeholder="Choose font" />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_FONT_PRESETS.map((font) => (
                  <SelectItem key={font.id} value={font.id}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="terminal-font-size">Font size</Label>
            <Input
              id="terminal-font-size"
              type="text"
              inputMode="numeric"
              value={fontSizeInput}
              onChange={(event) => {
                const raw = event.target.value.replace(/[^\d]/g, "");
                setFontSizeInput(raw);
                if (raw.length === 0) return;
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                onChange({
                  ...settings,
                  fontSize: Math.min(
                    TERMINAL_FONT_SIZE_MAX,
                    Math.max(TERMINAL_FONT_SIZE_MIN, parsed),
                  ),
                });
              }}
              onBlur={() => {
                const parsed = Number(fontSizeInput);
                const safe = Number.isFinite(parsed)
                  ? Math.min(
                      TERMINAL_FONT_SIZE_MAX,
                      Math.max(TERMINAL_FONT_SIZE_MIN, parsed),
                    )
                  : settings.fontSize;
                onChange({
                  ...settings,
                  fontSize: safe,
                });
                setFontSizeInput(String(safe));
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="terminal-cursor-style">Cursor style</Label>
            <Select
              value={settings.cursorStyle}
              onValueChange={(value) =>
                onChange({
                  ...settings,
                  cursorStyle: value as TerminalCursorStyle,
                })
              }
            >
              <SelectTrigger id="terminal-cursor-style" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="underline">Underline</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-alpha-300 px-3 py-2">
            <Label htmlFor="terminal-cursor-blink">Cursor blink</Label>
            <Switch
              id="terminal-cursor-blink"
              checked={settings.cursorBlink}
              onCheckedChange={(checked) =>
                onChange({
                  ...settings,
                  cursorBlink: checked,
                })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Theme colors</Label>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Label htmlFor="terminal-bg" className="text-xs text-gray-800">
                Background
              </Label>
              <Input
                id="terminal-bg"
                type="color"
                className="h-7 w-12 p-1"
                value={settings.theme.background}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    theme: { ...settings.theme, background: event.target.value },
                  })
                }
              />
              <Label htmlFor="terminal-fg" className="text-xs text-gray-800">
                Foreground
              </Label>
              <Input
                id="terminal-fg"
                type="color"
                className="h-7 w-12 p-1"
                value={settings.theme.foreground}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    theme: { ...settings.theme, foreground: event.target.value },
                  })
                }
              />
              <Label htmlFor="terminal-cursor" className="text-xs text-gray-800">
                Cursor
              </Label>
              <Input
                id="terminal-cursor"
                type="color"
                className="h-7 w-12 p-1"
                value={settings.theme.cursor}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    theme: { ...settings.theme, cursor: event.target.value },
                  })
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(DEFAULT_TERMINAL_SETTINGS)}
          >
            Defaults
          </Button>
          <Button type="button" variant="outline" onClick={onReset}>
            Reset This Sandbox
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
