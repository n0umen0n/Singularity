import { FIELD_LIMITS } from "@/lib/field-limits";
import { UserInputError } from "@/lib/user-input-error";

export type MissionSocialKind = "website" | "x" | "discord" | "telegram" | "email" | "github";

export type MissionSocials = Partial<Record<MissionSocialKind, string>>;

export const MISSION_SOCIAL_FIELDS: Array<{ kind: MissionSocialKind; label: string; placeholder: string }> = [
  { kind: "website", label: "Website", placeholder: "https://example.com" },
  { kind: "x", label: "X", placeholder: "@handle or x.com/handle" },
  { kind: "discord", label: "Discord", placeholder: "discord.gg/invite" },
  { kind: "telegram", label: "Telegram", placeholder: "@handle or t.me/handle" },
  { kind: "email", label: "Email", placeholder: "hello@example.com" },
  { kind: "github", label: "GitHub", placeholder: "github.com/handle" },
];

const SOCIAL_KINDS = new Set<MissionSocialKind>(MISSION_SOCIAL_FIELDS.map((field) => field.kind));

export function emptyMissionSocials(): MissionSocials {
  return {};
}

export function normalizeMissionSocials(input: unknown): MissionSocials {
  if (!input || typeof input !== "object" || Array.isArray(input)) return emptyMissionSocials();

  const socials: MissionSocials = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SOCIAL_KINDS.has(key as MissionSocialKind)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) socials[key as MissionSocialKind] = trimmed;
  }
  return socials;
}

export function validateMissionSocials(input: MissionSocials | undefined): MissionSocials {
  const socials = normalizeMissionSocials(input);
  for (const [kind, value] of Object.entries(socials)) {
    if (value.length > FIELD_LIMITS.socialHandle) {
      throw new UserInputError(`${kind} link must be ${FIELD_LIMITS.socialHandle} characters or fewer.`);
    }
    if (kind === "email" && value.includes("@") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.replace(/^mailto:/i, ""))) {
      throw new UserInputError("Email must be a valid email address.");
    }
  }
  return socials;
}

export function hasMissionSocials(socials: MissionSocials | undefined) {
  return Object.keys(normalizeMissionSocials(socials)).length > 0;
}

export function missionSocialHref(kind: MissionSocialKind, value: string) {
  const entry = value.trim();
  if (!entry) return "";
  if (/^https?:\/\//i.test(entry)) return entry;
  if (kind === "email") return entry.startsWith("mailto:") ? entry : `mailto:${entry}`;
  const handle = entry.replace(/^@/, "").replace(/^\/+/, "");
  if (kind === "website") return `https://${handle}`;
  if (kind === "x") return `https://x.com/${handle.replace(/^x\.com\//, "")}`;
  if (kind === "telegram") return `https://t.me/${handle.replace(/^t\.me\//, "")}`;
  if (kind === "github") return `https://github.com/${handle.replace(/^github\.com\//, "")}`;
  if (kind === "discord") {
    if (/^discord\.gg\//i.test(handle)) return `https://${handle}`;
    if (/^discord\.com\//i.test(handle)) return `https://${handle}`;
    return `https://discord.gg/${handle.replace(/^discord\.gg\//, "")}`;
  }
  return entry;
}
