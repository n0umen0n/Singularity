import { ChevronDown, Link2 } from "lucide-react";
import { cx } from "@singularity/ui";
import {
  MISSION_SOCIAL_FIELDS,
  hasMissionSocials,
  missionSocialHref,
  type MissionSocialKind,
  type MissionSocials,
} from "@/lib/mission-socials";
import { FIELD_LIMITS } from "@/lib/field-limits";

const MISSION_SOCIAL_LABELS: Record<MissionSocialKind, string> = {
  website: "Website",
  x: "X",
  discord: "Discord",
  telegram: "Telegram",
  email: "Email",
  github: "GitHub",
};

export function MissionSocialLinks({ socials, className }: { socials?: MissionSocials; className?: string }) {
  const normalized = socials || {};
  const entries = MISSION_SOCIAL_FIELDS.map((field) => [field.kind, normalized[field.kind]?.trim() || ""] as const).filter(([, value]) => value);
  if (entries.length === 0) return null;

  return (
    <nav className={cx("mission-social-links", className)} aria-label="Mission social links">
      {entries.map(([kind, value]) => (
        <a
          key={kind}
          className={cx("mission-social-link", kind === "website" && "website-link", kind === "github" && "github-link", kind === "telegram" && "telegram-link")}
          href={missionSocialHref(kind, value)}
          aria-label={MISSION_SOCIAL_LABELS[kind]}
          target={kind === "email" ? undefined : "_blank"}
          rel={kind === "email" ? undefined : "noreferrer"}
        >
          <MissionSocialIcon kind={kind} />
        </a>
      ))}
    </nav>
  );
}

export function MissionSocialFields({
  socials,
  onChange,
}: {
  socials: MissionSocials;
  onChange: (socials: MissionSocials) => void;
}) {
  return (
    <details className="form-disclosure">
      <summary className="form-disclosure-summary">
        <Link2 size={16} aria-hidden="true" />
        <span>Add social links (Optional)</span>
        <ChevronDown size={15} aria-hidden="true" className="form-disclosure-chevron" />
      </summary>
      <div className="mission-social-fields">
        {MISSION_SOCIAL_FIELDS.map((field) => (
          <label key={field.kind}>
            <span className="form-label">{field.label}</span>
            <input
              className="field"
              maxLength={FIELD_LIMITS.socialHandle}
              placeholder={field.placeholder}
              value={socials[field.kind] || ""}
              onChange={(event) =>
                onChange({
                  ...socials,
                  [field.kind]: event.target.value,
                })
              }
            />
          </label>
        ))}
      </div>
    </details>
  );
}

export function missionSocialPreview(socials: MissionSocials) {
  return hasMissionSocials(socials) ? socials : undefined;
}

function MissionSocialIcon({ kind }: { kind: MissionSocialKind }) {
  if (kind === "website") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.8 3.1 4.2 6.4 4.2 9s-1.4 5.9-4.2 9c-2.8-3.1-4.2-6.4-4.2-9S9.2 6.1 12 3Z" />
      </svg>
    );
  }
  if (kind === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.42 10.17 22.3 1h-1.87l-6.84 7.96L8.13 1H1.82l8.26 12.03L1.82 22.64h1.87l7.22-8.4 5.76 8.4h6.31l-8.56-12.47Zm-2.56 2.98-.84-1.2L4.36 2.4h2.88l5.38 7.7.84 1.2 6.98 9.98h-2.88l-5.7-8.14Z" />
      </svg>
    );
  }
  if (kind === "discord") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.9 5.2A15.4 15.4 0 0 0 15.3 4l-.2.4a17.2 17.2 0 0 1 4.1 1.6 12.1 12.1 0 0 0-9.2 0A17.2 17.2 0 0 1 14 4.4l-.2-.4a15.4 15.4 0 0 0-3.6 1.2C4.8 8.1 4.1 10.9 4.4 13.7a15.5 15.5 0 0 0 4.7 2.4l1.1-1.7c-.9-.3-1.7-.7-2.5-1.2.2-.1.4-.3.6-.4 1.8 1 3.9 1 5.7 0 .2.1.4.3.6.4-.8.5-1.6.9-2.5 1.2l1.1 1.7a15.5 15.5 0 0 0 4.7-2.4c.4-3.3-.5-6-2.1-8.5ZM9.7 12.4c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm4.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z" />
      </svg>
    );
  }
  if (kind === "telegram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.7 4.1c.3-1.2-.86-1.66-1.72-1.3L2.9 9.4c-1.16.46-1.14 1.12-.2 1.4l4.38 1.36 10.16-6.42c.48-.3.92-.14.56.18l-8.24 7.44-.32 4.78c.46 0 .66-.2.92-.44l2.2-2.14 4.58 3.38c.84.46 1.44.22 1.66-.78l3.1-14.1Z" />
      </svg>
    );
  }
  if (kind === "email") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v.2l8 5 8-5V6H4Zm16 12V9.8l-8 5-8-5V18h16Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.16-.28-.16-.68-.56-.01-.57.63-.01 1.08.59 1.23.83.72 1.23 1.87.89 2.33.67.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.03 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.43 7.43 0 0 1 8 3.94c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.13-1.87 3.82-3.65 4.03.29.26.54.75.54 1.52 0 1.09-.01 1.97-.01 2.24 0 .22.15.48.55.4A8.16 8.16 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
    </svg>
  );
}
