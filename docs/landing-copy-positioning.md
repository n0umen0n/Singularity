# Singularity Landing Copy Positioning

## Recommendation

Use this as the primary landing-page thesis:

**Launch a token. Fund the builders. Keep it onchain.**

This is clearer than "govern mission capital" because it tells the visitor what Singularity actually helps happen:

- A mission launches a token.
- Part of the supply becomes mission treasury.
- Builders and contributors can request funding.
- The approval and payout flow happens through onchain rules.

Use **builders** in the headline. It is the strongest word for the brand because it feels crypto-native, active, and broad enough to include product, community, research, and ecosystem work.

Use **contributors** in body copy when you want to sound more inclusive or precise.

Avoid **workers** in the hero. It sounds more like a labor marketplace than a crypto-native mission funding platform.

## Bleeding Neck Problem

The urgent problem Singularity solves is not simply that fundraising is hard. That is too broad.

The sharper problem is:

**Token holders get exposure, not control.**

After a token launch, the market can create buyers and sellers, but it does not answer the operational question: who gets paid, who approves it, and how treasury tokens actually move. Meaningful supply or treasury power can still sit with a few wallets, a multisig, or a legal entity token holders cannot practically steer. The result is a control gap: price discovery is onchain, but mission funding decisions can remain discretionary.

That is where the two worlds collide:

- Crypto-native fundraising creates public tokens, public liquidity, and public holders.
- Traditional operating structures still control treasury movement, contributor funding, and execution.
- Holders get market exposure, but not always a legible system for how mission capital gets deployed.
- Builders may want to contribute, but funding is often routed through opaque grants, founder discretion, DMs, or multisig politics.

Singularity turns this missing layer into an onchain funding system.

## Who It Is For

### Mission Founders

Founders who want to launch a mission token, build a market around it, and avoid looking arbitrary after launch. Singularity gives them a structured way to reserve mission capital, route funding requests, and show how builder payouts are approved.

### Token Communities

Token holders who want more than price exposure. They need a visible process for how reserved treasury supply can move to builders, contributors, and ecosystem work.

### Builders and Contributors

People who want to work for emerging token ecosystems but need a clearer path from useful contribution to treasury-funded payout.

## Positioning

Primary line:

**Launch a token. Fund the builders. Keep it onchain.**

Supporting line:

**Singularity turns token launches into onchain funding systems for missions.**

Shorter supporting line:

**A mission market with the treasury and funding flow built in.**

More direct comparison:

**Most launchpads stop at distribution. Singularity continues into allocation.**

## Landing Page Copy

### Intro

```ts
{
  eyebrow: "Singularity",
  label: "Intro",
  title: "Launch a token. Fund the builders. Keep it onchain.",
  body: "Singularity turns token launches into onchain funding systems for missions.",
}
```

Alternative intro body:

```ts
body: "Create a mission market, reserve treasury supply, and fund contributors through approval flows that live where the token lives: onchain.",
```

### Problem

I would rename the eyebrow from "The problem" to **The gap**. It is more precise and less accusatory.

```ts
{
  eyebrow: "The gap",
  label: "Problem",
  title: "Token holders get exposure, not control.",
  body: "A token launch can create buyers and sellers, but it does not answer the operational question: who gets paid, who approves it, and how treasury tokens actually move.",
}
```

Alternative stronger title:

```ts
title: "The token trades in public. The treasury still moves in private.",
```

Alternative shorter body:

```ts
body: "The market is onchain, but the mission's capital can still move through discretionary decisions holders cannot practically steer.",
```

### Solution

```ts
{
  eyebrow: "The solution",
  label: "Solution",
  title: "A funding system built into every mission token",
  body: "Singularity gives every mission a tradable token, a reserved treasury, and an onchain flow for funding builders through council approval and delayed execution.",
  lines: ["Reserved mission treasury", "Council-approved funding requests", "Delayed onchain execution"],
}
```

Alternative solution title:

```ts
title: "From token launch to builder payouts, onchain",
```

### Create

```ts
{
  eyebrow: "How it works / Create",
  label: "Create",
  title: "Launch a mission market",
  body: "Define the mission, open the market, and set the treasury rules for how builder funding can move.",
}
```

### Tokenize

```ts
{
  eyebrow: "How it works / Tokenize",
  label: "Token",
  title: "Tokenomics with mission funding built in",
  body: "Every mission launches with a tradable token and a reserved treasury for funding the work.",
  lines: ["80% bonding curve / AMM", "20% mission treasury"],
}
```

### Invest

```ts
{
  eyebrow: "How it works / Invest",
  label: "Invest",
  title: "Back missions early",
  body: "Discover emerging missions, enter the market, and participate in the upside of work you want to see built.",
}
```

### Build

```ts
{
  eyebrow: "How it works / Build",
  label: "Build",
  title: "Builders request funding",
  body: "Contribute product work, community growth, research, or ecosystem tasks, then request treasury funding from the mission.",
  lines: ["Product work", "Community growth", "Research", "Ecosystem tasks"],
}
```

### Allocate

```ts
{
  eyebrow: "How it works / Allocate",
  label: "Allocate",
  title: "Move treasury by approval, not discretion",
  body: "Funding requests pass through mission-token council approval and delayed execution before treasury tokens move to contributors.",
  lines: ["Council approvals", "Timelock protection"],
}
```

## Meta Copy

Suggested page title:

```html
<title>Singularity | Launch tokens with onchain builder funding</title>
```

Suggested meta description:

```html
<meta
  name="description"
  content="Singularity turns token launches into mission funding systems with reserved treasuries, council-approved requests, and onchain builder payouts."
/>
```

