"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const ThemeSwither = dynamic(
  () => import("@/components/ui/theme-swither").then((m) => m.ThemeSwither),
  { ssr: false },
);

export function AppFooter() {
  const pathname = usePathname();

  if (pathname.startsWith("/desktop/")) {
    return null;
  }

  return (
    <footer className="border-t border-gray-alpha-300 bg-background-100">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <span className="text-copy-13 font-medium text-gray-900">vdex</span>
        <ThemeSwither />
      </div>
    </footer>
  );
}
