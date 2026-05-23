import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SINGULARITY_AI_PROMPT, SINGULARITY_AI_URL } from "./singularity-context";
import "./learn.css";

function BrandWordmark() {
  return (
    <a className="learn-brand" href="/" aria-label="Singularity home">
      <svg className="brand-cone" viewBox="0 0 64 64" aria-hidden="true">
        <g className="brand-cone-shell">
          <path d="M11 10 C22 23 25 27 32 32 C39 37 42 41 53 54" />
          <path d="M53 10 C42 23 39 27 32 32 C25 37 22 41 11 54" />
          <path d="M20 11 C28 24 29 40 20 53" />
          <path d="M44 11 C36 24 35 40 44 53" />
        </g>
        <g className="brand-cone-rings">
          <ellipse cx="32" cy="10" rx="21" ry="4.6" />
          <ellipse cx="32" cy="16" rx="15" ry="3.2" />
          <ellipse cx="32" cy="32" rx="5.2" ry="2" />
          <ellipse cx="32" cy="48" rx="15" ry="3.2" />
          <ellipse cx="32" cy="54" rx="21" ry="4.6" />
        </g>
      </svg>
      <span>Singularity</span>
    </a>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button className="learn-copy-btn" type="button" onClick={handleCopy} aria-live="polite">
      {copied ? "Copied" : label}
    </button>
  );
}

const flowSteps = [
  { step: "01", title: "Launch", body: "Tell us about your mission. We set up your public page and everything investors need to back you." },
  { step: "02", title: "Invest", body: "Investors find your mission and put money behind the work." },
  { step: "03", title: "Token", body: "Singularity creates a mission token with no equity required. 80% of the supply goes on the market; 20% is reserved to fund your mission's work." },
  { step: "04", title: "Request", body: "You request money from the fund to pay people working on your mission." },
  { step: "05", title: "Approve", body: "Investors vote on each request. Nothing moves without approval and a 3-day review period." },
  { step: "06", title: "Pay out", body: "Approved requests go to people on your mission. Every payout is visible on your mission page." },
  { step: "07", title: "Grow", body: "As more investors back the mission, the fund and community grow with it." },
];

const ecosystem = [
  {
    label: "Your org",
    detail: "Launch the mission page, tell the story, and request payouts from the built-in fund. We handle the setup.",
  },
  {
    label: "Investors",
    detail: "Find missions, invest from day one, and vote on how the fund is spent.",
  },
  {
    label: "Your team",
    detail: "People working on the mission get paid through visible, approved requests.",
  },
];

const investorAudience = [
  {
    title: "Who they are",
    body: "People with crypto wallets who want to back missions they believe in. Not a closed VC circle: retail participants, crypto-native traders, early believers, and anyone who wants a public way to support your work.",
  },
  {
    title: "How many",
    body: "There are millions of investors and active wallet holders on Solana alone. When your mission launches, it opens into that existing pool of capital and attention from day one.",
  },
  {
    title: "Growing reach",
    body: "Solana is just the start. Singularity is live on Solana today and is expanding to Ethereum and other EVM chains first, so missions can reach even more investors over time.",
  },
];

const tokenomics = [
  { share: "80%", label: "On the market", detail: "Placed on the market for investors to buy, sell, and trade" },
  { share: "20%", label: "Reserved for the work", detail: "Set aside to pay people working on your mission and fund the next milestone" },
];

const missionTypes = [
  "AI products",
  "B2B SaaS",
  "Fintech",
  "Healthcare",
  "Open source",
  "Research",
  "Public goods",
  "Anything with value",
];

const techStack = [
  { label: "Chain", value: "Solana + Anchor programs" },
  { label: "Markets", value: "Meteora DBC → DAMM v2" },
  { label: "Quote", value: "USDC" },
  { label: "Tokens", value: "Token-2022 mission tokens" },
  { label: "Platform", value: "Next.js App Router" },
  { label: "Auth", value: "Privy wallet sessions" },
  { label: "Data", value: "Postgres indexer (5 min sync)" },
  { label: "Landing", value: "Vite + Three.js WebGL" },
];

const differentiators = [
  { title: "Any stage", body: "For orgs and startups just getting started or already shipping, with one public path to raise and pay for the work." },
  { title: "We handle the setup", body: "Launch page, fund, investor onboarding. You don't need to learn anything technical." },
  { title: "No equity needed", body: "Investors trade a mission token. You don't give up equity or ownership. If it does not work out, no strings attached." },
  { title: "Fund built in", body: "20% of the token supply is reserved for the work from day one, not an afterthought." },
  { title: "Raise in public", body: "A public page and a built-in fund, without pitch decks to closed networks." },
  { title: "Visible payouts", body: "Every request and every payment is on the mission page for everyone to see." },
  { title: "Investor approval", body: "Investors vote before money moves. No backroom decisions." },
];

