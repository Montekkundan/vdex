"use client";

import { Icons } from "@/components/icons";
import { BorderText } from "@/components/ui/border-number";
import { siteConfig } from "@/lib/config";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";

const ThemeSwither = dynamic(
  () => import("@/components/ui/theme-swither").then((m) => m.ThemeSwither),
  { ssr: false },
);

export function Footer() {
  const shouldReduceMotion = useReducedMotion();
  const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

  return (
    <motion.footer
      initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.22, ease }}
      className="flex flex-col gap-y-5 rounded-lg p-5  container max-w-[var(--container-max-width)] mx-auto"
    >
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={
          shouldReduceMotion ? undefined : { duration: 0.2, ease, delay: 0.04 }
        }
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-x-2">
          <Icons.logo className="h-5 w-5" />
          <h2 className="text-lg font-bold text-foreground">
            {siteConfig.name}
          </h2>
        </div>

        <div className="flex items-center gap-x-4">
          <div className="flex gap-x-2">
            {siteConfig.footer.socialLinks.map((link, index) => (
              <a
                key={index}
                href={link.url}
                className="flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground hover:underline hover:underline-offset-4"
              >
                {link.icon}
              </a>
            ))}
          </div>
          <ThemeSwither />
        </div>
      </motion.div>
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={
          shouldReduceMotion ? undefined : { duration: 0.2, ease, delay: 0.08 }
        }
      >
        <BorderText
          text={siteConfig.footer.brandText}
          className="text-[clamp(3rem,15vw,10rem)] overflow-hidden font-mono tracking-tighter font-medium"
        />
      </motion.div>
    </motion.footer>
  );
}
