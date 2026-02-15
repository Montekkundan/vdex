"use client";

import { useState } from "react";
import { useDesktopStore } from "@/stores/desktop-store";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandItem,
  CommandList,
  CommandGroup,
  CommandSeparator,
} from "@/components/ui/command";
import { LayoutGrid } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { useLaunchApp, getAppId } from "@/lib/hooks/use-launch-app";
import type { DesktopEntry } from "@/types/desktop-entry";

export function AppLauncher({ externalToggle }: { externalToggle?: number }) {
  const [manualOpen, setManualOpen] = useState(false);
  const apps = useDesktopStore((s) => s.apps);
  const launchApp = useLaunchApp();
  const externalParity = ((externalToggle ?? 0) & 1) === 1;
  const open = manualOpen !== externalParity;
  const setOpen = (next: boolean) => {
    setManualOpen(next !== externalParity);
  };

  const launch = (entry: DesktopEntry) => {
    launchApp(entry);
    setOpen(false);
  };

  const builtinApps = apps.filter(
    (a) => a.type === "builtin",
  );
  const x11Apps = apps.filter(
    (a) => a.type === "x11" || a.type === "web",
  );

  return (
    <>
      <button
        className={`flex h-8 items-center gap-1.5 rounded-md px-2 sm:px-2.5 text-label-13 transition-all ${
          open
            ? "bg-gray-alpha-300 text-gray-1000"
            : "text-gray-900 hover:bg-gray-alpha-200 hover:text-gray-1000"
        }`}
        onClick={() => setOpen(true)}
        aria-label="Open app launcher"
      >
        <LayoutGrid aria-hidden="true" size={16} />
        <span className="hidden text-label-13 sm:inline">Apps</span>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput placeholder="Search apps..." />
          <CommandList>
            {builtinApps.length > 0 && (
              <CommandGroup heading="Built-in">
                {builtinApps.map((entry) => (
                  <CommandItem
                    key={entry.id}
                    value={[entry.name, entry.comment ?? "", entry.id].join(" ")}
                    onSelect={() => launch(entry)}
                  >
                    <AppIcon appId={getAppId(entry)} size={16} className="shrink-0 rounded" />
                    <span>{entry.name}</span>
                    {entry.comment && (
                      <span className="ml-2 text-gray-900 text-label-12">
                        {entry.comment}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {x11Apps.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Applications">
                  {x11Apps.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={[entry.name, entry.comment ?? "", entry.id, entry.exec ?? ""].join(" ")}
                      onSelect={() => launch(entry)}
                    >
                      <AppIcon appId={getAppId(entry)} size={16} className="shrink-0 rounded" />
                      <span>{entry.name}</span>
                      {entry.comment && (
                        <span className="ml-2 text-gray-900 text-label-12">
                          {entry.comment}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
