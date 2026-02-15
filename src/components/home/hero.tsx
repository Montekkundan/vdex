"use client";

import { Icons } from "@/components/icons";
import { Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import PyramidAnimation from "@/components/home/ascii-triangle";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

function HeroTitles() {
  return (
    <div className="flex w-full max-w-3xl flex-col overflow-hidden pt-8">
      <motion.h1
        className="text-left text-4xl font-semibold leading-tighter text-foreground sm:text-5xl md:text-6xl tracking-tighter"
        initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
        transition={{
          duration: 1,
          ease,
          staggerChildren: 0.2,
        }}
      >
        <motion.span
          className="inline-block text-balance"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.5,
            ease,
          }}
        >
          <span className="leading-normal font-bold">
            {siteConfig.hero.title}
          </span>
        </motion.span>
      </motion.h1>
      <motion.p
        className="text-left max-w-xl leading-normal text-muted-foreground sm:text-lg sm:leading-normal text-balance"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.6,
          duration: 0.8,
          ease,
        }}
      >
        {siteConfig.hero.description}
      </motion.p>
    </div>
  );
}

function HeroCTA({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const ctaHref = isLoggedIn ? "/desktop" : "/api/auth/vercel";
  const ctaLabel = isLoggedIn ? "Get Started" : "Login with Vercel";
  const ctaDescription = isLoggedIn
    ? "Open your desktop workspace"
    : "Sign in with Vercel to launch your desktop workspace";

  return (
    <div className="relative mt-6">
      <motion.div
        className="flex w-full max-w-2xl flex-col items-start justify-start space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8, ease }}
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.8 }}
      >
        {ctaDescription}
      </motion.p>
    </div>
  );
}
export function Hero({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
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
