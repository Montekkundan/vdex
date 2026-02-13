"use client";

import { Note } from "@/components/ui/note";
import { useWorkspaceStore, useActiveSandbox } from "@/stores/workspace-store";
import { getDisplayIframeUrl } from "@/lib/display-clients";
import type { DisplayClient } from "@/types/workspace";

function isRemoteIframeClient(
  value: DisplayClient,
): value is Exclude<DisplayClient, "xpra"> {
  return value !== "xpra";
}

export function RemoteDisplayClient() {
  const { sandbox } = useActiveSandbox();
  const displayClient = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.displayClient ?? "xpra",
  );

  if (!sandbox?.domains.display || !isRemoteIframeClient(displayClient)) return null;

  const src = getDisplayIframeUrl(displayClient, sandbox.domains.display);
  return (
    <div className="fixed inset-0 z-[8500] bg-black">
      <iframe
        src={src}
        className="h-full w-full border-0"
        title={`Remote desktop (${displayClient})`}
        sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

export function UnsupportedDisplayClientNote({ displayClient }: { displayClient: DisplayClient }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[9400] flex justify-center px-4">
      <div className="pointer-events-auto max-w-xl">
        <Note type="warning">
          <p className="text-copy-13 font-medium text-gray-1000">
            Display client &quot;{displayClient}&quot; is not available.
          </p>
          <p className="mt-1 text-copy-13 text-gray-900">
            Choose Xpra or noVNC for now.
          </p>
        </Note>
      </div>
    </div>
  );
}
