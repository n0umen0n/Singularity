import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import type { Mission } from "@/lib/mock-data";

export const ogSize = { width: 1200, height: 630 };

const ORANGE = "#ff7a5f";
const PURPLE = "#8f7cff";
const SURFACE = "#020203";
const FOAM = "#fff7ed";
const PEACH = "#ffb29a";
const LILAC = "#b9b1ff";

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

async function resolveOrigin() {
  const headerList = await headers();
  const host = headerList.get("host");
  if (!host) return null;
  const proto =
    headerList.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchMission(missionId: string): Promise<Mission | null> {
  try {
    const origin = await resolveOrigin();
    if (!origin) return null;
    const response = await fetch(
      `${origin}/api/missions/${encodeURIComponent(missionId)}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { mission?: Mission };
    return payload.mission ?? null;
  } catch {
    return null;
  }
}

async function fetchTopMissions(limit: number): Promise<Mission[]> {
  try {
    const origin = await resolveOrigin();
    if (!origin) return [];
    const response = await fetch(
      `${origin}/api/missions?sort=highest-liquidity`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { missions?: Mission[] };
    return (payload.missions ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

function Backdrop() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: "flex",
          backgroundImage:
            "radial-gradient(circle at 14% 18%, rgba(255,122,95,0.42), transparent 52%), radial-gradient(circle at 86% 84%, rgba(143,124,255,0.42), transparent 56%), radial-gradient(circle at 50% 50%, rgba(143,124,255,0.10), transparent 65%)",
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
          opacity: 0.13,
          backgroundImage:
            "linear-gradient(to right, rgba(255,247,237,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,247,237,0.55) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
    </>
  );
}

function BrandCone({ size, strokeWidth = 2.4 }: { size: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ overflow: "visible" }}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
        <path d="M11 10 C22 23 25 27 32 32 C39 37 42 41 53 54" stroke={ORANGE} />
        <path d="M53 10 C42 23 39 27 32 32 C25 37 22 41 11 54" stroke={PURPLE} />
        <path d="M20 11 C28 24 29 40 20 53" stroke={PURPLE} />
        <path d="M44 11 C36 24 35 40 44 53" stroke={ORANGE} />
        <ellipse cx="32" cy="10" rx="21" ry="4.6" stroke={ORANGE} />
        <ellipse cx="32" cy="16" rx="15" ry="3.2" stroke={ORANGE} strokeOpacity="0.85" />
        <ellipse cx="32" cy="32" rx="5.2" ry="2" stroke={FOAM} strokeOpacity="0.85" />
        <ellipse cx="32" cy="48" rx="15" ry="3.2" stroke={PURPLE} strokeOpacity="0.85" />
        <ellipse cx="32" cy="54" rx="21" ry="4.6" stroke={PURPLE} />
      </g>
    </svg>
  );
}

function SingularityMark({ scale = 1 }: { scale?: number }) {
  const s = (v: number) => v * scale;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          marginRight: s(16),
        }}
      >
        <BrandCone size={s(40)} />
      </div>
      <div
        style={{
          fontSize: s(24),
          fontWeight: 800,
          letterSpacing: s(10),
          color: FOAM,
        }}
      >
        SINGULARITY
      </div>
    </div>
  );
}

function OrbitalStructure({
  width,
  height,
  opacity = 1,
}: {
  width: number;
  height: number;
  opacity?: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="-176 -50 352 410"
      style={{ opacity }}
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
          strokeOpacity="0.85"
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
  );
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

function MissionStripCard({
  mission,
  left,
  top,
  width,
  height,
  rotate,
  featured,
}: {
  mission: Mission | null;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  featured?: boolean;
}) {
  const image = mission?.image || FALLBACK_MISSION_IMAGE;
  const tokenSymbol = mission?.tokenSymbol ?? "MSN";
  const liquidityLabel = formatLiquidity(mission?.liquidity ?? 0);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        display: "flex",
        borderRadius: 26,
        overflow: "hidden",
        backgroundColor: "#0c0c14",
        border: featured
          ? `1px solid ${PURPLE}77`
          : "1px solid rgba(255,247,237,0.14)",
        boxShadow: featured
          ? "0 50px 110px rgba(0,0,0,0.78), 0 0 0 1px rgba(143,124,255,0.25)"
          : "0 30px 70px rgba(0,0,0,0.6)",
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <img
        src={image}
        alt=""
        style={{
          width,
          height,
          objectFit: "cover",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(height * 0.55),
          display: "flex",
          backgroundImage:
            "linear-gradient(180deg, rgba(2,2,3,0) 0%, rgba(2,2,3,0.45) 45%, rgba(2,2,3,0.92) 100%)",
        }}
      />

      {featured ? (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            display: "flex",
            alignItems: "center",
            padding: "8px 14px",
            borderRadius: 999,
            backgroundColor: `${ORANGE}EE`,
            color: SURFACE,
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Featured
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          display: "flex",
          alignItems: "center",
          padding: "8px 14px",
          borderRadius: 999,
          backgroundColor: "rgba(2,2,3,0.72)",
          border: `1px solid ${PURPLE}99`,
          color: FOAM,
          fontSize: featured ? 20 : 17,
          fontWeight: 700,
        }}
      >
        {`${liquidityLabel} liq`}
      </div>

      <div
        style={{
          position: "absolute",
          left: featured ? 22 : 18,
          right: featured ? 22 : 18,
          bottom: featured ? 20 : 16,
          display: "flex",
          alignItems: "baseline",
        }}
      >
        <div
          style={{
            fontSize: featured ? 34 : 26,
            fontWeight: 820,
            letterSpacing: -1,
            color: FOAM,
            marginRight: 12,
          }}
        >
          {`$${tokenSymbol}`}
        </div>
        <div
          style={{
            fontSize: featured ? 16 : 14,
            fontWeight: 700,
            letterSpacing: 3,
            color: "rgba(255,247,237,0.7)",
            textTransform: "uppercase",
          }}
        >
          mission
        </div>
      </div>
    </div>
  );
}

export async function renderMissionsOg() {
  const missions = await fetchTopMissions(3);
  const padded = [missions[0] ?? null, missions[1] ?? null, missions[2] ?? null];

  const totalLiquidity = missions.reduce((sum, m) => sum + (m?.liquidity ?? 0), 0);
  const liveCount = missions.length;
  const statsLine =
    liveCount > 0
      ? `${liveCount} live mission${liveCount === 1 ? "" : "s"} · ${formatLiquidity(totalLiquidity)} total liquidity`
      : "Live mission markets · backed by community";

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
        <Backdrop />

        <div
          style={{
            position: "absolute",
            top: -160,
            right: -150,
            display: "flex",
            opacity: 0.32,
          }}
        >
          <OrbitalStructure width={520} height={620} />
        </div>

        <div
          style={{
            position: "absolute",
            top: 56,
            left: 64,
            display: "flex",
          }}
        >
          <SingularityMark scale={0.9} />
        </div>

        <div
          style={{
            position: "absolute",
            top: 56,
            right: 64,
            display: "flex",
            alignItems: "center",
            padding: "10px 22px",
            borderRadius: 999,
            backgroundColor: "rgba(143,124,255,0.16)",
            border: `1px solid ${PURPLE}66`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              marginRight: 12,
              borderRadius: 999,
              display: "flex",
              backgroundColor: ORANGE,
              boxShadow: `0 0 12px ${ORANGE}`,
            }}
          />
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 4,
              color: FOAM,
              textTransform: "uppercase",
            }}
          >
            Live mission markets
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 150,
            left: 64,
            display: "flex",
            flexDirection: "column",
            width: 1072,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 820,
              letterSpacing: -4,
              lineHeight: 0.98,
              marginBottom: 18,
              color: FOAM,
            }}
          >
            Fundraising redefined.
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              lineHeight: 1.3,
              color: "rgba(255,247,237,0.74)",
            }}
          >
            Mission markets where investors back the upside and builders earn for shipping.
          </div>
        </div>

        <MissionStripCard
          mission={padded[1]}
          left={64}
          top={332}
          width={320}
          height={246}
          rotate={-2}
        />
        <MissionStripCard
          mission={padded[0]}
          left={420}
          top={308}
          width={360}
          height={274}
          rotate={0}
          featured
        />
        <MissionStripCard
          mission={padded[2]}
          left={816}
          top={332}
          width={320}
          height={246}
          rotate={2}
        />

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 64px",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "rgba(255,247,237,0.7)",
            }}
          >
            {statsLine}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 4,
              color: "rgba(255,247,237,0.55)",
            }}
          >
            app.singularity.diy
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
              "radial-gradient(circle at 22% 30%, rgba(255,122,95,0.30), transparent 55%), radial-gradient(circle at 78% 70%, rgba(143,124,255,0.34), transparent 60%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 110,
            left: 90,
            display: "flex",
            flexDirection: "column",
            width: 1020,
          }}
        >
          <div
            style={{
              fontSize: 156,
              fontWeight: 820,
              letterSpacing: -7,
              lineHeight: 0.92,
              color: FOAM,
            }}
          >
            Fundraising
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginTop: 6,
            }}
          >
            <div
              style={{
                fontSize: 156,
                fontWeight: 820,
                letterSpacing: -7,
                lineHeight: 0.92,
                color: FOAM,
              }}
            >
              redefined
            </div>
            <div
              style={{
                fontSize: 156,
                fontWeight: 820,
                lineHeight: 0.92,
                marginLeft: 4,
                color: ORANGE,
              }}
            >
              .
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 50,
            left: 90,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              marginRight: 18,
            }}
          >
            <BrandCone size={40} strokeWidth={2.6} />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 760,
              letterSpacing: 12,
              color: FOAM,
              textTransform: "uppercase",
            }}
          >
            Singularity
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 56,
            right: 90,
            display: "flex",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            color: "rgba(255,247,237,0.55)",
          }}
        >
          singularity.diy
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
