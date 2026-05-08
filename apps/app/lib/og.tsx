import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import type { Mission } from "@/lib/mock-data";

export const ogSize = { width: 1200, height: 630 };

const ORANGE = "#ff7a5f";
const PURPLE = "#8f7cff";
const SURFACE = "#020203";
const FOAM = "#fff7ed";

const FALLBACK_MISSION_IMAGE =
  "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1400&q=85";
const FALLBACK_TOKEN_IMAGE =
  "https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=300&q=80";

function formatLiquidity(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safe);
}

function formatHolders(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(safe)
    .toLowerCase();
}

async function fetchMission(missionId: string): Promise<Mission | null> {
  try {
    const headerList = await headers();
    const host = headerList.get("host");
    if (!host) return null;
    const proto =
      headerList.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    const response = await fetch(
      `${proto}://${host}/api/missions/${encodeURIComponent(missionId)}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { mission?: Mission };
    return payload.mission ?? null;
  } catch {
    return null;
  }
}

export async function renderMissionOg(missionId: string) {
  const mission = await fetchMission(missionId);

  const statement = mission?.statement ?? "Singularity mission";
  const tokenSymbol = mission?.tokenSymbol ?? "MISSION";
  const liquidityLabel = `${formatLiquidity(mission?.liquidity ?? 0)} liquidity`;
  const holdersLabel = `${formatHolders(mission?.holders ?? 0)} holders · backed on Singularity`;
  const eyebrow = `Mission · $${tokenSymbol}`;
  const missionImage = mission?.image || FALLBACK_MISSION_IMAGE;
  const tokenImage = mission?.tokenImage || FALLBACK_TOKEN_IMAGE;

  const titleSize = statement.length > 80 ? 48 : statement.length > 48 ? 56 : 68;

  const mediaHeight = 360;
  const cardHeight = 630 - mediaHeight;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: SURFACE,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          color: FOAM,
        }}
      >
        <img
          src={missionImage}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: mediaHeight,
            objectFit: "cover",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: mediaHeight,
            display: "flex",
            backgroundImage:
              "linear-gradient(180deg, rgba(2,2,3,0.55) 0%, rgba(2,2,3,0) 35%, rgba(2,2,3,0.0) 65%, rgba(2,2,3,0.85) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: mediaHeight,
            left: 0,
            width: 1200,
            height: cardHeight,
            display: "flex",
            backgroundColor: SURFACE,
            backgroundImage: `radial-gradient(circle at 18% 0%, ${ORANGE}22, transparent 55%), radial-gradient(circle at 92% 100%, ${PURPLE}22, transparent 60%)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 36,
            left: 56,
            display: "flex",
            alignItems: "center",
            padding: "12px 22px 12px 14px",
            borderRadius: 999,
            backgroundColor: "rgba(2,2,3,0.62)",
            border: "1px solid rgba(255,247,237,0.28)",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              marginRight: 14,
              borderRadius: 999,
              display: "flex",
              backgroundImage: `linear-gradient(135deg, ${ORANGE} 0%, ${PURPLE} 100%)`,
            }}
          />
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 8,
              color: FOAM,
            }}
          >
            SINGULARITY
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 36,
            right: 56,
            display: "flex",
            alignItems: "center",
            padding: "14px 26px",
            borderRadius: 999,
            backgroundColor: "rgba(2,2,3,0.7)",
            border: `1px solid ${PURPLE}80`,
            color: FOAM,
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          {liquidityLabel}
        </div>

        <div
          style={{
            position: "absolute",
            top: mediaHeight - 76,
            left: 56,
            width: 152,
            height: 152,
            borderRadius: 999,
            display: "flex",
            overflow: "hidden",
            border: `5px solid ${SURFACE}`,
            boxShadow: "0 18px 48px rgba(0,0,0,0.6)",
          }}
        >
          <img
            src={tokenImage}
            alt=""
            style={{ width: 152, height: 152, objectFit: "cover" }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: mediaHeight + 22,
            left: 232,
            right: 56,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 6,
              marginBottom: 14,
              color: PURPLE,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 820,
              letterSpacing: -2,
              lineHeight: 1.04,
              marginBottom: 16,
              color: FOAM,
            }}
          >
            {statement}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "rgba(255,247,237,0.72)",
            }}
          >
            {holdersLabel}
          </div>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}

export function renderHeroOg() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: SURFACE,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          color: FOAM,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            backgroundImage:
              "radial-gradient(circle at 65% 42%, rgba(255,106,74,0.40), transparent 55%), radial-gradient(circle at 76% 62%, rgba(118,108,255,0.36), transparent 60%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            opacity: 0.18,
            backgroundImage:
              "linear-gradient(to right, rgba(255,247,237,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,247,237,0.5) 1px, transparent 1px)",
            backgroundSize: "88px 88px",
          }}
        />

        <svg
          width="320"
          height="380"
          viewBox="-176 -50 352 410"
          style={{
            position: "absolute",
            top: 110,
            right: 100,
          }}
        >
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M-136 0 C-62 88 -39 117 0 152 C39 187 62 216 136 304"
              stroke={ORANGE}
              strokeWidth="8"
            />
            <path
              d="M136 0 C62 88 39 117 0 152 C-39 187 -62 216 -136 304"
              stroke={PURPLE}
              strokeWidth="8"
            />
            <path
              d="M-76 5 C-22 92 -19 252 -76 310"
              stroke={PURPLE}
              strokeWidth="7"
            />
            <path
              d="M76 5 C22 92 19 252 76 310"
              stroke={ORANGE}
              strokeWidth="7"
            />
            <ellipse cx="0" cy="0" rx="136" ry="30" stroke={ORANGE} strokeWidth="7" />
            <ellipse
              cx="0"
              cy="54"
              rx="98"
              ry="21"
              stroke={ORANGE}
              strokeOpacity="0.82"
              strokeWidth="6"
            />
            <ellipse
              cx="0"
              cy="152"
              rx="34"
              ry="13"
              stroke={FOAM}
              strokeOpacity="0.78"
              strokeWidth="5"
            />
            <ellipse
              cx="0"
              cy="250"
              rx="98"
              ry="21"
              stroke={PURPLE}
              strokeOpacity="0.82"
              strokeWidth="6"
            />
            <ellipse cx="0" cy="304" rx="136" ry="30" stroke={PURPLE} strokeWidth="7" />
          </g>
        </svg>

        <div
          style={{
            position: "absolute",
            top: 232,
            left: 80,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 14,
              marginBottom: 28,
              color: FOAM,
            }}
          >
            SINGULARITY
          </div>
          <div
            style={{
              fontSize: 116,
              fontWeight: 820,
              letterSpacing: -4,
              lineHeight: 1,
              color: FOAM,
            }}
          >
            Fundraising redefined
          </div>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
