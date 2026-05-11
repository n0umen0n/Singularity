"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import { ArrowRight, ChevronDown, Copy, Menu, Sparkles, Upload } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { BrandWordmark, GlassCard, SingularityMark, StatusPill, cx } from "@singularity/ui";
import { FlipCard } from "@/components/animate-ui/flip-card";
import * as api from "@/lib/api";
import type { FundingRequest, Investor, Mission, RequestStatus } from "@/lib/mock-data";
import { money, number, shortAddress } from "@/lib/format";
import { useSingularityWallet } from "@/lib/wallet";

type CropKind = "mission" | "token";

type CropRequest = {
  kind: CropKind;
  label: string;
  sourceUrl: string;
  file: File;
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
  shape: "rect" | "circle";
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useSingularityWallet();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMenuOpen]);

  return (
    <main className="app-shell">
      <header className="top-nav">
        <Link href="/missions">
          <BrandWordmark />
        </Link>
        <div className="nav-actions">
          <Link className="button button-primary" href="/missions/new">
            Create mission
          </Link>
          {wallet.address ? (
            <Link className="profile-nav-button desktop-only" href="/profile" aria-label="Open profile">
              <span className="status-pill wallet-pill">{shortAddress(wallet.address)}</span>
              <span>Profile</span>
              <ChevronDown size={15} />
            </Link>
          ) : (
            <button className="button desktop-only" type="button" onClick={() => void wallet.signIn()}>
              Sign in
            </button>
          )}
          <div className={cx("app-menu-shell mobile-menu-shell", isMenuOpen && "open")} ref={menuRef}>
            <button
              className="menu-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label="Open app menu"
              onClick={() => setIsMenuOpen((current) => !current)}
            >
              <Menu size={17} aria-hidden />
              <span>Menu</span>
            </button>
            {isMenuOpen ? (
              <div className="app-menu" role="menu">
                {wallet.address ? <span className="menu-wallet">{shortAddress(wallet.address)}</span> : null}
                <Link role="menuitem" href="/missions" onClick={() => setIsMenuOpen(false)}>
                  Missions
                </Link>
                <Link role="menuitem" href="/missions/new" onClick={() => setIsMenuOpen(false)}>
                  Create mission
                </Link>
                {wallet.address ? (
                  <>
                    <Link role="menuitem" href="/profile" onClick={() => setIsMenuOpen(false)}>
                      Profile
                    </Link>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        void wallet.signOut();
                      }}
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void wallet.signIn();
                    }}
                  >
                    Sign in
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {action}
      <SingularityMark className="watermark" />
    </header>
  );
}

function missionListKey(query: string, sort: string) {
  return `${query.trim()}\u0000${sort}`;
}

