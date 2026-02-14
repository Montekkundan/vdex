import Link from "next/link";
import UnicornScene from "unicornstudio-react/next";
import { Button } from "@/components/ui/button";

interface HomeSceneProps {
  isLoggedIn?: boolean;
}

export function HomeScene({ isLoggedIn = false }: HomeSceneProps) {
  const ctaHref = isLoggedIn ? "/desktop" : "/api/auth/vercel";

  return (
    <main className="relative h-svh w-full overflow-hidden">
      <UnicornScene
        projectId="1ICiG08DhS5Qpp69B6NI"
        sdkUrl="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.0.5/dist/unicornStudio.umd.js"
        width="100%"
        height="100%"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Button
          asChild
          className="pointer-events-auto mt-40 bg-black/80 px-6 py-5 text-sm text-white hover:bg-black/70"
        >
          <Link href={ctaHref}>Login with Vercel</Link>
        </Button>
      </div>
    </main>
  );
}