Suggested Open Graph title:

```html
<meta property="og:title" content="Singularity | Launch tokens with onchain builder funding" />
```

Suggested Open Graph description:

```html
<meta
  property="og:description"
  content="Launch a token, reserve mission treasury, and fund builders through onchain approval flows."
/>
```

## Copy Principles

- Lead with what people understand: token launch, treasury, builders, payouts.
- Use "governance" carefully; it is accurate but abstract.
- Do not over-attack legal entities. The problem is not that legal structures exist; the problem is when token communities cannot see or influence how mission capital moves.
- Avoid "ownership" unless the legal and product model truly grants ownership rights.
- Use "onchain" to describe the funding system, not as a magic solution to legal complexity.
- Make the solution concrete: reserved treasury, funding requests, council approval, delayed execution.

## Best Headline Options

1. **Launch a token. Fund the builders. Keep it onchain.**
2. **From token launch to builder payouts, onchain.**
3. **Launch tokens with builder funding built in.**
4. **Turn token launches into onchain funding systems.**
5. **Launch a mission market with its treasury built in.**

The best all-around option is:

**Launch a token. Fund the builders. Keep it onchain.**

It is concrete, memorable, and maps directly to the product.

---

## Non-Crypto Founder Variant (Draft)

Use this variant for outbound, founder calls, and design-partner conversations with non-crypto ICP. Do not ship to the live landing page until the discovery sprint validates language on calls.

See [`discovery-sprint-non-crypto.md`](marketing/discovery-sprint-non-crypto.md) for validation criteria.

### Thesis

**Turn your mission into a public funding market — without becoming a crypto company.**

Singularity handles wallets, tokens, treasury, and supporter onboarding. Founders focus on the mission and launch story.

### Bleeding Neck Problem (Non-Crypto)

The urgent problem for non-crypto founders is not token-holder governance. It is:

**Strong missions stall when capital only flows to hype or insider networks.**

Credible projects with visible proof of work can still fail to raise through angels, VCs, or grants. Bootstrapping runs out. Grants are slow or reject good work. The mission is public, but the funding path is not.

Singularity gives these missions a public funding market and treasury — with Singularity running the crypto layer end-to-end.

### Who It Is For (Non-Crypto)

#### Mission Founders Outside Crypto

Founders building climate, education, health, open source, indie SaaS, or research projects who need capital and distribution but do not want to become crypto companies. Singularity tokenizes the mission, runs the launch, and makes treasury funding visible.

#### Communities That Want To Back Real Work

Newsletter readers, users, open-source dependents, and mission-aligned supporters who want to back work they believe in — without needing deep crypto knowledge.

#### Builders And Contributors

People who want to do paid work for mission-driven projects and need a visible path from contribution to funded payout.

### Positioning (Non-Crypto)

Primary line:

**Turn your mission into a public funding market — without becoming a crypto company.**

Supporting line:

**Singularity handles the crypto layer. You focus on the mission.**

Shorter supporting line:

**Community-backed funding for missions that traditional capital overlooks.**

Comparison line:

**Most fundraising stops at insiders. Singularity opens a public market with a treasury for the work.**

### Landing Page Copy (Non-Crypto Draft)

#### Intro

```ts
{
  eyebrow: "Singularity",
  label: "Intro",
  title: "Turn your mission into a public funding market.",
  body: "Singularity handles the crypto layer. You focus on the mission, launch story, and the work that needs funding.",
}
```

#### Problem

```ts
{
  eyebrow: "The gap",
  label: "Problem",
  title: "Strong missions stall when capital only flows to hype or insider networks.",
  body: "You have proof the work matters. Traditional fundraising may still be slow, opaque, or closed. The mission is public, but the funding path is not.",
}
```

#### Solution

```ts
{
  eyebrow: "The solution",
  label: "Solution",
  title: "A public funding market with a treasury for the work",
  body: "Singularity turns your mission into a launchable market with a reserved treasury and a visible path to fund contributors — without you needing to understand wallets or token mechanics.",
  lines: ["Reserved mission treasury", "Visible funding requests", "White-glove launch support"],
}
```

#### How It Works (Non-Crypto)

```ts
{
  eyebrow: "How it works",
  label: "Launch",
  title: "We handle the launch. You tell the story.",
  body: "Define the mission, approve the narrative, and co-market the launch. Singularity configures the market, treasury, and supporter onboarding.",
}
```

### Meta Copy (Non-Crypto Draft)

Suggested page title:

```html
<title>Singularity | Community-backed funding for mission-driven projects</title>
```

Suggested meta description:

```html
<meta
  name="description"
  content="Turn your mission into a public funding market with a reserved treasury. Singularity handles the crypto layer so you can focus on the work."
/>
```

### Copy Principles (Non-Crypto)

- Lead with mission and fundraising pain, not crypto mechanics.
- Say "we handle the crypto layer" early to reduce friction.
- Avoid jargon: bonding curve, onchain, governance, wallet — unless explaining to supporters separately.
- Do not promise VC outcomes or guaranteed returns.
- Make the white-glove offer explicit: Singularity runs the launch, founder tells the story.
- Keep the crypto-native variant (above) for onchain-audience pages and secondary pre-token crypto segment.

### When To Use Which Variant

| Audience | Variant |
| --- | --- |
| Non-crypto founders (primary ICP) | Non-crypto founder variant |
| Crypto-literate supporters and pre-token crypto-adjacent teams | Crypto-native variant (default above) |
| Live landing page | Keep crypto-native until discovery sprint validates non-crypto copy |