export function MissionsPage({ initialMissions }: { initialMissions?: Mission[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Highest liquidity");
  const [missions, setMissions] = useState<Mission[]>(initialMissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialMissions);
  const sort = filter === "Newest" ? "newest" : filter === "Most holders" ? "most-holders" : "highest-liquidity";
  const loadedKey = useRef<string | null>(initialMissions ? missionListKey("", sort) : null);

  useEffect(() => {
    const key = missionListKey(query, sort);
    if (loadedKey.current === key) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      api
        .listMissions({ q: query, sort }, { signal: controller.signal })
        .then(({ missions }) => {
          if (!controller.signal.aborted) {
            setMissions(missions);
            setError(null);
            loadedKey.current = key;
            setLoading(false);
          }
        })
        .catch((error: Error) => {
          if (error.name !== "AbortError") {
            setError(error.message);
            setLoading(false);
          }
        });
    }, query.trim() ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, sort]);

  if (loading && !missions.length && !error) {
    return (
      <AppShell>
        <section className="page-container">
          <PageLoader />
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page-container">
        <PageHeader
          eyebrow="Singularity platform"
          title="Missions"
          description="Discover mission markets, compare liquidity, and back the futures you want to exist in"
        />
        <div className="search-row">
          <label>
            <span className="form-label">Search missions</span>
            <input
              className="search-box"
              placeholder="Search missions, tokens, descriptions..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="filter-pills" aria-label="Mission filters">
            {["Highest liquidity", "Newest", "Most holders"].map((entry) => (
              <button className={cx("filter-pill", filter === entry && "active")} key={entry} onClick={() => setFilter(entry)}>
                {entry}
              </button>
            ))}
          </div>
        </div>
        <div className="mission-grid">
          {error ? <GlassCard className="section-card">{error}</GlassCard> : null}
          {missions.map((mission, index) => (
            <MissionCard key={mission.id} mission={mission} priority={index < 2} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function MissionCard({ mission, preview = false, priority = false }: { mission: Mission; preview?: boolean; priority?: boolean }) {
  const className = cx("glass-card mission-card mission-card-link", !preview && "interactive", preview && "mission-preview-card");
  const content = (
    <>
      <div className="mission-card-media">
        <img src={mission.image} alt="" decoding="async" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} />
        <span className="token-avatar">
          <img src={mission.tokenImage} alt="" decoding="async" loading={priority ? "eager" : "lazy"} />
        </span>
        <span className="media-pill">{money(mission.liquidity, true)} liquidity</span>
      </div>
      <div className="mission-card-body">
        <h2>{mission.statement}</h2>
        <p>{mission.description}</p>
        <div className="card-footer">
          <span>
            ${mission.tokenSymbol} · {number(mission.holders, true)} holders
          </span>
          <ArrowRight size={18} />
        </div>
      </div>
    </>
  );

  if (preview) {
    return (
      <article className={className} aria-label="Mission discovery preview">
        {content}
      </article>
    );
  }

  return (
    <Link href={`/missions/${mission.id}`} className={className}>
      {content}
    </Link>
  );
}

function CouncilMemberFlipCard({
  member,
  index,
  symbol,
  tokenImage,
  isCurrentUser = false,
}: {
  member: Mission["council"][number];
  index: number;
  symbol: string;
  tokenImage: string;
  isCurrentUser?: boolean;
}) {
  const description = member.description?.trim();
  const profileHref = `/profile/${encodeURIComponent(member.address)}`;
  const avatar = member.avatar && member.avatar !== tokenImage ? member.avatar : "";

  return (
    <FlipCard
      className="council-flip-card"
      front={
        <article className="glass-card flip-profile-card flip-profile-front">
          <StatusPill>#{index + 1}</StatusPill>
          <span className="flip-profile-avatar">
            {avatar ? (
              <img src={avatar} alt="" decoding="async" loading="lazy" />
            ) : (
              <img src={dicebearPersonaAvatar(member.address || member.name)} alt="" decoding="async" loading="lazy" />
            )}
          </span>
          <div>
            <h3>{member.name}</h3>
            <p>
              {member.tokens > 0 ? `${number(member.tokens, true)} ${symbol}` : "Registered candidate"}
            </p>
          </div>
        </article>
      }
      back={
        <article className="glass-card flip-profile-card flip-profile-back">
          <StatusPill tone="council">{isCurrentUser ? "Registered" : "Councillor"}</StatusPill>
          <div className="flip-profile-back-content">
            <h3>{member.name}</h3>
            {description ? <p className="flip-profile-description">{description}</p> : null}
          </div>
          <div className="flip-profile-footer">
            <Link className="button button-primary flip-profile-button" href={profileHref}>
              Open profile
            </Link>
          </div>
        </article>
      }
    />
  );
}

function dicebearPersonaAvatar(seed: string) {
  const params = new URLSearchParams({
    seed: seed || "singularity-councillor",
    size: "180",
    radius: "50",
    scale: "88",
    backgroundType: "gradientLinear",
    backgroundColor: "08080b,11111a,171326,1e162f",
    clothingColor: "171721,241d36,30244d,3b1f2f",
    hair: "beanie,cap,bald,buzzcut,shortCombover,fade",
    hairColor: "16141f,2b2438,362c47",
    eyes: "sunglasses,open,sleep",
    mouth: "smirk,frown,smile",
    facialHairProbability: "35",
  });

  return `https://api.dicebear.com/9.x/personas/svg?${params.toString()}`;
}

const councilPlaceholderPortrait = "/council-placeholder-portrait.png";

function CouncilPlaceholderCard({ index }: { index: number }) {
  return (
    <article className="glass-card flip-profile-card council-placeholder-card">
      <StatusPill>#{index + 1}</StatusPill>
      <span className="flip-profile-avatar placeholder-avatar">
        <img src={councilPlaceholderPortrait} alt="" decoding="async" loading="lazy" />
      </span>
      <div>
        <h3>Open council slot</h3>
      </div>
    </article>
  );
}

const defaultMissionImage = "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1400&q=85";
const defaultTokenImage = "https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=300&q=80";
const previewPerformance: Mission["performance"] = {
  "1H": { label: "1 hour", agoLabel: "1 hour ago", value: 100, change: 0 },
  "4H": { label: "4 hours", agoLabel: "4 hours ago", value: 100, change: 0 },
  "1D": { label: "1 day", agoLabel: "1 day ago", value: 100, change: 0 },
  "1W": { label: "1 week", agoLabel: "1 week ago", value: 100, change: 0 },
  "1M": { label: "1 month", agoLabel: "1 month ago", value: 100, change: 0 },
  "6M": { label: "6 months", agoLabel: "6 months ago", value: 100, change: 0 },
  "1Y": { label: "1 year", agoLabel: "1 year ago", value: 100, change: 0 },
};

const performanceFrameOrder: Array<keyof Mission["performance"]> = ["1H", "4H", "1D", "1W", "1M", "6M", "1Y"];

export function MissionDetailPage({ missionId, initialMission }: { missionId: string; initialMission?: Mission | null }) {
  const [mission, setMission] = useState<Mission | null>(initialMission ?? null);
  const [error, setError] = useState<string | null>(null);
  const loadedMissionId = useRef(initialMission?.id ?? null);
  const refreshedMissionId = useRef<string | null>(null);

  useEffect(() => {
    if (loadedMissionId.current === missionId) return;

    const controller = new AbortController();
    api
      .getMission(missionId, { signal: controller.signal })
      .then(({ mission }) => {
        if (!controller.signal.aborted) {
          setMission(mission);
          setError(null);
          loadedMissionId.current = mission.id;
        }
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => {
      controller.abort();
    };
  }, [missionId]);

  useEffect(() => {
    if (!mission || mission.id !== missionId || refreshedMissionId.current === missionId) return;
    refreshedMissionId.current = missionId;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .getMission(missionId, { refresh: true, signal: controller.signal })
        .then(({ mission }) => {
          if (!controller.signal.aborted) setMission(mission);
        })
        .catch(() => {});
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mission, missionId]);

  if (!mission) {
    return (
      <AppShell>
        <section className="page-container">
          {error ? <GlassCard className="section-card">{error}</GlassCard> : <PageLoader />}
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page-container detail-grid">
        <div className="detail-main">
          <MissionHero mission={mission} />
          <StatsGrid mission={mission} />
        </div>
        <aside className="right-rail">
          <TreasuryPanel mission={mission} onMissionChange={setMission} />
          <TradePanel mission={mission} onMissionChange={setMission} />
        </aside>
        <div className="detail-lower">
          <PerformanceCard mission={mission} />
          <CouncilSection mission={mission} onMissionChange={setMission} />
          <FundingRequests mission={mission} onMissionChange={setMission} />
        </div>
      </section>
    </AppShell>
  );
}

function MissionHero({ mission }: { mission: Mission }) {
  return (
    <section className="glass-card mission-hero">
      <img className="hero-image" src={mission.image} alt="" decoding="async" loading="eager" fetchPriority="high" />
      <div className="hero-topline">
        <StatusPill>Missions / {mission.tokenSymbol}</StatusPill>
        <StatusPill tone="info">{money(mission.liquidity, true)} liquidity</StatusPill>
      </div>
      <div className="hero-content">
        <div className="hero-title-row">
          <div>
            <h1 className={missionTitleClass(mission.statement)}>{mission.statement}</h1>
            <p>{mission.description}</p>
          </div>
          <span className="token-avatar" style={{ width: 72, height: 72 }}>
            <img src={mission.tokenImage} alt="" decoding="async" loading="eager" />
          </span>
        </div>
      </div>
    </section>
  );
}

function missionTitleClass(statement: string) {
  const length = statement.trim().length;
  return cx("hero-title", length > 118 && "hero-title-very-long", length > 68 && length <= 118 && "hero-title-long");
}

function StatsGrid({ mission }: { mission: Mission }) {
  const stats = [
    ["Token price", `${money(mission.tokenPrice)} ${mission.tokenSymbol}`],
    ["Holders", number(mission.holders)],
  ];
  return (
    <div className="stats-grid">
      {stats.map(([label, value]) => (
        <GlassCard className="stat-card" key={label}>
          <span className="stat-label">{label}</span>
          <div className="stat-value">{value}</div>
        </GlassCard>
      ))}
    </div>
  );
}

function TimeframeDropdown({
  value,
  options,
  onChange,
}: {
  value: keyof Mission["performance"];
  options: Array<keyof Mission["performance"]>;
  onChange: (next: keyof Mission["performance"]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <div className={cx("timeframe-dropdown", isOpen && "open")} ref={containerRef}>
      <button
        type="button"
        className="timeframe-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Performance timeframe"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{value}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {isOpen ? (
        <ul className="timeframe-menu" role="listbox" aria-label="Performance timeframe">
          {options.map((entry) => (
            <li key={entry}>
              <button
                type="button"
                role="option"
                aria-selected={entry === value}
                className={cx("timeframe-option", entry === value && "active")}
                onClick={() => {
                  onChange(entry);
                  setIsOpen(false);
                }}
              >
                {entry}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PerformanceCard({ mission }: { mission: Mission }) {
  const [frame, setFrame] = useState<keyof Mission["performance"]>("1D");
  const [investmentInput, setInvestmentInput] = useState("100");
  const point = mission.performance[frame] || previewPerformance[frame];
  const investmentAmount = Math.max(Number(investmentInput) || 0, 0);
  // point.value is (currentPrice / baselinePrice) * 100, computed identically for the
  // bonding curve and AMM phases since both record currentPrice in price_points.
  // Tokens you would have bought: investmentAmount / baselinePrice
  // Today's value:                tokens * currentPrice = investmentAmount * (currentPrice / baselinePrice)
  const returnMultiplier = point.value > 0 ? point.value / 100 : 1;
  const projectedValue = investmentAmount * returnMultiplier;
  const investmentReturn = projectedValue - investmentAmount;
  const growthTone = investmentReturn < 0 ? "drop" : returnMultiplier > 1.3 ? "surge" : "rise";
  const isPositiveReturn = investmentReturn > 0;
  const growthLabel = `${investmentReturn > 0 ? "+" : ""}${money(investmentReturn)}`;
  const orderedFrames = performanceFrameOrder.filter((entry) => entry in mission.performance);
  return (
    <GlassCard className="section-card chart-card">
      <div className="section-heading">
        <div>
          <h2 className="investment-title">
            If you invested{" "}
            <label className="investment-amount-control">
              <span>$</span>
              <input
                aria-label="Investment amount"
                inputMode="decimal"
                style={{ width: `${Math.min(Math.max(investmentInput.length || 1, 3), 7)}ch` }}
                type="text"
                value={investmentInput}
                onChange={(event) => {
                  const nextValue = event.target.value.replace(/[^\d.]/g, "");
                  const numericValue = Number(nextValue);
                  if (/^\d*\.?\d{0,2}$/.test(nextValue) && (!numericValue || numericValue <= 1000000)) {
                    setInvestmentInput(nextValue);
                  }
                }}
              />
            </label>{" "}
            {point.agoLabel}
          </h2>
          <p>Your {money(investmentAmount)} would be worth <strong>{money(projectedValue)}</strong></p>
        </div>
        <TimeframeDropdown value={frame} options={orderedFrames} onChange={setFrame} />
      </div>
      <div className={`growth-arrow-stage growth-${growthTone}`} aria-label={`Investment growth: ${growthLabel}`}>
        <div className="growth-value-badge">
          <span>{growthLabel}</span>
          <small>{isPositiveReturn ? "growth" : "change"}</small>
        </div>
      </div>
    </GlassCard>
  );
}

function CouncilSection({ mission, onMissionChange }: { mission: Mission; onMissionChange?: (mission: Mission) => void }) {
  const wallet = useSingularityWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationSucceeded, setRegistrationSucceeded] = useState(false);
  const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);
  const [registeredCandidateAddress, setRegisteredCandidateAddress] = useState<string | null>(null);
  const [walletTokenBalance, setWalletTokenBalance] = useState<number | null>(null);
  const [walletProfile, setWalletProfile] = useState<api.Profile | null>(null);
  const [councilProfiles, setCouncilProfiles] = useState<Record<string, api.Profile>>({});
  const userBalance = walletTokenBalance ?? mission.council.find((entry) => entry.address === wallet.address)?.tokens ?? 0;
  const trackedBalance = Math.max(0, Math.floor(userBalance));
  const openCouncilSlots = Math.max(6 - mission.council.length, 0);
  const candidateRank =
    openCouncilSlots > 0
      ? mission.council.length + 1
      : mission.council.filter((member) => member.tokens > trackedBalance).length + 1;
  const candidateRankLabel = mission.council.length === 0 ? "TOP 6" : `#${candidateRank}`;
  const candidateRankDetail =
    mission.council.length === 0
      ? ""
      : openCouncilSlots > 0
        ? `You'd be ranked #${candidateRank} because there ${openCouncilSlots === 1 ? "is" : "are"} still ${
            openCouncilSlots
          } free council ${openCouncilSlots === 1 ? "spot" : "spots"}.`
        : candidateRank <= 6
          ? "You would be in the current top 6 council."
          : `Increase your ${mission.tokenSymbol} balance to reach the top 6.`;
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);

  useEffect(() => {
    setModalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!wallet.address) {
      setWalletTokenBalance(null);
      return;
    }

    let alive = true;
    api
      .getMissionBalances(mission.id, wallet.address)
      .then((balances) => {
        if (alive) setWalletTokenBalance(balances.missionToken);
      })
      .catch(() => {
        if (alive) setWalletTokenBalance(null);
      });

    return () => {
      alive = false;
    };
  }, [mission.id, wallet.address]);

  useEffect(() => {
    if (!wallet.address) {
      setWalletProfile(null);
      return;
    }

    let alive = true;
    api
      .getProfile(wallet.address, { summary: true })
      .then(({ profile }) => {
        if (alive) setWalletProfile(profile);
      })
      .catch(() => {
        if (alive) setWalletProfile(null);
      });

    return () => {
      alive = false;
    };
  }, [wallet.address]);

  useEffect(() => {
    const addresses = Array.from(new Set(mission.council.map((member) => member.address))).filter(Boolean);
    if (addresses.length === 0) {
      setCouncilProfiles({});
      return;
    }

    let alive = true;
    Promise.all(
      addresses.map((address) =>
        api
          .getProfile(address, { summary: true })
          .then(({ profile }) => [address.toLowerCase(), profile] as const)
          .catch(() => null),
      ),
    ).then((entries) => {
      if (!alive) return;
      setCouncilProfiles(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, api.Profile] => Boolean(entry))),
      );
    });

    return () => {
      alive = false;
    };
  }, [mission.council]);

  const displayedCouncil = useMemo(() => {
    const members = mission.council.map((member) => {
      const profile = councilProfiles[member.address.toLowerCase()];
      const isWalletMember = wallet.address && member.address.toLowerCase() === wallet.address.toLowerCase();
      const displayProfile = isWalletMember ? (walletProfile ?? profile) : profile;

      return {
        ...member,
        name: isWalletMember ? "You" : displayProfile?.name || member.name,
        avatar: displayProfile?.avatar || member.avatar,
        description: displayProfile ? displayProfile.description || undefined : member.description,
        tokens: isWalletMember && trackedBalance > 0 ? trackedBalance : member.tokens,
      };
    });
    const registeredAddress = registeredCandidateAddress || wallet.address;
    const isKnownCandidate =
      registeredAddress && members.some((member) => member.address.toLowerCase() === registeredAddress.toLowerCase());

    if (registeredCandidateAddress && registeredAddress && !isKnownCandidate) {
      members.push({
        id: `${mission.id}-${registeredAddress}`,
        name: "You",
        address: registeredAddress,
        avatar: walletProfile?.avatar || "",
        description: walletProfile?.description || undefined,
        tokens: trackedBalance,
        ownership: 0,
      });
    }

    return members
      .sort((left, right) => right.tokens - left.tokens)
      .slice(0, 6);
  }, [councilProfiles, mission.council, mission.id, registeredCandidateAddress, trackedBalance, wallet.address, walletProfile]);

  const councilSlots = useMemo<Array<Investor | null>>(
    () => Array.from({ length: 6 }, (_, index) => displayedCouncil[index] ?? null),
    [displayedCouncil],
  );
  const isRegisteredCandidate =
    Boolean(wallet.address && registeredCandidateAddress?.toLowerCase() === wallet.address.toLowerCase()) ||
    Boolean(wallet.address && mission.council.some((member) => member.address.toLowerCase() === wallet.address?.toLowerCase()));

  useEffect(() => {
    if (!isCandidateModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCandidateModalOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCandidateModalOpen]);

  const register = async () => {
    if (isRegistering) return;
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    setIsRegistering(true);
    try {
      setStatus(null);
      setRegistrationSucceeded(false);
      const result = await api.registerCouncilCandidate(mission.id);
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      if (signature) {
        setRegisteredCandidateAddress(wallet.address);
        setRegistrationSucceeded(true);
        window.setTimeout(() => setRegistrationSucceeded(false), 1600);
        setIsCandidateModalOpen(false);
        // Pull the latest mission so the council list shows the registered
        // candidate with their actual profile avatar from the database, not
        // the optimistic placeholder.
        api
          .getMission(mission.id, { refresh: true })
          .then((next) => onMissionChange?.(next.mission))
          .catch(() => {});
      } else {
        if (result.transaction.status === "not_configured" && result.transaction.message.includes("already registered")) {
          setRegisteredCandidateAddress(wallet.address);
          setStatus(null);
          setIsCandidateModalOpen(false);
        } else {
          setStatus(result.transaction.status === "not_configured" ? result.transaction.message : "Registration recorded. Waiting for on-chain confirmation.");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed.";
      if (message.includes("already registered")) {
        setRegisteredCandidateAddress(wallet.address);
        setStatus(null);
        setIsCandidateModalOpen(false);
      } else {
        setStatus(message);
      }
    } finally {
      setIsRegistering(false);
    }
  };
  const candidateModal = isCandidateModalOpen ? (
    <div className="modal-backdrop" role="presentation" onClick={() => setIsCandidateModalOpen(false)}>
      <div className="glass-card candidate-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Council candidacy</p>
            <h2 id="candidate-modal-title">Become councillor</h2>
            <p>Your current balance determines where you would rank among registered members.</p>
          </div>
        </div>
        <div className="candidate-metric-grid">
          <div className="candidate-metric-card">
            <span className="stat-label">Your current balance</span>
            <strong>
              {number(trackedBalance)} {mission.tokenSymbol}
            </strong>
          </div>
          <div className="candidate-metric-card">
            <span className="stat-label">Rank if you register</span>
            <strong>{candidateRankLabel}</strong>
            {candidateRankDetail ? <small>{candidateRankDetail}</small> : null}
          </div>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={() => setIsCandidateModalOpen(false)}>
            Cancel
          </button>
          <button className="button button-primary" type="button" disabled={isRegistering} onClick={() => void register()}>
            {isRegistering ? "Registering..." : wallet.address ? "Register" : "Sign in to register"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <GlassCard className="section-card">
      <div className="section-heading">
        <div>
          <h2>Treasury Council</h2>
          <p>
            This mission&apos;s treasury council is made up of the top 6 registered investors. Trading fees are distributed between
            registered investors.
          </p>
        </div>
        <div className="council-actions">
          <StatusPill tone="council">4/6 approvals required to access treasury</StatusPill>
          <button className="button button-primary" disabled={isRegisteredCandidate} onClick={() => setIsCandidateModalOpen(true)}>
            {isRegisteredCandidate ? "Registered" : wallet.address ? "Register" : "Sign in to register"}
          </button>
        </div>
      </div>
      {registrationSucceeded ? (
        <p className="stat-note">Success <InlineSuccess /></p>
      ) : status ? (
        <p className="stat-note">{status}</p>
      ) : null}
      <div className="council-grid">
        {councilSlots.map((member, index) => (
          member ? (
            <CouncilMemberFlipCard
              index={index}
              isCurrentUser={Boolean(wallet.address && member.address.toLowerCase() === wallet.address.toLowerCase())}
              key={member.id}
              member={member}
              symbol={mission.tokenSymbol}
              tokenImage={mission.tokenImage}
            />
          ) : (
            <CouncilPlaceholderCard index={index} key={`placeholder-${index}`} />
          )
        ))}
      </div>
      {modalRoot && candidateModal ? createPortal(candidateModal, modalRoot) : null}
    </GlassCard>
  );
}

function FundingRequests({ mission, onMissionChange }: { mission: Mission; onMissionChange?: (mission: Mission) => void }) {
  const counts = useMemo(() => {
    const byStatus: Record<RequestStatus, number> = { active: 0, accepted: 0, rejected: 0, expired: 0 };
    for (const request of mission.requests) {
      if (request.status in byStatus) byStatus[request.status as RequestStatus] += 1;
    }
    return byStatus;
  }, [mission.requests]);
  const [tab, setTab] = useState<RequestStatus | "all">("active");
  const visible = mission.requests.filter((request) => tab === "all" || request.status === tab);
  const refresh = async () => {
    const next = await api.getMission(mission.id, { refresh: true });
    onMissionChange?.(next.mission);
  };
  return (
    <GlassCard className="section-card">
      <div className="section-heading">
        <div>
          <h2>Funding Requests</h2>
          <p>Builders can request treasury funds for work that advances the mission.</p>
        </div>
        <Link className="button button-primary" href={`/missions/${mission.id}/request-funding`}>
          Create funding request
        </Link>
      </div>
      <div className="tab-row" style={{ marginBottom: "1rem" }}>
        {(["active", "accepted", "rejected", "all"] as const).map((entry) => {
          const count = entry === "all" ? mission.requests.length : counts[entry as RequestStatus] || 0;
          return (
            <button className={cx("filter-pill", tab === entry && "active")} key={entry} onClick={() => setTab(entry)}>
              {entry}
              {count > 0 ? <span style={{ marginLeft: 6, opacity: 0.7 }}>({count})</span> : null}
            </button>
          );
        })}
      </div>
      <div className="request-list">
        {visible.map((request) => (
          <FundingRequestCard key={request.id} request={request} symbol={mission.tokenSymbol} onChange={refresh} />
        ))}
      </div>
    </GlassCard>
  );
}

function FundingRequestCard({ request, symbol, onChange }: { request: FundingRequest; symbol: string; onChange?: () => Promise<void> | void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"vote" | "execute" | null>(null);
  const [isPaid, setIsPaid] = useState(Boolean(request.paid));
  const wallet = useSingularityWallet();
  const requesterLabel = request.requester.length > 20 ? shortAddress(request.requester) : request.requester;
  useEffect(() => {
    setIsPaid(Boolean(request.paid));
  }, [request.paid]);
  const vote = async (choice: "approve" | "reject") => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    setBusy("vote");
    try {
      const result = await api.voteFundingRequest(request.id, choice);
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      setStatus(signature ? `Vote submitted: ${shortAddress(signature)}` : result.transaction.status === "not_configured" ? result.transaction.message : "Vote recorded.");
      await onChange?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Vote failed.");
    } finally {
      setBusy(null);
    }
  };
  const execute = async () => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    setBusy("execute");
    try {
      const result = await api.executeFundingRequest(request.id);
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      if (signature) {
        setIsPaid(true);
        try {
          const confirmed = await api.confirmFundingRequestExecution(request.id, { signature });
          setIsPaid(Boolean(confirmed.request.paid));
          setStatus(`Execution submitted: ${shortAddress(signature)}`);
        } catch {
          setStatus(`Execution submitted: ${shortAddress(signature)}. Payment confirmation is pending.`);
        }
        await onChange?.();
        return;
      }
      setStatus(
        result.transaction.status === "not_configured"
          ? result.transaction.message
          : "Execution recorded.",
      );
      await onChange?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Execution failed.");
    } finally {
      setBusy(null);
    }
  };
  const dots = Array.from({ length: 6 }, (_, index) => {
    if (index < request.approvals) return "yes";
    if (index < request.approvals + request.rejections) return "no";
    return "";
  });
  return (
    <GlassCard className={cx("request-card interactive", isExpanded && "expanded")}>
      <button className="request-card-toggle" type="button" onClick={() => setIsExpanded((current) => !current)} aria-expanded={isExpanded}>
        <div className="request-summary">
          <div className="request-status-row">
            <StatusPill tone={request.status}>{request.status}</StatusPill>
            {request.status === "accepted" ? <StatusPill tone={isPaid ? "success" : "warning"}>{isPaid ? "paid" : "not paid"}</StatusPill> : null}
          </div>
          <div className="request-title">{request.name}</div>
          <div className="request-meta">
            <span className="avatar" style={{ width: 26, height: 26 }}>
              <img src={request.requesterAvatar} alt="" decoding="async" loading="lazy" />
            </span>
            <span className="request-requester" title={request.requester}>
              {requesterLabel}
            </span>
          </div>
        </div>
        <div className="request-amount">
          <span className="stat-label">Amount</span>
          <div className="stat-value">{money(request.amountUsd)}</div>
          <div className="stat-note">
            {number(request.tokenAmount, true)} {symbol}
          </div>
        </div>
        <div className="request-votes">
          <div className="vote-dots">
            {dots.map((dot, index) => (
              <span className={cx("vote-dot", dot)} key={`${request.id}-${index}`} />
            ))}
          </div>
          <div className="stat-note">
            {request.approvals} approved / {request.rejections} rejected
          </div>
          <div className="stat-note">{request.timeLeft}</div>
        </div>
      </button>
      {isExpanded ? (
        <div className="request-expanded-panel">
          <div>
            <span className="stat-label">Request details</span>
            <p>{request.description}</p>
          </div>
          <div className="request-detail-grid">
            <div>
              <span className="stat-label">Treasury draw</span>
              <div className="stat-value">{money(request.amountUsd)}</div>
              <div className="stat-note">
                Paid as {number(request.tokenAmount, true)} {symbol}
              </div>
            </div>
            <div>
              <span className="stat-label">Council threshold</span>
              <div className="stat-value">4 / 6</div>
              <div className="stat-note">{request.timeLeft}</div>
            </div>
          </div>
          <div className="request-action-row">
            {/* TODO: Show these actions only to top investors/council members; everyone else should see the expanded request without voting controls. */}
            {request.status === "active" ? (
              <>
                <button className="button button-danger" type="button" onClick={() => void vote("reject")} disabled={busy !== null}>
                  Reject request
                </button>
                <button className="button button-primary" type="button" onClick={() => void vote("approve")} disabled={busy !== null}>
                  Approve request
                </button>
              </>
            ) : request.status === "accepted" && !isPaid ? (
              <button className="button button-primary" type="button" onClick={() => void execute()} disabled={busy !== null}>
                {busy === "execute" ? "Submitting..." : "Execute payout"}
              </button>
            ) : null}
          </div>
          {request.status === "accepted" ? (
            <p className="stat-note">
              {isPaid
                ? `Payout executed${request.paidAt ? ` on ${new Date(request.paidAt).toLocaleDateString()}` : ""}.`
                : `Execution releases ${number(request.tokenAmount, true)} ${symbol} from the treasury once the 3-day voting window has elapsed. Earlier attempts will be rejected by the program.`}
            </p>
          ) : null}
          {status ? <p className="stat-note">{status}</p> : null}
        </div>
      ) : null}
    </GlassCard>
  );
}

function capitalizationBreakdown(mission: Mission) {
  const treasuryTokens = mission.treasuryTokens;
  const tradableSupply = Math.max(mission.totalSupply - treasuryTokens, 0);
  const inferredMarketTokens =
    mission.tokenPrice > 0 && mission.liquidity > 0
      ? Math.max(0, Math.min(mission.liquidity / mission.tokenPrice, tradableSupply))
      : tradableSupply;
  const marketTokens = mission.marketTokens ?? inferredMarketTokens;
  const investorTokens = mission.circulatingTokens ?? Math.max(tradableSupply - marketTokens, 0);
  const treasuryValue =
    Number.isFinite(mission.treasuryUsdc) && mission.treasuryUsdc > 0
      ? mission.treasuryUsdc
      : treasuryTokens * mission.tokenPrice;

  return {
    investorTokens,
    treasuryTokens,
    marketTokens,
    marketCapValue: mission.totalSupply * mission.tokenPrice,
    treasuryValue,
    marketValue: marketTokens * mission.tokenPrice,
  };
}

function TreasuryPanel({ mission, onMissionChange }: { mission: Mission; onMissionChange?: (mission: Mission) => void }) {
  const { marketCapValue, marketTokens, treasuryTokens, treasuryValue } = capitalizationBreakdown(mission);
  const wallet = useSingularityWallet();
  const [claimPending, setClaimPending] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);
  const totalSupplyAmount = `${number(mission.totalSupply)} ${mission.tokenSymbol}`;
  const treasuryTokenAmount = `${number(treasuryTokens)} ${mission.tokenSymbol}`;
  const marketTokenAmount = `${number(marketTokens)} ${mission.tokenSymbol}`;
  const headlineMoney = (value: number) => money(value, false, 1);
  const canClaimTreasuryAllocation =
    mission.lifecycle === "graduated" && Boolean(mission.dbcPool && mission.treasuryVault) && mission.treasuryAllocationClaimed !== true;
  const claimTreasuryAllocation = async () => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    try {
      setClaimPending(true);
      setClaimStatus("Preparing treasury allocation claim...");
      const result = await api.prepareMissionTreasuryAllocationClaim(mission.id);
      if (result.transaction.status !== "ready") {
        setClaimStatus(result.transaction.message);
        return;
      }
      setClaimStatus("Approve the treasury allocation claim in your wallet...");
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      if (!signature) {
        setClaimStatus("Treasury allocation claim was not submitted.");
        return;
      }
      setClaimStatus("Treasury allocation submitted. Refreshing mission...");
      const confirmed = await api.confirmMissionTreasuryAllocationClaim(mission.id, { signature });
      onMissionChange?.(confirmed.mission);
      setClaimStatus("Treasury allocation claimed.");
    } catch (error) {
      setClaimStatus(error instanceof Error ? error.message : "Treasury allocation claim failed.");
    } finally {
      setClaimPending(false);
    }
  };

  return (
    <GlassCard className="section-card">
      <div className="section-heading">
        <div>
          <span className="stat-label">Treasury and market</span>
          <h2>Capitalization</h2>
        </div>
      </div>
      <div className="treasury-market-grid">
        <div>
          <span className="stat-label">Market Capitalization</span>
          <div className="stat-value">{headlineMoney(marketCapValue)}</div>
          <div className="stat-note" title={totalSupplyAmount}>
            {number(mission.totalSupply, true)} {mission.tokenSymbol}
          </div>
        </div>
        <div>
          <span className="stat-label">Treasury</span>
          <div className="stat-value">{headlineMoney(treasuryValue)}</div>
          <div className="stat-note" title={treasuryTokenAmount}>
            {number(treasuryTokens, true)} {mission.tokenSymbol}
          </div>
        </div>
        <div>
          <span className="stat-label">Liquidity</span>
          <div className="stat-value">{headlineMoney(mission.liquidity)}</div>
          <div className="stat-note" title={marketTokenAmount}>
            {number(marketTokens, true)} {mission.tokenSymbol}
          </div>
        </div>
      </div>
      <TreasuryMarketDonut mission={mission} />
      <p className="stat-note">
        The treasury is reserved for funding work that advances this mission. Liquidity shows how much value is available for buying and selling in the market.
      </p>
      {canClaimTreasuryAllocation ? (
        <>
          {claimStatus ? <p className="stat-note">{claimStatus}</p> : null}
          <button className="button" type="button" disabled={claimPending} style={{ width: "100%" }} onClick={() => void claimTreasuryAllocation()}>
            {claimPending ? <InlineLoader /> : "Claim treasury allocation"}
          </button>
        </>
      ) : null}
    </GlassCard>
  );
}

function TreasuryMarketDonut({ mission }: { mission: Mission }) {
  const [active, setActive] = useState<"investors" | "treasury" | "market">("market");
  const { investorTokens, marketTokens, treasuryTokens } = capitalizationBreakdown(mission);
  const chartData = [
    { key: "market" as const, name: "Liquidity pool", value: marketTokens, gradient: "url(#marketGradient)" },
    { key: "investors" as const, name: "Investors", value: investorTokens, gradient: "url(#investorsGradient)" },
    { key: "treasury" as const, name: "Treasury", value: treasuryTokens, gradient: "url(#treasuryGradient)" },
  ];
  const activeEntry = chartData.find((entry) => entry.key === active) ?? chartData[0];
  const activePercentage = mission.totalSupply > 0 ? (activeEntry.value / mission.totalSupply) * 100 : 0;

  return (
    <div className={`treasury-donut-card active-${active}`}>
      <div className="donut-heading">
        <h3>Token holder distribution</h3>
        <p>(total supply)</p>
      </div>
      <div className="donut-visual">
        <ResponsiveContainer width="100%" height={238}>
          <PieChart>
            <defs>
              <linearGradient id="investorsGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6ee7f9" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <linearGradient id="marketGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9c8cff" />
                <stop offset="100%" stopColor="#6258ff" />
              </linearGradient>
              <linearGradient id="treasuryGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff876d" />
                <stop offset="100%" stopColor="#ff5d3d" />
              </linearGradient>
            </defs>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={64}
              outerRadius={94}
              paddingAngle={2}
              cornerRadius={9}
              stroke="rgba(255,247,237,0.16)"
              strokeWidth={1}
              isAnimationActive={false}
              onMouseEnter={(_, index) => setActive(chartData[index]?.key ?? "market")}
            >
              {chartData.map((entry) => (
                <Cell
                  className={cx("capitalization-slice", active === entry.key && "active")}
                  fill={entry.gradient}
                  key={entry.key}
                  opacity={active === entry.key ? 1 : 0.54}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span>{activeEntry.name}</span>
          <strong>{number(activePercentage)}%</strong>
        </div>
      </div>
      <div className="donut-legend">
        <button className={cx("legend-item", active === "market" && "active")} onMouseEnter={() => setActive("market")} onFocus={() => setActive("market")}>
          <span className="legend-dot market-dot" />
          Pool
        </button>
        <button className={cx("legend-item", active === "investors" && "active")} onMouseEnter={() => setActive("investors")} onFocus={() => setActive("investors")}>
          <span className="legend-dot investors-dot" />
          Investors
        </button>
        <button className={cx("legend-item", active === "treasury" && "active")} onMouseEnter={() => setActive("treasury")} onFocus={() => setActive("treasury")}>
          <span className="legend-dot treasury-dot" />
          Treasury
        </button>
      </div>
    </div>
  );
}

function LaunchTokenomicsDonut() {
  const [active, setActive] = useState<"market" | "treasury">("market");
  const chartData = [
    { key: "market" as const, name: "Market", value: 80, gradient: "url(#launchMarketGradient)" },
    { key: "treasury" as const, name: "Treasury", value: 20, gradient: "url(#launchTreasuryGradient)" },
  ];
  const activeEntry = chartData.find((entry) => entry.key === active) ?? chartData[0];

  return (
    <div className={`treasury-donut-card active-${active}`}>
      <div className="donut-heading">
        <h3>Token allocation</h3>
        <p>(launch supply)</p>
      </div>
      <div className="donut-visual">
        <ResponsiveContainer width="100%" height={238}>
          <PieChart>
            <defs>
              <linearGradient id="launchMarketGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9c8cff" />
                <stop offset="100%" stopColor="#6258ff" />
              </linearGradient>
              <linearGradient id="launchTreasuryGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff876d" />
                <stop offset="100%" stopColor="#ff5d3d" />
              </linearGradient>
            </defs>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={64}
              outerRadius={94}
              paddingAngle={2}
              cornerRadius={9}
              stroke="rgba(255,247,237,0.16)"
              strokeWidth={1}
              isAnimationActive
              animationDuration={700}
              onClick={(_, index) => setActive(chartData[index]?.key ?? "market")}
              onMouseEnter={(_, index) => setActive(chartData[index]?.key ?? "market")}
            >
              {chartData.map((entry) => (
                <Cell
                  className={cx("capitalization-slice", active === entry.key && "active")}
                  fill={entry.gradient}
                  key={entry.key}
                  opacity={active === entry.key ? 1 : 0.54}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span>{activeEntry.name}</span>
          <strong>{activeEntry.value}%</strong>
        </div>
      </div>
      <div className="donut-legend">
        <button className={cx("legend-item", active === "market" && "active")} type="button" onMouseEnter={() => setActive("market")} onFocus={() => setActive("market")}>
          <span className="legend-dot market-dot" />
          Market
        </button>
        <button className={cx("legend-item", active === "treasury" && "active")} type="button" onMouseEnter={() => setActive("treasury")} onFocus={() => setActive("treasury")}>
          <span className="legend-dot treasury-dot" />
          Treasury
        </button>
      </div>
    </div>
  );
}

function InlineLoader() {
  return (
    <span className="inline-loader" aria-label="Loading">
      <span />
      <span />
      <span />
    </span>
  );
}

export function PageLoader({ className }: { className?: string }) {
  return (
    <GlassCard className={cx("section-card page-loader-card", className)} aria-busy="true" aria-live="polite">
      <div className="page-loader-content">
        <div className="singularity-loader" aria-hidden="true">
          <span className="loader-orbit loader-orbit-one" />
          <span className="loader-orbit loader-orbit-two" />
          <span className="loader-core" />
        </div>
        <strong className="page-loader-title">Loading</strong>
      </div>
    </GlassCard>
  );
}

function InlineSuccess() {
  return (
    <span className="inline-success" aria-label="Success">
      ✓
    </span>
  );
}

function formatPriceImpactPercent(value: number) {
  if (!Number.isFinite(value)) return "Unavailable";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  if (absoluteValue > 0 && absoluteValue < 0.01) return `${sign}<0.01%`;
  return `${sign}${number(absoluteValue)}%`;
}

function PriceImpactHelp() {
  return (
    <span className="price-impact-help" tabIndex={0} aria-label="Price impact compares this trade with the normal price. Plus means you get more. Minus means you get less.">
      ?
      <span className="price-impact-tooltip" role="tooltip">
        Compared to the normal price: + means you get more, - means you get less.
      </span>
    </span>
  );
}

function TradePanel({ mission, onMissionChange }: { mission: Mission; onMissionChange?: (mission: Mission) => void }) {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<api.MissionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [balances, setBalances] = useState<api.MissionBalances | null>(null);
  const [balancesError, setBalancesError] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tradePending, setTradePending] = useState(false);
  const [tradeSucceeded, setTradeSucceeded] = useState(false);
  const [graduationPending, setGraduationPending] = useState(false);
  const prewarmedMarketRef = useRef<string | null>(null);
  const quoteRequestRef = useRef(0);
  const wallet = useSingularityWallet();
  const numeric = Number(amount) || 0;
  const hasAmount = numeric > 0;
  const marketGraduationReady = mission.lifecycle === "bonding" && !mission.dammPool && (mission.poolProgressPercent || 0) >= 100;
  const activeBalance = mode === "buy" ? balances?.usdc : balances?.missionToken;
  const activeBalanceLabel = mode === "buy" ? "USDC balance" : `${mission.tokenSymbol} balance`;
  // While the wallet is connected but we have not yet successfully fetched
  // balances (and have not errored out), keep showing a loader instead of "0".
  // This avoids flashing a stale 0 right after navigating to a freshly created
  // mission, where the first fetch hasn't returned yet.
  const balancesLoading = Boolean(wallet.address) && !balances && !balancesError;
  const approximateQuote = useCallback(
    (side: "buy" | "sell", inputAmount: number): api.MissionQuote | null => {
      if (!Number.isFinite(mission.tokenPrice) || mission.tokenPrice <= 0 || inputAmount <= 0) return null;
      const estimatedOutput = side === "buy" ? inputAmount / mission.tokenPrice : inputAmount * mission.tokenPrice;
      const minimumAmountOut = estimatedOutput * 0.99;

      return {
        missionId: mission.id,
        side,
        route: "estimate",
        inputAmount,
        estimatedOutput,
        minimumAmountOut,
        priceImpactPercent: null,
        currentPrice: mission.tokenPrice,
        market: {
          lifecycle: mission.lifecycle,
          tokenMint: mission.tokenMint,
          dbcPool: mission.dbcPool,
          dammPool: mission.dammPool,
        },
        transaction: {
          kind: "trade",
          status: "not_configured",
          message: "Preparing exact quote...",
        },
      };
    },
    [mission.dbcPool, mission.dammPool, mission.id, mission.lifecycle, mission.tokenMint, mission.tokenPrice],
  );
  const refreshBalances = useCallback(async () => {
    if (!wallet.address) {
      setBalances(null);
      setBalancesError(false);
      return null;
    }

    setBalancesError(false);
    try {
      const next = await api.getMissionBalances(mission.id, wallet.address);
      setBalances(next);
      return next;
    } catch {
      setBalances(null);
      setBalancesError(true);
      return null;
    }
  }, [mission.id, wallet.address]);
  const requestQuote = async (options: { prepareTransaction?: boolean } = {}) => {
    if (!hasAmount) {
      setQuote(null);
      setQuoteLoading(false);
      return null;
    }
    const requestId = quoteRequestRef.current + 1;
    quoteRequestRef.current = requestId;
    let fallbackTimer: number | null = null;
    try {
      setQuoteLoading(true);
      fallbackTimer = options.prepareTransaction
        ? null
        : window.setTimeout(() => {
            if (quoteRequestRef.current !== requestId) return;
            const fallbackQuote = approximateQuote(mode, numeric);
            if (!fallbackQuote) return;
            setQuote(fallbackQuote);
            setQuoteLoading(false);
            setStatus(null);
          }, 220);
      const next = await api.getMissionQuote(mission.id, { side: mode, amount: numeric, wallet: options.prepareTransaction ? wallet.address : undefined });
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(next);
      const quoteStatus =
        next.partialFill && next.requestedInputAmount && next.inputAmount < next.requestedInputAmount
          ? `This purchase will use ${money(next.inputAmount)} USDC, the remaining bonding-curve capacity, and should trigger graduation.`
          : null;
      if (next.transaction.status !== "ready") {
        if (options.prepareTransaction || next.estimatedOutput <= 0) {
          setStatus(next.transaction.message);
          return null;
        }
        setStatus(quoteStatus);
        return next;
      }
      setStatus(quoteStatus);
      return next;
    } catch (error) {
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(null);
      setStatus(error instanceof Error ? error.message : "Quote failed.");
      return null;
    } finally {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (quoteRequestRef.current === requestId) setQuoteLoading(false);
    }
  };
  const trade = async () => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    try {
      setStatus(null);
      setTradeSucceeded(false);
      setTradePending(true);
      const nextQuote = await requestQuote({ prepareTransaction: true });
      if (nextQuote?.transaction.status !== "ready") return;
      const signature = await wallet.sendPreparedTransaction(nextQuote?.transaction);
      if (signature) {
        setQuote(null);
        setAmount("");
        const [refreshed] = await Promise.all([api.getMission(mission.id, { refresh: true }), refreshBalances()]);
        onMissionChange?.(refreshed.mission);
        setTradeSucceeded(true);
        window.setTimeout(() => setTradeSucceeded(false), 1600);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setTradePending(false);
    }
  };
  const graduateMarket = async () => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    try {
      setStatus("Preparing market graduation...");
      setGraduationPending(true);
      const result = await api.prepareMissionMarketGraduation(mission.id);
      if (result.transaction.status !== "ready") {
        setStatus(result.transaction.message);
        return;
      }
      if (!result.dammPool) {
        setStatus("Market graduation was prepared but no AMM pool address was returned.");
        return;
      }
      setStatus("Approve the market graduation transaction in your wallet...");
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      if (!signature) {
        setStatus("Market graduation transaction was not submitted.");
        return;
      }
      setStatus("Market graduation submitted. Recording AMM route...");
      const confirmed = await api.confirmMissionMarketGraduation(mission.id, { signature, dammPool: result.dammPool });
      onMissionChange?.(confirmed.mission);
      setQuote(null);
      setStatus("Market graduated. Buy and sell now route through the AMM.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Market graduation failed.");
    } finally {
      setGraduationPending(false);
    }
  };

  useEffect(() => {
    setQuote(null);
    if (!hasAmount) {
      setQuoteLoading(false);
      return;
    }
    setQuoteLoading(true);
    const timer = window.setTimeout(() => void requestQuote(), 350);
    return () => window.clearTimeout(timer);
  }, [amount, mode, mission.id, hasAmount]);

  useEffect(() => {
    if (mission.lifecycle !== "graduated" || !mission.dammPool || !mission.tokenMint) return;
    const prewarmKey = `${mission.id}:${mission.dammPool}`;
    if (prewarmedMarketRef.current === prewarmKey) return;
    prewarmedMarketRef.current = prewarmKey;

    const timer = window.setTimeout(() => {
      void api.getMissionQuote(mission.id, { side: "buy", amount: 1 }).catch(() => {
        prewarmedMarketRef.current = null;
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [mission.id, mission.lifecycle, mission.dammPool, mission.tokenMint]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  const minimumReceived =
    quote?.minimumAmountOut === null || quote?.minimumAmountOut === undefined
      ? null
      : mode === "buy"
        ? `${number(quote.minimumAmountOut)} ${mission.tokenSymbol}`
        : `${money(quote.minimumAmountOut)} USDC`;
  const hasExactPriceImpact = quote?.route !== "estimate" && quote?.priceImpactPercent !== null && quote?.priceImpactPercent !== undefined;
  const quoteUnavailable = hasAmount && !quoteLoading && quote?.transaction.status === "not_configured" && quote.estimatedOutput <= 0;
  const minimumReceivedLabel = quoteLoading ? <InlineLoader /> : quoteUnavailable || !minimumReceived ? "Unavailable" : minimumReceived;
  const priceImpactLabel = hasExactPriceImpact ? formatPriceImpactPercent(quote.priceImpactPercent as number) : null;
  const cappedBuyLabel =
    mode === "buy" && quote?.partialFill && quote.requestedInputAmount && quote.inputAmount < quote.requestedInputAmount
      ? `${money(quote.inputAmount)} USDC of ${money(quote.requestedInputAmount)} requested`
      : null;

  return (
    <GlassCard className="section-card">
      <div className="trade-toggle">
        <button className={cx("filter-pill", mode === "buy" && "active")} onClick={() => setMode("buy")}>
          Buy
        </button>
        <button className={cx("filter-pill", mode === "sell" && "active")} onClick={() => setMode("sell")}>
          Sell
        </button>
      </div>
      <label>
        <span className="form-label">{mode === "buy" ? "USDC amount" : `${mission.tokenSymbol} amount`}</span>
        <input
          className="field"
          inputMode="decimal"
          placeholder={mode === "buy" ? "0.00" : "0"}
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <p className="stat-note">
        {activeBalanceLabel}:{" "}
        {wallet.address && !balancesLoading && (activeBalance || 0) > 0 ? (
          <button
            type="button"
            className="balance-prefill"
            onClick={() => setAmount(String(activeBalance ?? 0))}
            title="Use full balance"
          >
            <strong>{`${number(activeBalance || 0)} ${mode === "buy" ? "USDC" : mission.tokenSymbol}`}</strong>
          </button>
        ) : (
          <strong>
            {wallet.address
              ? balancesLoading
                ? <InlineLoader />
                : balancesError
                  ? "Unavailable"
                  : `${number(activeBalance || 0)} ${mode === "buy" ? "USDC" : mission.tokenSymbol}`
              : "Sign in to view"}
          </strong>
        )}
      </p>
      {marketGraduationReady ? (
        <p className="stat-note">Graduate this market to AMM trading before the next buy or sell.</p>
      ) : hasAmount ? (
        <>
          {cappedBuyLabel ? <p className="stat-note">Available purchase: {cappedBuyLabel}</p> : null}
          <p className="stat-note">Minimum received: {minimumReceivedLabel}</p>
          {priceImpactLabel ? <p className="stat-note">Price impact <PriceImpactHelp />: {priceImpactLabel}</p> : null}
        </>
      ) : null}
      {tradePending ? null : tradeSucceeded ? (
        <p className="stat-note">Success <InlineSuccess /></p>
      ) : status ? (
        <p className="stat-note">{status}</p>
      ) : null}
      <button
        className={cx("button", mode === "buy" ? "button-primary" : "button-danger")}
        disabled={tradePending || graduationPending || (!marketGraduationReady && quoteUnavailable)}
        style={{ width: "100%" }}
        onClick={() => void (marketGraduationReady ? graduateMarket() : trade())}
      >
        {tradePending || graduationPending ? <InlineLoader /> : wallet.address ? (marketGraduationReady ? "Graduate market" : mode === "buy" ? "Buy tokens" : "Sell tokens") : "Sign in to trade"}
      </button>
    </GlassCard>
  );
}

export function LaunchMissionPage() {
  const router = useRouter();
  const wallet = useSingularityWallet();
  const [symbol, setSymbol] = useState("");
  const [statement, setStatement] = useState("");
  const [description, setDescription] = useState("");
  const [initialPurchaseUsdc, setInitialPurchaseUsdc] = useState("0");
  const [missionImage, setMissionImage] = useState(defaultMissionImage);
  const [tokenImage, setTokenImage] = useState(defaultTokenImage);
  const [missionImageFile, setMissionImageFile] = useState<File | null>(null);
  const [tokenImageFile, setTokenImageFile] = useState<File | null>(null);
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null);
  const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [launchSucceeded, setLaunchSucceeded] = useState(false);
  const previewSymbol = symbol || "NOVA";
  const previewMission: Mission = {
    id: "preview",
    statement: statement || "Coordinate the first open-source lunar robotics network.",
    tokenSymbol: previewSymbol,
    description: description || "Live preview of how your mission will appear in discovery.",
    image: missionImage,
    tokenImage,
    tokenPrice: 0.001,
    liquidity: 10000,
    holders: 1800,
    treasuryUsdc: 0,
    treasuryTokens: 10_000_000,
    treasurySupplyPercent: 20,
    totalSupply: 50_000_000,
    performance: previewPerformance,
    council: [],
    requests: [],
  };
  const openCropper = (kind: CropKind, url: string, file: File) => {
    setCropRequest({
      kind,
      label: kind === "mission" ? "Crop mission image" : "Crop token image",
      sourceUrl: url,
      file,
      aspectRatio: kind === "mission" ? 16 / 10 : 1,
      outputWidth: kind === "mission" ? 1600 : 800,
      outputHeight: kind === "mission" ? 1000 : 800,
      shape: kind === "mission" ? "rect" : "circle",
    });
  };
  const applyCroppedImage = ({ url, file, kind }: { url: string; file: File; kind: CropKind }) => {
    if (kind === "mission") {
      setMissionImage(url);
      setMissionImageFile(file);
    } else {
      setTokenImage(url);
      setTokenImageFile(file);
    }
    setCropRequest(null);
  };
  const launch = async () => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    try {
      setStatus("Preparing mission launch...");
      const uploadedMissionImage = missionImageFile ? (await api.uploadObject({ file: missionImageFile, purpose: "mission-image" })).upload.uri : missionImage;
      const uploadedTokenImage = tokenImageFile ? (await api.uploadObject({ file: tokenImageFile, purpose: "token-image" })).upload.uri : tokenImage;
      const result = await api.prepareMissionLaunch({
        statement,
        description,
        tokenSymbol: symbol,
        missionImage: uploadedMissionImage,
        tokenImage: uploadedTokenImage,
        initialPurchaseUsdc: Number(initialPurchaseUsdc) || 0,
      });
      if (result.transaction.status !== "ready") {
        setStatus(result.transaction.message);
        return;
      }
      if (!result.launchId) {
        setStatus("Mission launch was prepared but no launch id was returned.");
        return;
      }
      setStatus("Approve the launch transaction in your wallet...");
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      if (!signature) {
        setStatus("Mission launch transaction was not submitted.");
        return;
      }
      setStatus("Confirming mission...");
      const confirmed = await api.confirmMissionLaunch({ launchId: result.launchId, signature });
      setStatus(null);
      setLaunchSucceeded(true);
      window.setTimeout(() => router.push(`/missions/${confirmed.mission.id}`), 1200);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Mission launch failed.");
    }
  };

  useEffect(() => {
    setModalRoot(document.body);
  }, []);

  useEffect(() => {
    return () => {
      if (missionImage.startsWith("blob:")) URL.revokeObjectURL(missionImage);
    };
  }, [missionImage]);

  useEffect(() => {
    return () => {
      if (tokenImage.startsWith("blob:")) URL.revokeObjectURL(tokenImage);
    };
  }, [tokenImage]);

  return (
    <AppShell>
      <section className="page-container">
        <PageHeader
          eyebrow="Create"
          title="Launch a mission market"
          description="A mission can be anything: a product, research goal, community, protocol, creative project, public good, or ambitious outcome. Trading fees are shared between the creator, Singularity, councillors, and registered candidates."
        />
        <div className="form-two-col">
          <div>
            <GlassCard className="section-card">
              <div className="section-heading">
                <div>
                  <h2>Tokenomics</h2>
                  <p>New token is created for each mission. 80% tokens go to the market for investors to purchase. 20% is kept in mission&apos;s treasury to fund mission related work.</p>
                </div>
              </div>
              <LaunchTokenomicsDonut />
            </GlassCard>
            <div className="live-preview-stack">
              <span className="preview-label">Preview</span>
              <MissionCard mission={previewMission} preview />
            </div>
          </div>
          <GlassCard className="section-card">
            <div className="form-grid">
              <label>
                <span className="form-label">Mission statement</span>
                <input
                  className="field"
                  maxLength={96}
                  placeholder="Coordinate the first open-source lunar robotics network."
                  value={statement}
                  onChange={(event) => setStatement(event.target.value)}
                />
              </label>
              <UploadBox
                label="Mission image"
                note="Upload any image, then crop it to 16:10"
                previewSrc={missionImage}
                onFileSelect={(url, file) => {
                  openCropper("mission", url, file);
                }}
              />
              <label>
                <span className="form-label">Mission description</span>
                <textarea
                  className="textarea"
                  maxLength={1200}
                  placeholder="Explain what the mission is, why it matters, and what funded work should advance."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                <span className="form-label">Token symbol</span>
                <input
                  className="field"
                  maxLength={8}
                  placeholder="NOVA"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
              </label>
              <UploadBox
                label="Token image"
                note="Upload any image, then crop it round"
                previewSrc={tokenImage}
                shape="circle"
                onFileSelect={(url, file) => {
                  openCropper("token", url, file);
                }}
              />
              <label>
                <span className="form-label">Initial purchase in USDC (optional)</span>
                <input className="field" placeholder="0" value={initialPurchaseUsdc} onChange={(event) => setInitialPurchaseUsdc(event.target.value)} />
              </label>
              {launchSucceeded ? (
                <p className="stat-note">Success <InlineSuccess /></p>
              ) : status ? (
                <p className="stat-note">{status}</p>
              ) : null}
              <button className="button button-primary" disabled={launchSucceeded} onClick={() => void launch()}>
                {wallet.address ? "Launch mission" : "Sign in to launch"}
              </button>
            </div>
          </GlassCard>
        </div>
        {modalRoot && cropRequest
          ? createPortal(
              <ImageCropper
                request={cropRequest}
                onCancel={() => {
                  URL.revokeObjectURL(cropRequest.sourceUrl);
                  setCropRequest(null);
                }}
                onCropped={applyCroppedImage}
                onError={(message) => setStatus(message)}
              />,
              modalRoot,
            )
          : null}
      </section>
    </AppShell>
  );
}

function imageOutputType(file: File, shape: CropRequest["shape"]) {
  if (shape === "circle") return "image/png";
  return file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp" ? file.type : "image/png";
}

function croppedFileName(file: File, type: string) {
  const extension = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return `${base}-cropped.${extension}`;
}

async function cropImage(request: CropRequest, cropArea: Area) {
  const image = new Image();
  image.decoding = "async";
  image.src = request.sourceUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = request.outputWidth;
  canvas.height = request.outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image crop failed because canvas is unavailable.");

  if (request.shape === "circle") {
    context.save();
    context.beginPath();
    context.arc(request.outputWidth / 2, request.outputHeight / 2, Math.min(request.outputWidth, request.outputHeight) / 2, 0, Math.PI * 2);
    context.clip();
  }

  context.drawImage(image, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, request.outputWidth, request.outputHeight);
  if (request.shape === "circle") context.restore();

  const type = imageOutputType(request.file, request.shape);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("Image crop failed. Try a PNG, JPG, or WEBP image.");
  const file = new File([blob], croppedFileName(request.file, type), { type });
  return { file, url: URL.createObjectURL(file) };
}

function ImageCropper({
  request,
  onCancel,
  onCropped,
  onError,
}: {
  request: CropRequest;
  onCancel: () => void;
  onCropped: (result: { url: string; file: File; kind: CropKind }) => void;
  onError: (message: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [objectFit, setObjectFit] = useState<"cover" | "horizontal-cover" | "vertical-cover">("cover");
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setObjectFit("cover");
    setCroppedAreaPixels(null);
  }, [request.sourceUrl]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isCropping) onCancel();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCropping, onCancel]);

  const handleCropComplete = useCallback((_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels);
  }, []);

  const handleMediaLoaded = useCallback(
    (mediaSize: MediaSize) => {
      const mediaAspect = mediaSize.naturalWidth / mediaSize.naturalHeight;
      setObjectFit(mediaAspect > request.aspectRatio ? "vertical-cover" : "horizontal-cover");
    },
    [request.aspectRatio],
  );

  const apply = async () => {
    if (!croppedAreaPixels) {
      onError("Image crop is still loading. Try again in a moment.");
      return;
    }

    try {
      setIsCropping(true);
      const cropped = await cropImage(request, croppedAreaPixels);
      URL.revokeObjectURL(request.sourceUrl);
      onCropped({ ...cropped, kind: request.kind });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Image crop failed.");
    } finally {
      setIsCropping(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !isCropping && onCancel()}>
      <div className="glass-card image-crop-modal" role="dialog" aria-modal="true" aria-labelledby="image-crop-title" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Image crop</p>
            <h2 id="image-crop-title">{request.label}</h2>
            <p>{request.kind === "mission" ? "Frame the image exactly as it will appear on mission cards and the mission page." : "Frame the token art inside the circular avatar."}</p>
          </div>
        </div>
        <div
          className={cx("crop-preview-frame", request.shape === "circle" && "crop-preview-round")}
          style={{ aspectRatio: `${request.outputWidth} / ${request.outputHeight}` }}
        >
          <Cropper
            image={request.sourceUrl}
            crop={crop}
            zoom={zoom}
            aspect={request.aspectRatio}
            classes={{ mediaClassName: "cropper-media" }}
            cropShape={request.shape === "circle" ? "round" : "rect"}
            maxZoom={3}
            minZoom={1}
            objectFit={objectFit}
            onCropChange={setCrop}
            onCropComplete={handleCropComplete}
            onMediaLoaded={handleMediaLoaded}
            onZoomChange={setZoom}
            restrictPosition
            showGrid={false}
          />
        </div>
        <p className="crop-help">Drag the image to choose the crop. Pinch or scroll over the image to zoom.</p>
        <div className="modal-actions">
          <button className="button" type="button" disabled={isCropping} onClick={onCancel}>
            Cancel
          </button>
          <button className="button button-primary" type="button" disabled={isCropping} onClick={() => void apply()}>
            {isCropping ? "Cropping..." : "Use cropped image"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadBox({
  label,
  note,
  previewSrc,
  shape = "rect",
  onFileSelect,
}: {
  label: string;
  note: string;
  previewSrc?: string;
  shape?: "rect" | "circle";
  onFileSelect?: (url: string, file: File) => void;
}) {
  return (
    <div>
      <span className="form-label">{label}</span>
      <label className={cx("upload-box", shape === "circle" && "upload-box-round")}>
        <input
          accept="image/*"
          className="sr-only"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file || !onFileSelect) return;
            onFileSelect(URL.createObjectURL(file), file);
          }}
        />
        {previewSrc ? <img className="upload-preview-image" src={previewSrc} alt="" decoding="async" /> : null}
        <div>
          <Sparkles size={22} />
          <p>{note}</p>
        </div>
      </label>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <GlassCard className="stat-card">
      <div className="request-title">{title}</div>
      <div className="stat-note">{body}</div>
    </GlassCard>
  );
}

export function RequestFundingPage({ missionId, initialMission }: { missionId: string; initialMission?: Mission | null }) {
  const router = useRouter();
  const wallet = useSingularityWallet();
  const [mission, setMission] = useState<Mission | null>(initialMission ?? null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const loadedMissionId = useRef(initialMission?.id ?? null);
  useEffect(() => {
    if (loadedMissionId.current === missionId) return;

    const controller = new AbortController();
    api
      .getMission(missionId, { signal: controller.signal })
      .then(({ mission }) => {
        if (!controller.signal.aborted) {
          setMission(mission);
          loadedMissionId.current = mission.id;
        }
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setStatus(error.message);
      });

    return () => controller.abort();
  }, [missionId]);

  if (!mission) {
    return (
      <AppShell>
        <section className="page-container">
          {status ? <GlassCard className="section-card">{status}</GlassCard> : <PageLoader />}
        </section>
      </AppShell>
    );
  }

  const usd = Number(amount) || 0;
  const tokenPrice = Number.isFinite(mission.tokenPrice) && mission.tokenPrice > 0 ? mission.tokenPrice : null;
  const tokenAmount = tokenPrice ? usd / tokenPrice : null;
  const treasuryValue =
    Number.isFinite(mission.treasuryUsdc) && mission.treasuryUsdc > 0
      ? mission.treasuryUsdc
      : tokenPrice && Number.isFinite(mission.treasuryTokens) && mission.treasuryTokens > 0
        ? mission.treasuryTokens * tokenPrice
        : null;
  const treasuryPercent = treasuryValue && usd > 0 ? (usd / treasuryValue) * 100 : null;
  const submit = async () => {
    if (!wallet.address) {
      await wallet.signIn();
      return;
    }
    if (!name.trim()) {
      setStatus("Enter a request name before submitting.");
      return;
    }
    if (!description.trim()) {
      setStatus(null);
      setDescriptionError(true);
      descriptionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      descriptionRef.current?.focus({ preventScroll: true });
      return;
    }
    if (usd <= 0) {
      setStatus("Enter a request amount greater than zero.");
      return;
    }
    if (!tokenPrice) {
      setStatus("This mission does not have a live token price yet. Try again after the market data updates.");
      return;
    }
    try {
      setSubmitting(true);
      setStatus("Preparing funding request...");
      const result = await api.prepareFundingRequest({ missionId: mission.id, name, description, amountUsd: usd });
      const signature = await wallet.sendPreparedTransaction(result.transaction);
      setStatus(signature ? `Request submitted: ${shortAddress(signature)}` : result.transaction.status === "not_configured" ? result.transaction.message : "Funding request created.");
      router.push(`/missions/${mission.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Funding request failed.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AppShell>
      <section className="page-container">
        <PageHeader
          eyebrow={mission.tokenSymbol}
          title="Request mission funding"
          description="Funding requests are reviewed by the mission's treasury council. Four of six council members must approve for the request to pass."
        />
        <div className="form-two-col request-funding-layout">
          <div className="request-funding-summary">
            <GlassCard className="section-card">
              <GlassCard className="conditions-card">Conditions</GlassCard>
              <div className="info-grid funding-rule-grid">
                <InfoCard title="3 day voting period" body="Requests stay open for at least 3 days before council approval can finalize." />
                <InfoCard title="Mission related work" body="Funding can support individuals or teams working directly toward the mission." />
              </div>
            </GlassCard>
            <GlassCard className="section-card">
              <MissionCard mission={mission} />
            </GlassCard>
          </div>
          <GlassCard className="section-card request-funding-form-card">
            <div className="form-grid">
              <label>
                <span className="form-label">Request name</span>
                <input className="field" placeholder="Build the first community analytics dashboard" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span className="form-label">Request description</span>
                <textarea
                  ref={descriptionRef}
                  aria-invalid={descriptionError}
                  className={cx("textarea", descriptionError && "field-error")}
                  placeholder="Describe what will be delivered, who will do the work, why it advances the mission, and what success looks like."
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    if (descriptionError && event.target.value.length > 0) setDescriptionError(false);
                  }}
                />
              </label>
              <label>
                <span className="form-label">Request amount in USD</span>
                <input className="field" placeholder="10000" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <GlassCard className="stat-card">
                <span className="stat-label">Conversion preview</span>
                <div className="stat-value">
                  {money(usd)} = {tokenAmount !== null ? number(tokenAmount) : "Updating"} {mission.tokenSymbol}
                </div>
                {treasuryPercent !== null ? <div className="stat-note">This request equals {number(treasuryPercent)}% of treasury funds.</div> : null}
              </GlassCard>
              <StatusPill tone="council">Voting lasts at least 3 days · 4/6 approvals required</StatusPill>
              {status ? <p className="stat-note">{status}</p> : null}
              <button className="button button-primary" disabled={submitting} onClick={() => void submit()}>
                {submitting ? <InlineLoader /> : wallet.address ? "Submit request" : "Sign in to request funding"}
              </button>
            </div>
          </GlassCard>
        </div>
      </section>
    </AppShell>
  );
}

function profileDraftFromProfile(profile: api.Profile) {
  return {
    name: profile.name || "",
    description: profile.description || "",
    avatar: profile.avatar || "",
    x: profile.socials[0] || "",
    telegram: profile.socials[1] || "",
    github: profile.socials[2] || "",
  };
}

function profileInitial(profile: api.Profile) {
  return (profile.name || profile.address || "S").slice(0, 1).toUpperCase();
}

function socialHref(kind: "x" | "telegram" | "github", value: string) {
  const entry = value.trim();
  if (!entry) return "";
  if (/^https?:\/\//i.test(entry)) return entry;
  const handle = entry.replace(/^@/, "").replace(/^\/+/, "");
  if (kind === "x") return `https://x.com/${handle.replace(/^x\.com\//, "")}`;
  if (kind === "telegram") return `https://t.me/${handle.replace(/^t\.me\//, "")}`;
  return `https://github.com/${handle.replace(/^github\.com\//, "")}`;
}

function socialLabel(value: string, fallback: string) {
  return value.trim() || fallback;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ProfilePage({ address, initialProfile }: { address?: string; initialProfile?: api.Profile | null }) {
  const wallet = useSingularityWallet();
  const [profile, setProfile] = useState<api.Profile | null>(initialProfile ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [draft, setDraft] = useState(() => (initialProfile ? profileDraftFromProfile(initialProfile) : { name: "", description: "", avatar: "", x: "", telegram: "", github: "" }));
  const [requestFilter, setRequestFilter] = useState<"submitted" | "council">("submitted");
  const targetAddress = address || wallet.address;
  const loadedProfileAddress = useRef(initialProfile?.address.toLowerCase() ?? null);
  useEffect(() => {
    if (!targetAddress) return;
    if (loadedProfileAddress.current === targetAddress.toLowerCase()) return;
    const controller = new AbortController();

    api
      .getProfile(targetAddress, { signal: controller.signal })
      .then(({ profile }) => {
        if (controller.signal.aborted) return;
        setProfile(profile);
        loadedProfileAddress.current = profile.address.toLowerCase();
        setDraft(profileDraftFromProfile(profile));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setStatus(error.message);
      });

    return () => controller.abort();
  }, [targetAddress]);

  if (!targetAddress) {
    return (
      <AppShell>
        <section className="page-container">
          <PageHeader eyebrow="Wallet identity" title="Profile" description="Connect a Solana wallet to see balances, council roles, and funding requests." />
          <button className="button button-primary" onClick={() => void wallet.signIn()}>
            Sign in
          </button>
          {wallet.status ? <p className="stat-note">{wallet.status}</p> : null}
        </section>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <section className="page-container">
          {status ? <GlassCard className="section-card">{status}</GlassCard> : <PageLoader />}
        </section>
      </AppShell>
    );
  }

  const userMissions = profile.tokenBalances.flatMap((entry) => {
    const mission = entry.mission ?? null;
    return mission ? [{ ...entry, mission }] : [];
  });
  const createdMissions = profile.createdMissions.flatMap((entry) => {
    const mission = entry.mission ?? null;
    return mission ? [{ ...entry, mission }] : [];
  });
  const featuredCreatorMissionId = profile.createdMissions[0]?.missionId;
  const submittedRequests = profile.submittedRequests || [];
  const councilRequests = profile.councilRequests || [];
  const visibleRequests = requestFilter === "submitted" ? submittedRequests : councilRequests;
  const displayName = profile.name || "Unnamed profile";
  const description = profile.description || "Add a short description about yourself.";
  const isOwnProfile = Boolean(wallet.address && profile.address.toLowerCase() === wallet.address.toLowerCase());
  const isEditingOwnProfile = isOwnProfile && editing;
  const saveProfile = async () => {
    try {
      setSaving(true);
      setStatus(null);
      const { profile: nextProfile } = await api.updateProfile({
        name: draft.name.trim(),
        description: draft.description.trim(),
        avatar: draft.avatar.trim(),
        socials: [draft.x.trim(), draft.telegram.trim(), draft.github.trim()],
      });
      setProfile(nextProfile);
      setDraft(profileDraftFromProfile(nextProfile));
      setEditing(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile save failed.");
    } finally {
      setSaving(false);
    }
  };
  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setStatus(null);
      const { upload } = await api.uploadObject({ file, purpose: "profile-avatar" });
      setDraft((current) => ({ ...current, avatar: upload.uri }));
      setEditing(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile image upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(profile.address);
      setAddressCopied(true);
      window.setTimeout(() => setAddressCopied(false), 1400);
    } catch {
      setStatus("Could not copy address.");
    }
  };

  return (
    <AppShell>
      <section className="page-container">
        <PageHeader
          eyebrow="Wallet identity"
          title="Profile"
          description={
            isOwnProfile
              ? "Your balances, mission positions, treasury council roles, and funding requests."
              : "Balances, mission positions, treasury council roles, and funding requests for this wallet."
          }
        />
        <GlassCard className={cx("profile-hero", isEditingOwnProfile && "profile-hero-editing")}>
          <div className="profile-avatar-column">
            <span className="avatar profile-avatar">
              {(isEditingOwnProfile ? draft.avatar : profile.avatar) ? <img src={isEditingOwnProfile ? draft.avatar : profile.avatar} alt="" decoding="async" loading="eager" /> : <span>{profileInitial(profile)}</span>}
            </span>
            {isEditingOwnProfile ? (
              <label className="button profile-upload-button">
                <Upload size={15} />
                {uploading ? "Uploading..." : "Upload image"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => void uploadAvatar(event)} />
              </label>
            ) : null}
          </div>
          <div className="profile-main">
            {isEditingOwnProfile ? (
              <div className="profile-edit-form">
                <label>
                  <span className="form-label">Display name</span>
                  <input className="field" placeholder="Your name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  <span className="form-label">About you</span>
                  <textarea className="textarea profile-textarea" placeholder="Add a short description about yourself." value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <div className="profile-social-fields">
                  <label>
                    <span className="form-label">X</span>
                    <input className="field" placeholder="@handle" value={draft.x} onChange={(event) => setDraft((current) => ({ ...current, x: event.target.value }))} />
                  </label>
                  <label>
                    <span className="form-label">Telegram</span>
                    <input className="field" placeholder="@handle" value={draft.telegram} onChange={(event) => setDraft((current) => ({ ...current, telegram: event.target.value }))} />
                  </label>
                  <label>
                    <span className="form-label">GitHub</span>
                    <input className="field" placeholder="github.com/handle" value={draft.github} onChange={(event) => setDraft((current) => ({ ...current, github: event.target.value }))} />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ margin: 0 }}>{displayName}</h2>
                <p className={cx("stat-note", !profile.description && "placeholder-copy")}>{description}</p>
                <div className="profile-socials" aria-label="Social links">
                  {profile.socials[0] ? (
                    <a className="profile-social-link" href={socialHref("x", profile.socials[0])} target="_blank" rel="noreferrer">
                      <XLogo />
                      <span>{socialLabel(profile.socials[0], "Add X")}</span>
                    </a>
                  ) : (
                    <span className="profile-social-link muted"><XLogo /><span>X</span></span>
                  )}
                  {profile.socials[1] ? (
                    <a className="profile-social-link" href={socialHref("telegram", profile.socials[1])} target="_blank" rel="noreferrer">
                      <TelegramLogo />
                      <span>{socialLabel(profile.socials[1], "Add Telegram")}</span>
                    </a>
                  ) : (
                    <span className="profile-social-link muted"><TelegramLogo /><span>Telegram</span></span>
                  )}
                  {profile.socials[2] ? (
                    <a className="profile-social-link" href={socialHref("github", profile.socials[2])} target="_blank" rel="noreferrer">
                      <GithubLogo />
                      <span>{socialLabel(profile.socials[2], "Add GitHub")}</span>
                    </a>
                  ) : (
                    <span className="profile-social-link muted"><GithubLogo /><span>GitHub</span></span>
                  )}
                </div>
              </>
            )}
            <button className="status-pill wallet-pill wallet-copy-button" type="button" onClick={() => void copyAddress()} aria-label="Copy wallet address">
              {addressCopied ? "Copied" : shortAddress(profile.address)} <Copy size={12} />
            </button>
            {status ? <p className="stat-note profile-status">{status}</p> : null}
          </div>
          {isOwnProfile ? (
            <div className="profile-actions">
              {isEditingOwnProfile ? (
                <>
                  <button className="button button-primary" disabled={saving || uploading} onClick={() => void saveProfile()}>{saving ? <InlineLoader /> : "Save profile"}</button>
                  <button className="button" disabled={saving} onClick={() => { setDraft(profileDraftFromProfile(profile)); setEditing(false); setStatus(null); }}>Cancel</button>
                </>
              ) : (
                <button className="button button-primary" onClick={() => setEditing(true)}>Edit profile</button>
              )}
              <button className="button" onClick={() => void wallet.signOut()}>Disconnect</button>
            </div>
          ) : null}
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <h2>Balances</h2>
          </div>
          <div className="balance-grid">
            {(profile.balances.usdc || 0) >= 0.0001 ? (
              <BalanceCard symbol="U" label="USDC" value={`${number(profile.balances.usdc || 0)} USDC`} note={money(profile.balances.usdcUsd || 0)} icon={<UsdcLogo />} />
            ) : null}
            {profile.tokenBalances
              .filter((balance) => (balance.balance || 0) >= 0.0001 && (balance.usd || 0) >= 0.0001)
              .map((balance) => {
                const mission = balance.mission ?? null;
                return (
                  <BalanceCard
                    key={balance.symbol}
                    symbol={balance.symbol.slice(0, 1)}
                    label={balance.symbol}
                    value={`${number(balance.balance)} ${balance.symbol}`}
                    note={money(balance.usd)}
                    icon={mission?.tokenImage ? <img className="mission-token-logo" src={mission.tokenImage} alt={`${balance.symbol} logo`} /> : undefined}
                  />
                );
              })}
          </div>
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <h2>Trading fee distributions</h2>
          </div>
          {createdMissions.length ? (
            <div className="fee-grid">
              {createdMissions.map((entry) => (
                <GlassCard className="creator-fee-card" key={entry.missionId}>
                  <span className="token-avatar">
                    <img src={entry.mission.tokenImage} alt="" decoding="async" loading="lazy" />
                  </span>
                  <div>
                    <span className="stat-label">{entry.mission.tokenSymbol} distributed fees</span>
                    <div className="stat-value">{money(entry.tradingFeesEarned)}</div>
                    <p className="stat-note">Fees are distributed automatically every 24 hours.</p>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <EmptyState title="No distributed fees yet" description="Create a mission to receive automatic trading-fee distributions every 24 hours." />
          )}
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <h2>My missions</h2>
          </div>
          {userMissions.length ? (
            <div className="mission-grid">
              {userMissions.map((entry) => {
                const isCreator = entry.missionId === featuredCreatorMissionId;
                const label = isCreator ? "Creator" : entry.council ? "Councillor" : "Investor";

                return (
                  <div className="profile-mission-card" key={entry.missionId}>
                    <div className="profile-mission-role">
                      <StatusPill tone={entry.council ? "council" : "info"}>{label}</StatusPill>
                    </div>
                    <MissionCard mission={entry.mission} />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No missions yet" description="When you buy mission tokens or create a mission, those positions will show up here." />
          )}
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <div>
              <h2>Funding requests</h2>
            </div>
            <div className="filter-pills">
              <button className={cx("filter-pill", requestFilter === "submitted" && "active")} type="button" onClick={() => setRequestFilter("submitted")}>
                {isOwnProfile ? "Submitted by me" : "Submitted by profile"}
              </button>
              <button className={cx("filter-pill", requestFilter === "council" && "active")} type="button" onClick={() => setRequestFilter("council")}>
                {isOwnProfile ? "Submitted to me" : "Submitted to profile"}
              </button>
            </div>
          </div>
          {visibleRequests.length ? (
            <div className="request-list">
              {visibleRequests.map(({ request, symbol }) => (
              <FundingRequestCard key={`${requestFilter}-${request.id}`} request={request} symbol={symbol} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={requestFilter === "submitted" ? "No funding requests submitted" : "No requests awaiting your vote"}
              description={requestFilter === "submitted" ? "Submitted requests will appear here." : "Active council votes will appear here when you are a councillor for a mission."}
            />
          )}
        </GlassCard>
      </section>
    </AppShell>
  );
}

function XLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M13.9 10.5 21.3 2h-1.8l-6.4 7.4L8 2H2l7.8 11.4L2 22h1.8l6.8-7.8L16 22h6l-8.1-11.5Zm-2.4 2.7-.8-1.1L4.4 3.3h2.7l5 7.1.8 1.1 6.6 9.3h-2.7l-5.3-7.6Z" fill="currentColor" />
    </svg>
  );
}

function TelegramLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M21.9 4.1 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.5 1 11.9c-1.1-.3-1.1-1.1.2-1.6L20.7 2.8c.9-.3 1.7.2 1.2 1.3Z" fill="currentColor" />
    </svg>
  );
}

function GithubLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 .7a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .7Z" fill="currentColor" />
    </svg>
  );
}

function UsdcLogo() {
  return <img className="usdc-logo" src="https://cryptologos.cc/logos/usd-coin-usdc-logo.svg" alt="USDC logo" decoding="async" loading="lazy" />;
}

function BalanceCard({ symbol, label, value, note, icon }: { symbol: string; label: string; value: string; note?: string; icon?: React.ReactNode }) {
  return (
    <GlassCard className="stat-card balance-card">
      <span className="balance-symbol">{icon || symbol}</span>
      <div>
        <span className="stat-label">{label}</span>
        <div className="stat-value">{value}</div>
        {note ? <div className="stat-note">{note}</div> : null}
      </div>
    </GlassCard>
  );
}
