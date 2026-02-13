import {
  DISPLAY_CLIENTS,
  isValidDisplayClient,
  isValidProviderId,
  isValidSizeProfileId,
  PROVIDERS,
  SIZE_PROFILES,
} from "@/lib/runtime/profiles";
import type {
  DisplayClient,
  ProviderId,
  SizeProfileId,
} from "@/types/workspace";

export type CreateValidationErrorCode =
  | "UNSUPPORTED_PROVIDER"
  | "UNSUPPORTED_DISPLAY_CLIENT"
  | "UNSUPPORTED_SIZE_PROFILE"
  | "PROVIDER_NOT_IMPLEMENTED"
  | "DISPLAY_CLIENT_NOT_IMPLEMENTED";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: CreateValidationErrorCode; message: string } };

export function validateProvider(input: unknown): ValidationResult<ProviderId> {
  if (!isValidProviderId(input)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_PROVIDER",
        message: `Provider '${String(input)}' is not supported.`,
      },
    };
  }

  const provider = PROVIDERS[input];
  if (!provider.enabled) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_NOT_IMPLEMENTED",
        message: `Provider '${input}' is not available yet.`,
      },
    };
  }

  return { ok: true, value: input };
}

export function validateDisplayClient(
  input: unknown,
): ValidationResult<DisplayClient> {
  if (!isValidDisplayClient(input)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_DISPLAY_CLIENT",
        message: `Display client '${String(input)}' is not supported.`,
      },
    };
  }

  const client = DISPLAY_CLIENTS[input];
  if (!client.enabled) {
    return {
      ok: false,
      error: {
        code: "DISPLAY_CLIENT_NOT_IMPLEMENTED",
        message: `Display client '${input}' is not available yet.`,
      },
    };
  }

  return { ok: true, value: input };
}

export function validateSizeProfile(
  input: unknown,
): ValidationResult<{ id: SizeProfileId; vcpu: number; memoryGb: number }> {
  if (!isValidSizeProfileId(input)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_SIZE_PROFILE",
        message: `Size profile '${String(input)}' is not supported.`,
      },
    };
  }

  const profile = SIZE_PROFILES[input];
  return {
    ok: true,
    value: {
      id: input,
      vcpu: profile.vcpu,
      memoryGb: profile.memoryGb,
    },
  };
}
