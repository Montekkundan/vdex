export function RoutePending() {
  return (
    <main className="min-h-screen bg-background-100">
      <div className="mx-auto min-h-screen w-full max-w-[var(--container-max-width)] border-x border-dashed border-gray-alpha-300 px-6 py-8 sm:px-8 sm:py-10">
        <div className="space-y-4 animate-pulse">
          <div className="h-7 w-48 bg-gray-alpha-200" />
          <div className="h-4 w-80 max-w-full bg-gray-alpha-200" />
          <div className="h-28 w-full bg-gray-alpha-100" />
          <div className="h-28 w-full bg-gray-alpha-100" />
        </div>
      </div>
    </main>
  );
}
