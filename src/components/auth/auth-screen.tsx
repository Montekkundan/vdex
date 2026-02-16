"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginMutate, signupMutate } from "@/lib/hooks/use-swr-hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Note } from "@/components/ui/note";

function VercelLogo() {
  return (
    <svg
      aria-label="Vercel Logo"
      fill="currentColor"
      viewBox="0 0 75 65"
      height="14"
      width="14"
    >
      <path d="M37.59.25l36.95 64H.64l36.95-64z" />
    </svg>
  );
}

export function AuthScreen({
  showDevAuth = false,
}: {
  showDevAuth?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await loginMutate(email, password);
      } else {
        await signupMutate(email, password, name || undefined);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-100">
      <div className="w-full max-w-sm p-8 material-medium">
        <h1 className="text-heading-24 text-gray-1000 mb-1">vdex</h1>
        <p className="text-label-14 text-gray-900 mb-6">
          Sign in to your desktop
        </p>

        <a
          href="/api/auth/vercel"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-1000 px-4 py-2 text-label-14 text-gray-100 transition-opacity hover:opacity-90"
        >
          <VercelLogo />
          Continue with Vercel
        </a>

        {error && (
          <div className="mt-4">
            <Note type="error" size="small">
              {error}
            </Note>
          </div>
        )}

        {showDevAuth && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-alpha-400" />
              <span className="text-label-12 text-gray-700">DEV ONLY</span>
              <div className="h-px flex-1 bg-gray-alpha-400" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <Input
                  id="auth-name"
                  type="text"
                  placeholder="Optional"
                  aria-label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <Input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                id="auth-password"
                type="password"
                placeholder="Password"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />

              <Button
                type="submit"
                disabled={loading}
                className="mt-2"
              >
                {loading ? <Spinner /> : mode === "login" ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-label-13 text-gray-900">
              {mode === "login" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    className="text-gray-1000 underline underline-offset-2 hover:opacity-80"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have one?{" "}
                  <button
                    type="button"
                    className="text-gray-1000 underline underline-offset-2 hover:opacity-80"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
