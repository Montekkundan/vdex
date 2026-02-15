"use client";

import { ThemeSwither } from "@/components/ui/theme-swither";
import { siteConfig } from "@/lib/config";

export function AppPageFooter() {
  return (
    <footer className="border-t border-dashed border-gray-alpha-300 p-6">
      <div className="flex w-full items-center justify-between">
        <span className="text-copy-13 font-medium tracking-wide text-gray-900">
          {siteConfig.footer.brandText}
        </span>
        <ThemeSwither />
      </div>
    </footer>
  );
}