function LearnPage() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={loaded ? "learn-page loaded" : "learn-page"}>
      <div className="learn-bg" aria-hidden="true">
        <div className="learn-bg-orb learn-bg-orb-orange" />
        <div className="learn-bg-orb learn-bg-orb-purple" />
        <div className="learn-bg-grid" />
      </div>

      <header className="learn-header">
        <BrandWordmark />
        <nav className="learn-header-nav" aria-label="Page navigation">
          <a className="learn-nav-link" href="/">
            Home
          </a>
          <a className="learn-action" href="https://app.singularity.diy">
            Launch platform
          </a>
        </nav>
      </header>

      <main className="learn-main">
        <section className="learn-hero">
          <p className="learn-kicker">Learn more</p>
          <h1>
            Raise money for your mission
            <br />
            <span className="learn-gradient-text">in public.</span>
          </h1>
          <p className="learn-lede">
            Launch a page for your org or startup. Let investors back the work. Pay people working on your mission from a
            built-in fund. We handle the setup. You focus on the mission.
          </p>
        </section>

        <section className="learn-section learn-ai-panel" id="ai-context">
          <div className="learn-panel learn-ai-card">
            <div className="learn-ai-glow" aria-hidden="true" />
            <p className="learn-eyebrow">For your AI assistant</p>
            <h2>Chat with your AI about Singularity</h2>
            <p>
              Copy the link below and paste it into your AI assistant for full product context.
            </p>
            <div className="learn-ai-url-row">
              <code className="learn-ai-url">{SINGULARITY_AI_URL}</code>
              <CopyButton text={SINGULARITY_AI_URL} label="Copy link" />
            </div>
            <div className="learn-ai-prompt">
              <details open>
                <summary className="learn-ai-prompt-label">Or copy this ready-made prompt</summary>
                <blockquote>{SINGULARITY_AI_PROMPT}</blockquote>
                <CopyButton text={SINGULARITY_AI_PROMPT} label="Copy prompt" />
              </details>
            </div>
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Overview</p>
          <h2>What is Singularity?</h2>
          <div className="learn-prose">
            <p>
              Singularity helps orgs and startups at any stage raise money in public. You get a launch page, a way for
              investors to back the work, and a fund reserved for paying people working on your mission. We handle
              everything behind the scenes.
            </p>
            <p>
              Open to anybody with a mission that creates value: AI, SaaS, fintech, open source, research, public
              goods, or something entirely new.
            </p>
          </div>
          <div className="learn-quote">
            <p>Every org deserves a public path to raise money.</p>
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">The gap</p>
          <h2>Fundraising shouldn't depend on who you know</h2>
          <div className="learn-prose">
            <p>
              Most missions still raise behind closed doors: pitch decks, warm intros, and investor circles you have
              to fight your way into. You can ship a product, grow users, and still go months without funding because
              nobody with capital ever saw your work.
            </p>
            <p>
              Singularity gives you a public path instead. Launch a page anyone can find, let investors back the mission
              from day one, and pay people working on your mission from a built-in fund, with every payout visible and
              approved.
            </p>
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">How it works</p>
          <h2>From launch to payout</h2>
          <div className="learn-flow">
            {flowSteps.map((item) => (
              <article className="learn-flow-step" key={item.step}>
                <span className="learn-flow-metric">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Token</p>
          <h2>No equity needed. A token for your mission</h2>
          <p className="learn-section-intro">
            On Singularity, you don't give up equity. A mission token is created and traded among investors: 80% of
            the supply on the market, 20% reserved to fund your mission's work. Risk-free for you: if it does not
            work out, there are no strings attached. You keep ownership. No debt to repay, no equity to give back.
          </p>
          <div className="learn-tokenomics">
            {tokenomics.map((item) => (
              <article className="learn-token-card" key={item.share}>
                <strong>{item.share}</strong>
                <h3>{item.label}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <p className="learn-note">
            80% of the token supply is placed on the market for investors to trade. 20% is reserved in a fund to pay
            people working on your mission. The split is built in. You never manage it yourself.
          </p>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Approval</p>
          <h2>Investors vote before money moves</h2>
          <div className="learn-governance-grid">
            <article className="learn-gov-card">
              <h3>6 investor seats</h3>
              <p>The top 6 investors who register to vote. Everyone gets an equal vote, not weighted by how much they invested.</p>
            </article>
            <article className="learn-gov-card">
              <h3>4 of 6 must approve</h3>
              <p>Four yes votes approve a payout request. Three no votes reject it. All visible on the mission page.</p>
            </article>
            <article className="learn-gov-card">
              <h3>3-day review</h3>
              <p>Every request sits for at least 3 days before money moves. No rushed payouts.</p>
            </article>
            <article className="learn-gov-card">
              <h3>Full transparency</h3>
              <p>Every request, vote, and payout is on the mission page. Nothing happens behind closed doors.</p>
            </article>
          </div>
        </section>

        <section className="learn-section learn-tech-note">
          <p className="learn-eyebrow">Under the hood</p>
          <h2>What we handle so you don't have to</h2>
          <div className="learn-prose">
            <p>
              Singularity runs on Solana with Meteora markets and onchain approval rules, but you don't need to know
              any of that. We set up wallets, launch mechanics, and the fund. Investors get a simple way to back your
              mission. You get a public page, a built-in fund, and visible payouts.
            </p>
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Who it's for</p>
          <h2>You, your investors, your team</h2>
          <p className="learn-section-intro">
            Every mission on Singularity connects three groups. Each has a clear role, without overlap or confusion.
          </p>
          <div className="learn-ecosystem">
            {ecosystem.map((item) => (
              <div className="learn-ecosystem-row" key={item.label}>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Investors</p>
          <h2>Millions of potential backers, not a closed circle</h2>
          <p className="learn-section-intro">
            Your mission does not depend on warm intros to a handful of funds. It launches into a large, public
            investor base.
          </p>
          <div className="learn-governance-grid">
            {investorAudience.map((item) => (
              <article className="learn-gov-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="learn-note">
            The top 6 investors who register to vote handle payout approvals on each mission. Many more can invest and
            trade through the public market.
          </p>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Mission types</p>
          <h2>Any mission that provides value</h2>
          <div className="learn-tags">
            {missionTypes.map((type) => (
              <span className="learn-tag" key={type}>
                {type}
              </span>
            ))}
          </div>
          <p className="learn-note">
            It doesn't matter what you're building. If your mission creates real value for users, a community, or
            the world, Singularity is for you, at any stage.
          </p>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Pricing</p>
          <h2>Zero cost for founders</h2>
          <p className="learn-section-intro">
            Launching on Singularity is free. Singularity only charges investors when they invest, never the org
            running the mission. Your fund stays fully reserved for paying people working on your mission.
          </p>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Differentiators</p>
          <h2>Why Singularity</h2>
          <div className="learn-diff-grid">
            {differentiators.map((item) => (
              <article className="learn-diff-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Technology</p>
          <h2>Onchain-first architecture</h2>
          <div className="learn-tech-grid">
            {techStack.map((item) => (
              <article className="learn-tech-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="learn-prose learn-prose-compact">
            <p>
              Canonical financial state lives on Solana via two Anchor programs:{" "}
              <code>singularity_registry</code> for mission lifecycle and <code>singularity_council</code> for
              governance, funding requests, voting, and escrow. A Postgres indexer watches chain state every 5 minutes
              for fast UI reads. Most actions follow a prepare → sign → confirm flow through Privy-authenticated
              sessions.
            </p>
          </div>
        </section>

        <section className="learn-section">
          <p className="learn-eyebrow">Platform</p>
          <h2>Where to go next</h2>
          <div className="learn-links">
            <a className="learn-link-card learn-link-primary" href="https://app.singularity.diy">
              <span>Platform</span>
              <strong>app.singularity.diy</strong>
              <p>Launch your mission, co-market the story, and fund the work that moves it forward.</p>
            </a>
            <a className="learn-link-card" href="https://github.com/n0umen0n/Singularity" target="_blank" rel="noreferrer">
              <span>Open source</span>
              <strong>GitHub</strong>
              <p>Full monorepo: programs, indexer, platform app, and landing page.</p>
            </a>
            <a className="learn-link-card" href="https://www.meteora.ag/?tab=top" target="_blank" rel="noreferrer">
              <span>Markets powered by</span>
              <strong>Meteora</strong>
              <p>Dynamic Bonding Curves at launch, DAMM v2 after graduation.</p>
            </a>
            <a className="learn-link-card" href="https://x.com/fundraisebest" target="_blank" rel="noreferrer">
              <span>Community</span>
              <strong>X / Telegram</strong>
              <p>Follow updates and join the conversation.</p>
            </a>
          </div>
        </section>

        <section className="learn-cta">
          <h2>Ready to launch your mission?</h2>
          <p>Tell your story. We handle the rest.</p>
          <div className="learn-cta-actions">
            <a className="learn-action" href="https://app.singularity.diy">
              Launch platform
            </a>
            <a className="learn-action-secondary" href="/">
              Back to home
            </a>
          </div>
        </section>
      </main>

      <footer className="learn-footer">
        <BrandWordmark />
        <p>Powered by Meteora · Built on Solana</p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LearnPage />
  </React.StrictMode>,
);
