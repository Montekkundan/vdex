import UnicornScene from "unicornstudio-react/next";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <main className="relative h-svh w-full overflow-hidden">
      <UnicornScene
        projectId="1ICiG08DhS5Qpp69B6NI"
        sdkUrl="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.0.5/dist/unicornStudio.umd.js"
        width="100%"
        height="100%"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Button className="pointer-events-auto mt-40 bg-black/80 px-6 py-5 text-sm text-white hover:bg-black/70">
          Login with Vercel
        </Button>
      </div>
    </main>
  );
}
