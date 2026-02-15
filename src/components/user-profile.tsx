"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomeIcon, LogOutIcon } from "lucide-react";
import { logoutMutate, useUser } from "@/lib/hooks/use-swr-hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserProfile() {
  const router = useRouter();
  const { user } = useUser();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const initials = useMemo(() => {
    const source = user?.name?.trim() || user?.email?.trim() || "User";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [user?.email, user?.name]);

  const avatarUrl = useMemo(() => {
    if (user?.image) {
      return user.image;
    }
    if (user?.email) {
      return `https://avatar.vercel.sh/${encodeURIComponent(user.email)}`;
    }
    if (user?.vercelAccount?.providerAccountId) {
      return `https://avatar.vercel.sh/${encodeURIComponent(user.vercelAccount.providerAccountId)}`;
    }
    return null;
  }, [user?.email, user?.image, user?.vercelAccount?.providerAccountId]);

  const displayName = user?.name ?? "Vercel User";
  const displayEmail =
    user?.email ??
    (user?.vercelAccount?.providerAccountId
      ? `ID: ${user.vercelAccount.providerAccountId}`
      : "No email");

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutMutate();
      router.push("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={user?.name ?? "User"} /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 min-w-64">
        <DropdownMenuLabel className="py-2">
          <p className="truncate text-sm font-medium leading-none">{displayName}</p>
          <p className="text-muted-foreground mt-1 max-w-full break-all text-xs leading-4">{displayEmail}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/home">
              <HomeIcon />
              Home
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout} disabled={isLoggingOut}>
          <LogOutIcon />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
