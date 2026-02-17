"use client";

import * as React from "react";
import { UserProfile } from "@/components/user-profile";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  actionsClassName?: string;
  showUserProfile?: boolean;
  variant?: "default" | "overlay";
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  actionsClassName,
  showUserProfile = true,
  variant = "default",
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-dashed border-gray-alpha-300 pb-4 sm:flex-row sm:items-start sm:justify-between px-4",
        variant === "overlay" && "border-white/20 pb-2 sm:items-center",
        className,
      )}
    >
      <div>
        <h1
          className={cn(
            "text-heading-24 text-gray-1000",
            variant === "overlay" && "text-white",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "text-copy-13 text-gray-700",
              variant === "overlay" && "text-white/80",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      <div className={cn("flex items-center gap-2 sm:justify-end", actionsClassName)}>
        {showUserProfile ? <UserProfile /> : null}
        {actions}
      </div>
    </div>
  );
}
