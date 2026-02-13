import type {
  DisplayClient,
  ProviderId,
  SizeProfileId,
  WorkspaceExperience,
} from "@/types/workspace";

type SizeProfile = {
  id: SizeProfileId;
  label: string;
  vcpu: number;
  memoryGb: number;
};

type DisplayClientProfile = {
  id: DisplayClient;
  label: string;
  enabled: boolean;
  reason?: string;
};

type ProviderProfile = {
  id: ProviderId;
  label: string;
  enabled: boolean;
  reason?: string;
};

type ExperienceProfile = {
  id: WorkspaceExperience;
  label: string;
  enabled: boolean;
  reason?: string;
};

export const SIZE_PROFILES: Record<SizeProfileId, SizeProfile> = {
  small_2c4g: {
    id: "small_2c4g",
    label: "Small (2 vCPU / 4 GB)",
    vcpu: 2,
    memoryGb: 4,
  },
  balanced_4c8g: {
    id: "balanced_4c8g",
    label: "Balanced (4 vCPU / 8 GB)",
    vcpu: 4,
    memoryGb: 8,
  },
  max_8c16g: {
    id: "max_8c16g",
    label: "Max (8 vCPU / 16 GB)",
    vcpu: 8,
    memoryGb: 16,
  },
};

export const DISPLAY_CLIENTS: Record<DisplayClient, DisplayClientProfile> = {
  xpra: {
    id: "xpra",
    label: "Xpra",
    enabled: true,
  },
  rdp: {
    id: "rdp",
    label: "RDP",
    enabled: true,
  },
  vnc: {
    id: "vnc",
    label: "VNC",
    enabled: true,
  },
  novnc: {
    id: "novnc",
    label: "noVNC",
    enabled: true,
  },
  kasmvnc: {
    id: "kasmvnc",
    label: "KasmVNC",
    enabled: true,
  },
  webrtc: {
    id: "webrtc",
    label: "WebRTC",
    enabled: true,
  },
};

export const PROVIDERS: Record<ProviderId, ProviderProfile> = {
  vercel: {
    id: "vercel",
    label: "Vercel Sandbox",
    enabled: true,
  },
  azure: {
    id: "azure",
    label: "Azure",
    enabled: false,
    reason: "Not yet implemented",
  },
  gcp: {
    id: "gcp",
    label: "Google Cloud",
    enabled: false,
    reason: "Not yet implemented",
  },
};

export const EXPERIENCES: Record<WorkspaceExperience, ExperienceProfile> = {
  gui: {
    id: "gui",
    label: "GUI Desktop",
    enabled: true,
  },
  cli: {
    id: "cli",
    label: "CLI Only",
    enabled: true,
  },
};

export function isValidProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDERS;
}

export function isValidDisplayClient(value: unknown): value is DisplayClient {
  return typeof value === "string" && value in DISPLAY_CLIENTS;
}

export function isValidSizeProfileId(value: unknown): value is SizeProfileId {
  return typeof value === "string" && value in SIZE_PROFILES;
}

export function isValidWorkspaceExperience(
  value: unknown,
): value is WorkspaceExperience {
  return typeof value === "string" && value in EXPERIENCES;
}
