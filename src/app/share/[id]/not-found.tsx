export default function ShareNotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="max-w-md rounded-lg border border-white/15 bg-black/60 px-5 py-4 text-center">
        <p className="text-sm font-medium">Share link not found</p>
        <p className="mt-1 text-xs text-white/75">
          This shared sandbox might have ended or the link is no longer valid.
        </p>
      </div>
    </main>
  );
}
