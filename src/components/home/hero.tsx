"use client";

import { Icons } from "@/components/icons";
import { Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import PyramidAnimation from "@/components/home/ascii-triangle";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

const EASE_OUT: [number, number, number, number] = [0.215, 0.61, 0.355, 1];
const INTRO_DURATION = 0.45;
const UI_DURATION = 0.2;

function HeroTitles() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex w-full max-w-3xl flex-col overflow-hidden pt-8">
      <motion.h1
        className="text-left text-4xl font-semibold leading-tighter text-foreground sm:text-5xl md:text-6xl tracking-tighter"
        initial={
          shouldReduceMotion
            ? false
            : { opacity: 0, y: 24, scale: 0.98 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          shouldReduceMotion
            ? undefined
            : {
                duration: INTRO_DURATION,
                ease: EASE_OUT,
              }
        }
      >
        <motion.span
          className="inline-block text-balance"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  duration: UI_DURATION,
                  delay: 0.06,
                  ease: EASE_OUT,
                }
          }
        >
          <span className="leading-normal font-bold">
            {siteConfig.hero.title}
          </span>
        </motion.span>
      </motion.h1>
      <motion.p
        className="text-left max-w-xl leading-normal text-muted-foreground sm:text-lg sm:leading-normal text-balance"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? undefined
            : {
                delay: 0.1,
                duration: UI_DURATION,
                ease: EASE_OUT,
              }
        }
      >
        {siteConfig.hero.description}
      </motion.p>
    </div>
  );
}

function HeroCTA({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const ctaHref = isLoggedIn ? "/desktop" : "/api/auth/vercel";
  const ctaLabel = isLoggedIn ? "Get Started" : "Login with Vercel";
  const ctaDescription = isLoggedIn
    ? "Open your desktop workspace"
    : "Sign in with Vercel to launch your desktop workspace";

  return (
    <div className="relative mt-6">
      <motion.div
        className="flex w-full max-w-2xl flex-col items-start justify-start space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? undefined
            : { delay: 0.14, duration: UI_DURATION, ease: EASE_OUT }
        }
      >
        <Link
          href={ctaHref}
          className={cn(
            buttonVariants({ variant: "default" }),
            "w-full sm:w-auto text-background flex gap-2 rounded-lg",
          )}
        >
          <Icons.logo className="h-6 w-6" />
          {ctaLabel}
        </Link>
      </motion.div>
      <motion.p
        className="mt-3 text-sm text-muted-foreground text-left"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={
          shouldReduceMotion
            ? undefined
            : { delay: 0.2, duration: 0.18, ease: EASE_OUT }
        }
      >
        {ctaDescription}
      </motion.p>
    </div>
  );
}
export function Hero({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Section id="hero">
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-x-8 w-full p-6 lg:p-12 border-x border-t mt-8 overflow-hidden border-dashed">
        <div className="flex flex-col justify-start items-start lg:col-span-1">
          <div className="w-full lg:hidden flex items-center justify-center py-2">
            <PyramidAnimation
              wireframe={false}
              color={false}
              edges={true}
              speed={0.03}
              axis="y"
            />
          </div>
          <HeroTitles />
          <HeroCTA isLoggedIn={isLoggedIn} />
        </div>
        <div className="hidden lg:flex relative lg:h-full lg:col-span-1 items-center justify-center">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              shouldReduceMotion
                ? undefined
                : { duration: 0.25, delay: 0.12, ease: EASE_OUT }
            }
            className="w-full max-w-[520px] overflow-hidden px-4"
          >
            <PyramidAnimation
              wireframe={false}
              color={false}
              edges={true}
              speed={0.03}
              axis="y"
            />
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
