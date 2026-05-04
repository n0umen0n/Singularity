"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Copy, Sparkles, Zap } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { BrandWordmark, GlassCard, SingularityMark, StatusPill, cx } from "@singularity/ui";
import { FlipCard } from "@/components/animate-ui/flip-card";
import { currentUser, getMission, missions, type FundingRequest, type Mission, type RequestStatus } from "@/lib/mock-data";
import { money, number, shortAddress } from "@/lib/format";

export function AppShell({ children }: { children: React.ReactNode }) {
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
          <Link className="profile-nav-button desktop-only" href="/profile" aria-label="Open profile">
            <span className="avatar nav-avatar">
              <img src={currentUser.avatar} alt="" />
            </span>
            <span>Profile</span>
            <ChevronDown size={15} />
          </Link>
        </div>
      </header>
      {children}
      <nav className="mobile-nav" aria-label="Primary">
        <Link href="/missions">Missions</Link>
        <Link href="/missions/new">Create</Link>
        <Link href="/profile">Profile</Link>
      </nav>
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

export function MissionsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Highest liquidity");
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const source = [...missions].filter(
      (mission) =>
        mission.statement.toLowerCase().includes(q) ||
        mission.description.toLowerCase().includes(q) ||
        mission.tokenSymbol.toLowerCase().includes(q),
    );
    if (filter === "Highest liquidity") return source.sort((a, b) => b.liquidity - a.liquidity);
    if (filter === "Most holders") return source.sort((a, b) => b.holders - a.holders);
    return source;
  }, [filter, query]);

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
          {filtered.map((mission) => (
            <MissionCard key={mission.id} mission={mission} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function MissionCard({ mission, preview = false }: { mission: Mission; preview?: boolean }) {
  const className = cx("glass-card mission-card mission-card-link", !preview && "interactive", preview && "mission-preview-card");
  const content = (
    <>
      <div className="mission-card-media">
        <img src={mission.image} alt="" />
        <span className="token-avatar">
          <img src={mission.tokenImage} alt="" />
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
}: {
  member: Mission["council"][number];
  index: number;
  symbol: string;
}) {
  const socialHandle = member.socials ?? `@${member.name.toLowerCase()}`;
  const description =
    councilMemberDescriptions[member.name] ??
    "Mission council member helping approve treasury funding for work that advances the mission.";

  return (
    <FlipCard
      className="council-flip-card"
      front={
        <article className="glass-card flip-profile-card flip-profile-front">
          <StatusPill>#{index + 1}</StatusPill>
          <span className="flip-profile-avatar">
            <img src={member.avatar} alt="" />
          </span>
          <div>
            <h3>{member.name}</h3>
            <p>
              {number(member.tokens, true)} {symbol}
            </p>
          </div>
        </article>
      }
      back={
        <article className="glass-card flip-profile-card flip-profile-back">
          <StatusPill tone="council">Council member</StatusPill>
          <div>
            <h3>{member.name}</h3>
            <p className="flip-profile-description">{description}</p>
          </div>
          <div className="flip-profile-socials">
            <a href={`https://x.com/${socialHandle.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
              <span className="x-logo" aria-hidden="true">
                X
              </span>
              {socialHandle}
            </a>
          </div>
          <div className="button button-primary flip-profile-button">Open profile</div>
        </article>
      }
    />
  );
}

const councilMemberDescriptions: Record<string, string> = {
  Astra: "Backs high-conviction builders and pushes treasury funding toward measurable mission progress.",
  Vector: "Reviews technical milestones and helps the council fund teams with clear delivery plans.",
  Mira: "Connects mission contributors with ecosystem partners, research leads, and early demand.",
  Halden: "Focuses on treasury discipline, funding scope, and keeping requests accountable after approval.",
  Nyx: "Scouts emerging contributors and champions experimental work with a strong mission fit.",
  Sable: "Tracks council sentiment and helps turn promising proposals into fundable execution plans.",
};

export function MissionDetailPage({ missionId }: { missionId: string }) {
  const mission = getMission(missionId);
  return (
    <AppShell>
      <section className="page-container detail-grid">
        <div>
          <MissionHero mission={mission} />
          <StatsGrid mission={mission} />
          <PerformanceCard mission={mission} />
          <CouncilSection mission={mission} />
          <FundingRequests mission={mission} />
        </div>
        <aside className="right-rail">
          <TreasuryPanel mission={mission} />
          <TradePanel mission={mission} />
        </aside>
      </section>
    </AppShell>
  );
}

function MissionHero({ mission }: { mission: Mission }) {
  return (
    <section className="glass-card mission-hero">
      <img className="hero-image" src={mission.image} alt="" />
      <div className="hero-topline">
        <StatusPill>Missions / {mission.tokenSymbol}</StatusPill>
        <StatusPill tone="info">{money(mission.liquidity, true)} liquidity</StatusPill>
      </div>
      <div className="hero-content">
        <div className="hero-title-row">
          <div>
            <h1>{mission.statement}</h1>
            <p>{mission.description}</p>
          </div>
          <span className="token-avatar" style={{ width: 72, height: 72 }}>
            <img src={mission.tokenImage} alt="" />
          </span>
        </div>
      </div>
    </section>
  );
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

function PerformanceCard({ mission }: { mission: Mission }) {
  const [frame, setFrame] = useState<keyof Mission["performance"]>("1D");
  const [investmentInput, setInvestmentInput] = useState("100");
  const point = mission.performance[frame];
  const investmentAmount = Math.max(Number(investmentInput) || 0, 0);
  const returnMultiplier = point.value / 100;
  const projectedValue = investmentAmount * returnMultiplier;
  const investmentReturn = projectedValue - investmentAmount;
  const growthTone = investmentReturn < 0 ? "drop" : returnMultiplier > 1.3 ? "surge" : "rise";
  const isPositiveReturn = investmentReturn > 0;
  const growthLabel = `${investmentReturn > 0 ? "+" : ""}${money(investmentReturn)}`;
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
        <div className="timeframe-row">
          {(Object.keys(mission.performance) as Array<keyof Mission["performance"]>).map((entry) => (
            <button className={cx("filter-pill", frame === entry && "active")} key={entry} onClick={() => setFrame(entry)}>
              {entry}
            </button>
          ))}
        </div>
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

function CouncilSection({ mission }: { mission: Mission }) {
  return (
    <GlassCard className="section-card">
      <div className="section-heading">
        <div>
          <h2>Treasury Council</h2>
          <p>The top 6 investors form this mission&apos;s treasury council.</p>
        </div>
        <StatusPill tone="council">4/6 approvals required to access treasury</StatusPill>
      </div>
      <div className="council-grid">
        {mission.council.map((member, index) => (
          <CouncilMemberFlipCard index={index} key={member.id} member={member} symbol={mission.tokenSymbol} />
        ))}
      </div>
    </GlassCard>
  );
}

function FundingRequests({ mission }: { mission: Mission }) {
  const [tab, setTab] = useState<RequestStatus | "all">("active");
  const visible = mission.requests.filter((request) => tab === "all" || request.status === tab);
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
        {(["active", "accepted", "rejected", "all"] as const).map((entry) => (
          <button className={cx("filter-pill", tab === entry && "active")} key={entry} onClick={() => setTab(entry)}>
            {entry}
          </button>
        ))}
      </div>
      <div className="request-list">
        {visible.map((request) => (
          <FundingRequestCard key={request.id} request={request} symbol={mission.tokenSymbol} />
        ))}
      </div>
    </GlassCard>
  );
}

function FundingRequestCard({ request, symbol }: { request: FundingRequest; symbol: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const dots = Array.from({ length: 6 }, (_, index) => {
    if (index < request.approvals) return "yes";
    if (index < request.approvals + request.rejections) return "no";
    return "";
  });
  return (
    <GlassCard className={cx("request-card interactive", isExpanded && "expanded")}>
      <button className="request-card-toggle" type="button" onClick={() => setIsExpanded((current) => !current)} aria-expanded={isExpanded}>
        <div className="request-summary">
          <StatusPill tone={request.status}>{request.status}</StatusPill>
          <div className="request-title">{request.name}</div>
          <div className="request-meta">
            <span className="avatar" style={{ width: 26, height: 26 }}>
              <img src={request.requesterAvatar} alt="" />
            </span>
            {request.requester}
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
            <button className="button button-danger" type="button">
              Reject request
            </button>
            <button className="button button-primary" type="button">
              Approve request
            </button>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function capitalizationBreakdown(mission: Mission) {
  const treasuryTokens = mission.treasuryTokens;
  const investorTokens = mission.council.reduce((total, investor) => total + investor.tokens, 0);
  const marketTokens = Math.max(mission.totalSupply - treasuryTokens - investorTokens, 0);

  return {
    investorTokens,
    investorValue: investorTokens * mission.tokenPrice,
    treasuryTokens,
    marketTokens,
    marketCapValue: mission.totalSupply * mission.tokenPrice,
    treasuryValue: treasuryTokens * mission.tokenPrice,
    marketValue: marketTokens * mission.tokenPrice,
  };
}

function TreasuryPanel({ mission }: { mission: Mission }) {
  const { marketCapValue, marketTokens, marketValue, treasuryTokens, treasuryValue } = capitalizationBreakdown(mission);
  const totalSupplyAmount = `${number(mission.totalSupply)} ${mission.tokenSymbol}`;
  const treasuryTokenAmount = `${number(treasuryTokens)} ${mission.tokenSymbol}`;
  const marketTokenAmount = `${number(marketTokens)} ${mission.tokenSymbol}`;

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
          <div className="stat-value">{money(marketCapValue)}</div>
          <div className="stat-note" title={totalSupplyAmount}>
            {number(mission.totalSupply, true)} {mission.tokenSymbol}
          </div>
        </div>
        <div>
          <span className="stat-label">Treasury</span>
          <div className="stat-value">{money(treasuryValue)}</div>
          <div className="stat-note" title={treasuryTokenAmount}>
            {number(treasuryTokens, true)} {mission.tokenSymbol}
          </div>
        </div>
        <div>
          <span className="stat-label">Market Liquidity</span>
          <div className="stat-value">{money(marketValue)}</div>
          <div className="stat-note" title={marketTokenAmount}>
            {number(marketTokens, true)} {mission.tokenSymbol}
          </div>
        </div>
      </div>
      <TreasuryMarketDonut mission={mission} />
      <p className="stat-note">
        The treasury is reserved for funding work that advances this mission. Market liquidity enables to purchase and sell tokens.
      </p>
    </GlassCard>
  );
}

function TreasuryMarketDonut({ mission }: { mission: Mission }) {
  const [active, setActive] = useState<"investors" | "treasury" | "market">("treasury");
  const { investorTokens, marketTokens, treasuryTokens } = capitalizationBreakdown(mission);
  const chartData = [
    { key: "investors" as const, name: "Investors", value: investorTokens, gradient: "url(#investorsGradient)" },
    { key: "treasury" as const, name: "Treasury", value: treasuryTokens, gradient: "url(#treasuryGradient)" },
    { key: "market" as const, name: "Market", value: marketTokens, gradient: "url(#marketGradient)" },
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
              isAnimationActive
              animationDuration={700}
              onMouseEnter={(_, index) => setActive(chartData[index]?.key ?? "treasury")}
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
        <button className={cx("legend-item", active === "investors" && "active")} onMouseEnter={() => setActive("investors")} onFocus={() => setActive("investors")}>
          <span className="legend-dot investors-dot" />
          Investors
        </button>
        <button className={cx("legend-item", active === "treasury" && "active")} onMouseEnter={() => setActive("treasury")} onFocus={() => setActive("treasury")}>
          <span className="legend-dot treasury-dot" />
          Treasury
        </button>
        <button className={cx("legend-item", active === "market" && "active")} onMouseEnter={() => setActive("market")} onFocus={() => setActive("market")}>
          <span className="legend-dot market-dot" />
          Market
        </button>
      </div>
    </div>
  );
}

function TradePanel({ mission }: { mission: Mission }) {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1000");
  const numeric = Number(amount) || 0;
  const estimate = mode === "buy" ? numeric / mission.tokenPrice : numeric * mission.tokenPrice;
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
        <input className="field" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <p className="stat-note">
        Estimated output:{" "}
        <strong>
          {mode === "buy" ? `${number(estimate)} ${mission.tokenSymbol}` : `${money(estimate)} USDC`}
        </strong>
      </p>
      <p className="stat-note">Price impact: 0.42%</p>
      <button className={cx("button", mode === "buy" ? "button-primary" : "button-danger")} style={{ width: "100%" }}>
        {mode === "buy" ? "Buy tokens" : "Sell tokens"}
      </button>
    </GlassCard>
  );
}

export function LaunchMissionPage() {
  const [symbol, setSymbol] = useState("");
  const [statement, setStatement] = useState("");
  const [description, setDescription] = useState("");
  const [missionImage, setMissionImage] = useState(missions[0].image);
  const [tokenImage, setTokenImage] = useState(missions[0].tokenImage);
  const previewSymbol = symbol || "NOVA";
  const previewMission: Mission = {
    ...missions[0],
    id: "preview",
    statement: statement || "Coordinate the first open-source lunar robotics network.",
    tokenSymbol: previewSymbol,
    description: description || "Live preview of how your mission will appear in discovery.",
    image: missionImage,
    tokenImage,
    liquidity: 1000000,
    holders: 1800,
  };

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
          description="A mission can be anything: a product, research goal, community, protocol, creative project, public good, or ambitious outcome. As the mission creator, you can earn trading fees when the mission market is active."
        />
        <div className="form-two-col">
          <div>
            <GlassCard className="section-card">
              <div className="section-heading">
                <div>
                  <h2>Tokenomics</h2>
                  <p>A market is created for every mission. The market is the mission AMM, where investors buy and sell mission tokens. 20% of supply goes to the treasury and 80% goes to AMM liquidity.</p>
                </div>
              </div>
              <div className="treasury-ring" />
              <div className="info-grid">
                <InfoCard title="80% Market liquidity" body="Seeded into the mission AMM so tokens are available for trading." />
                <InfoCard title="20% Mission treasury" body="Reserved for funding mission-related work." />
              </div>
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
                note="16:10 PNG, JPG, WEBP, or SVG"
                previewSrc={missionImage}
                onFileSelect={(url) => setMissionImage(url)}
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
                note="Square 1:1 image, shown as a circle"
                previewSrc={tokenImage}
                onFileSelect={(url) => setTokenImage(url)}
              />
              <label>
                <span className="form-label">Initial purchase in USDC</span>
                <input className="field" placeholder="1000" />
              </label>
              <StatusPill tone="warning">Minimum is 5 USDC</StatusPill>
              <button className="button button-primary">Launch mission</button>
            </div>
          </GlassCard>
        </div>
      </section>
    </AppShell>
  );
}

function UploadBox({
  label,
  note,
  previewSrc,
  onFileSelect,
}: {
  label: string;
  note: string;
  previewSrc?: string;
  onFileSelect?: (url: string) => void;
}) {
  return (
    <div>
      <span className="form-label">{label}</span>
      <label className="upload-box">
        <input
          accept="image/*"
          className="sr-only"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file || !onFileSelect) return;
            onFileSelect(URL.createObjectURL(file));
          }}
        />
        {previewSrc ? <img className="upload-preview-image" src={previewSrc} alt="" /> : null}
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

export function RequestFundingPage({ missionId }: { missionId: string }) {
  const mission = getMission(missionId);
  const [amount, setAmount] = useState("");
  const usd = Number(amount) || 0;
  const tokenAmount = usd / mission.tokenPrice;
  return (
    <AppShell>
      <section className="page-container">
        <PageHeader
          eyebrow={mission.tokenSymbol}
          title="Request mission funding"
          description="Funding requests are reviewed by the mission's treasury council. Four of six council members must approve for the request to pass."
        />
        <div className="form-two-col">
          <div>
            <GlassCard className="section-card">
              <GlassCard className="conditions-card">Conditions</GlassCard>
              <div className="info-grid funding-rule-grid">
                <InfoCard title="3 day voting period" body="Requests stay open for at least 3 days before council approval can finalize." />
                <InfoCard title="Mission related work" body="Funding can support individuals or teams working directly toward the mission." />
              </div>
            </GlassCard>
            <GlassCard className="section-card">
              <MissionCard mission={mission} />
              <p className="stat-note">Treasury available: {money(mission.treasuryUsdc)}</p>
            </GlassCard>
          </div>
          <GlassCard className="section-card">
            <div className="form-grid">
              <label>
                <span className="form-label">Request name</span>
                <input className="field" placeholder="Build the first community analytics dashboard" />
              </label>
              <label>
                <span className="form-label">Request description</span>
                <textarea className="textarea" placeholder="Describe what will be delivered, who will do the work, why it advances the mission, and what success looks like." />
              </label>
              <label>
                <span className="form-label">Request amount in USD</span>
                <input className="field" placeholder="10000" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <GlassCard className="stat-card">
                <span className="stat-label">Conversion preview</span>
                <div className="stat-value">
                  {money(usd)} = {number(tokenAmount)} {mission.tokenSymbol}
                </div>
                <div className="stat-note">
                  Based on current token price: {money(mission.tokenPrice)}. This request equals{" "}
                  {((usd / mission.treasuryUsdc) * 100).toFixed(2)}% of treasury funds.
                </div>
              </GlassCard>
              <StatusPill tone="council">Voting lasts at least 3 days · 4/6 approvals required</StatusPill>
              <button className="button button-primary">Submit request</button>
            </div>
          </GlassCard>
        </div>
      </section>
    </AppShell>
  );
}

export function ProfilePage() {
  const userMissions = currentUser.tokenBalances.map((entry) => ({ ...entry, mission: getMission(entry.missionId) }));
  const createdMissions = currentUser.createdMissions.map((entry) => ({ ...entry, mission: getMission(entry.missionId) }));
  const featuredCreatorMissionId = currentUser.createdMissions[0]?.missionId;
  const [requestFilter, setRequestFilter] = useState<"submitted" | "council">("submitted");
  const submittedRequests = missions.flatMap((mission) =>
    mission.requests.slice(0, 1).map((request) => ({
      request: { ...request, requester: currentUser.name, requesterAvatar: currentUser.avatar },
      symbol: mission.tokenSymbol,
    })),
  );
  const councilMissionIds = new Set(currentUser.tokenBalances.filter((entry) => entry.council).map((entry) => entry.missionId));
  const councilRequests = missions.flatMap((mission) =>
    councilMissionIds.has(mission.id)
      ? mission.requests
          .filter((request) => request.status === "active")
          .map((request) => ({
            request,
            symbol: mission.tokenSymbol,
          }))
      : [],
  );
  const visibleRequests = requestFilter === "submitted" ? submittedRequests : councilRequests;
  return (
    <AppShell>
      <section className="page-container">
        <PageHeader eyebrow="Wallet identity" title="Profile" description="Your balances, mission positions, treasury council roles, and funding requests." />
        <GlassCard className="profile-hero">
          <span className="avatar profile-avatar">
            <img src={currentUser.avatar} alt="" />
          </span>
          <div>
            <h2 style={{ margin: 0 }}>{currentUser.name}</h2>
            <p className="stat-note">{currentUser.description}</p>
            <div className="profile-socials" aria-label="Social links">
              <a className="profile-social-link" href="https://x.com/vlad" target="_blank" rel="noreferrer">
                <XLogo />
                <span>@vlad</span>
              </a>
              <a className="profile-social-link" href="https://discord.com" target="_blank" rel="noreferrer">
                <DiscordLogo />
                <span>vlad</span>
              </a>
              <a className="profile-social-link" href="https://github.com/vlad" target="_blank" rel="noreferrer">
                <GithubLogo />
                <span>vlad</span>
              </a>
            </div>
            <span className="status-pill wallet-pill">
              {shortAddress(currentUser.address)} <Copy size={12} />
            </span>
          </div>
          <button className="button">Edit profile</button>
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <h2>Balances</h2>
          </div>
          <div className="balance-grid">
            <BalanceCard symbol="U" label="USDC" value={`${number(currentUser.balances.usdc)} USDC`} note={money(currentUser.balances.usdcUsd)} />
            <BalanceCard symbol="◎" label="SOL" value={`${number(currentUser.balances.sol)} SOL`} note={money(currentUser.balances.solUsd)} />
            {currentUser.tokenBalances.map((balance) => (
              <BalanceCard
                key={balance.symbol}
                symbol={balance.symbol.slice(0, 1)}
                label={balance.symbol}
                value={`${number(balance.balance)} ${balance.symbol}`}
                note={money(balance.usd)}
              />
            ))}
          </div>
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <h2>Creator trading fees</h2>
            <p>Mission creators earn trading fees as markets trade.</p>
          </div>
          <div className="fee-grid">
            {createdMissions.map((entry) => (
              <GlassCard className="creator-fee-card interactive" key={entry.missionId}>
                <span className="token-avatar">
                  <img src={entry.mission.tokenImage} alt="" />
                </span>
                <div>
                  <span className="stat-label">{entry.mission.tokenSymbol} creator fees</span>
                  <div className="stat-value">{money(entry.tradingFeesEarned)}</div>
                </div>
                <button className="button button-primary">
                  <Zap size={16} />
                  Claim trading fees
                </button>
              </GlassCard>
            ))}
          </div>
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <h2>My missions</h2>
          </div>
          <div className="mission-grid">
            {userMissions
              .map((entry) => {
                const isCreator = entry.missionId === featuredCreatorMissionId;
                const label = isCreator ? "Creator" : entry.council ? "Council member" : "Investor";

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
        </GlassCard>
        <GlassCard className="section-card">
          <div className="section-heading">
            <div>
              <h2>Funding requests</h2>
              <p>Track requests you submitted or need to vote on as a council member</p>
            </div>
            <div className="filter-pills">
              <button className={cx("filter-pill", requestFilter === "submitted" && "active")} type="button" onClick={() => setRequestFilter("submitted")}>
                Submitted by me
              </button>
              <button className={cx("filter-pill", requestFilter === "council" && "active")} type="button" onClick={() => setRequestFilter("council")}>
                Submitted to me
              </button>
            </div>
          </div>
          <div className="request-list">
            {visibleRequests.map(({ request, symbol }) => (
              <FundingRequestCard key={`${requestFilter}-${request.id}`} request={request} symbol={symbol} />
            ))}
          </div>
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

function DiscordLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M19.8 5.4A16.2 16.2 0 0 0 15.7 4l-.2.4c1.5.4 2.2 1 2.2 1a13.8 13.8 0 0 0-11.4 0s.7-.6 2.3-1L8.3 4a16.2 16.2 0 0 0-4.1 1.4C1.6 9.3.9 13.1 1.3 16.9a16.4 16.4 0 0 0 5 2.5l.9-1.5a10.4 10.4 0 0 1-1.4-.7l.3-.2a11.6 11.6 0 0 0 11.8 0l.3.2c-.5.3-.9.5-1.4.7l.9 1.5a16.4 16.4 0 0 0 5-2.5c.5-4.4-.7-8.1-2.9-11.5ZM8.7 14.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" fill="currentColor" />
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

function BalanceCard({ symbol, label, value, note }: { symbol: string; label: string; value: string; note?: string }) {
  return (
    <GlassCard className="stat-card balance-card">
      <span className="balance-symbol">{symbol}</span>
      <div>
        <span className="stat-label">{label}</span>
        <div className="stat-value">{value}</div>
        {note ? <div className="stat-note">{note}</div> : null}
      </div>
    </GlassCard>
  );
}
