"use client";

import * as React from "react";
import { UserProfile } from "@/components/user-profile";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-heading-24 text-gray-1000">{title}</h1>
        {description ? <p className="text-copy-13 text-gray-700">{description}</p> : null}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <UserProfile />
        {actions}
      </div>
    </div>
  );
}
