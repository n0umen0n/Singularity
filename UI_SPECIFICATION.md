# Singularity Platform UI Specification

Last updated: 2026-05-20

This document defines the product UI for the Singularity platform. The platform app in `apps/app` implements these screens against live API routes; use this spec as the source of truth for visual and interaction requirements.

Singularity should feel like a premium crypto-native fundraising terminal: cinematic, dark, liquid, intelligent, and trustworthy. The landing page already establishes the visual language: a black cosmic background, glowing orange and purple singularity geometry, cream typography, glass surfaces, subtle grid lines, and precise uppercase labels. The product app must extend that identity into a usable dashboard without losing the sense of wonder.

## Product Positioning

Singularity lets people launch mission markets, buy mission tokens, allocate treasury funds, and fund builders through treasury council approval.

Core product objects:

- `Mission`: a goal, market, token, treasury, funding request feed, and investor community.
- `Mission token`: the tradable token attached to a mission.
- `Treasury`: 20% of mission token supply, shown in USDC value and project token amount.
- `Treasury council`: the top 6 registered mission-token investors of a mission.
- `Funding request`: a proposal to receive treasury funds for mission-related work.
- `Profile`: a wallet-based identity showing balances, missions, council roles, and user-created requests.

## Visual Direction

Use the landing page as the source of truth.

### Brand Motifs

- The Singularity logo is an hourglass/cone made of curved orbital lines and rings.
- The UI should reuse this shape as:
  - the navbar logo;
  - loading state;
  - empty state watermark;
  - subtle background line art on app pages;
  - mission card hover glow;
  - token placeholder icon if a mission has no uploaded token image.
- Visual personality: cosmic, advanced, high-signal, premium fintech.
- Avoid playful cartoon crypto styling, generic Web3 gradients, or flat white SaaS dashboards.

### Design Principles

- Dark-first interface with off-white text, not pure white.
- Bento-style information density: important data lives in structured cards, not long text pages.
- Glassmorphism used selectively for primary surfaces with strong contrast and readable text.
- Every financial action must feel deliberate: clear hierarchy, confirmation states, and visible numbers.
- Motion should make the interface feel alive, but never block tasks.
- The app should look impressive in screenshots at desktop width.

## Design Tokens

### Colors

Use these tokens across the app.

```css
:root {
  --bg-primary: #020203;
  --bg-elevated: rgba(8, 8, 11, 0.68);
  --bg-panel: rgba(255, 247, 237, 0.045);
  --bg-panel-strong: rgba(255, 247, 237, 0.075);

  --text-primary: #fff7ed;
  --text-secondary: rgba(255, 247, 237, 0.72);
  --text-muted: rgba(255, 247, 237, 0.52);
  --text-faint: rgba(255, 247, 237, 0.32);

  --line-subtle: rgba(255, 247, 237, 0.12);
  --line-strong: rgba(255, 247, 237, 0.22);

  --accent-orange: #ff6a4a;
  --accent-orange-soft: #ff7a5f;
  --accent-purple: #766cff;
  --accent-purple-soft: #8f7cff;
  --accent-cream: #fff7ed;

  --success: #55f0a8;
  --warning: #ffca5f;
  --danger: #ff5f7a;
  --info: #76d4ff;
}
```

### Backgrounds

Default app background:

```css
background:
  radial-gradient(circle at 18% 10%, rgba(255, 106, 74, 0.13), transparent 30rem),
  radial-gradient(circle at 84% 18%, rgba(118, 108, 255, 0.16), transparent 34rem),
  radial-gradient(circle at 50% 92%, rgba(255, 106, 74, 0.08), transparent 28rem),
  #020203;
```

Add a faint grid overlay on main app pages:

- 1px lines.
- Color: `rgba(255, 255, 255, 0.025)`.
- Grid size: 72px desktop, 48px mobile.
- Mask the grid with a radial gradient so it fades near the edges.

### Typography

Use `Inter` as the primary font because the landing page already uses it.

Recommended scale:

- Page title: 44-64px desktop, 34-42px tablet, 30-36px mobile. Weight 640, letter spacing `-0.04em`.
- Section title: 20-28px. Weight 680, letter spacing `-0.02em`.
- Card title: 17-20px. Weight 720.
- Body text: 15-16px. Line height 1.55-1.7.
- Caption and labels: 11-12px uppercase, weight 850-900, letter spacing `0.16em-0.28em`.
- Financial numbers: use `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` for values where alignment matters.

### Spacing

- App shell horizontal padding: 40px desktop, 28px tablet, 18px mobile.
- Main content max width: 1440px.
- Section gap: 28-40px.
- Card gap: 16-24px.
- Card padding: 20-28px desktop, 16-20px mobile.
- Border radius:
  - Small controls: 12px.
  - Cards: 22px.
  - Large hero panels: 32px.
  - Pills/buttons: 999px.

### Surfaces

Primary card surface:

```css
background: rgba(255, 247, 237, 0.045);
border: 1px solid rgba(255, 247, 237, 0.12);
box-shadow:
  0 0 0 1px rgba(255, 247, 237, 0.025) inset,
  0 24px 70px rgba(0, 0, 0, 0.32);
backdrop-filter: blur(22px);
```

Important card hover:

```css
border-color: rgba(255, 247, 237, 0.26);
box-shadow:
  0 0 0 1px rgba(255, 247, 237, 0.06) inset,
  0 24px 70px rgba(0, 0, 0, 0.38),
  0 0 46px rgba(118, 108, 255, 0.14),
  0 0 38px rgba(255, 106, 74, 0.10);
transform: translateY(-2px);
```

Limit heavy blur on mobile for performance. Mobile glass panels should use blur around 12-16px.

## App Shell

### Desktop Navigation

Height: 76px. Sticky at top with a transparent-to-glass background.

Layout:

- Left: Singularity logo and wordmark.
- Center: primary nav links: `Missions`, `Launch`, `Profile` when logged in.
- Right logged out: `Sign in` secondary button and `Create mission` primary button.
- Right logged in: `Create mission` primary button, wallet/account pill, profile avatar button.

Navigation visual details:

- Wordmark matches landing page: uppercase, high letter spacing, cream text, orange/purple glow.
- Navbar background after scroll: `rgba(2, 2, 3, 0.72)` with `backdrop-filter: blur(24px)`.
- Bottom border: `1px solid rgba(255, 247, 237, 0.09)`.
- Active nav item: cream text with a tiny glowing underline using orange-to-purple gradient.

### Mobile Navigation

Use a bottom navigation bar and compact top header.

Top header:

- Left: logo icon and `Singularity`.
- Right: wallet/profile button.

Bottom nav:

- Fixed bottom glass bar.
- Items: `Missions`, `Launch`, `Profile`.
- Primary action `Create` can be a glowing center pill if space allows.

### Buttons

Primary button:

- Gradient: orange to purple.
- Border: `1px solid rgba(255, 247, 237, 0.32)`.
- Text: uppercase 12px, weight 900, letter spacing `0.16em`.
- Height: 44px small, 52px default.
- Include a subtle shine animation only on the most important CTA per screen.

Secondary button:

- Transparent glass.
- Border: `rgba(255, 247, 237, 0.16)`.
- Text: cream at 78% opacity.

Danger/sell button:

- Use dark glass base with danger red border/glow, not a solid red fill.

### Forms

Inputs:

- Height: 52px.
- Radius: 16px.
- Background: `rgba(255, 247, 237, 0.055)`.
- Border: `1px solid rgba(255, 247, 237, 0.14)`.
- Focus border: `rgba(255, 247, 237, 0.34)`.
- Focus glow: `0 0 0 4px rgba(118, 108, 255, 0.12)`.
- Labels are uppercase micro-labels.
- Helper text is muted cream.

Textarea:

- Minimum height: 140px.
- Character count at bottom right.

Image upload:

- Large dropzone with preview.
- Use dashed border and a faint Singularity logo watermark.
- States: empty, uploading, preview, error.

### Data Display

Financial values:

- Large value on first line.
- Unit and conversion on second line.
- Use mono font for raw values and percentages.

Status pills:

- `Active`: purple/blue glow.
- `Accepted`: green glow.
- `Rejected`: red glow.
- `Pending`: warm amber glow.
- `Council`: orange/purple gradient outline.

## Screen 1: Landing Page

The existing landing page is the current source of truth and should remain visually consistent.

Required app entry changes:

- Add platform navigation CTA once the web app routes exist:
  - Logged out: `Sign in`, `Explore missions`, `Create mission`.
  - Logged in: `Missions`, `Create mission`, profile avatar.
- Preserve the scroll-reactive WebGL singularity structure.
- Preserve the current chapter narrative:
  - Fundraising redefined.
  - Capital forms around missions.
  - Tokenomics: 80% AMM, 20% treasury.
  - Allocate capital together.

Landing page should route:

- `Explore missions` -> Mission aggregate view.
- `Create mission` -> Launch mission view.
- `Sign in` -> wallet/auth flow.

## Screen 2: Mission Aggregate View

Route: `/missions`

Purpose: help users discover mission markets quickly, compare liquidity, and enter mission detail pages.

### Desktop Layout

Use an app shell with max width 1440px.

Top area:

- Navbar at top.
- Page header below navbar.
- Left upper corner of content: `Missions`.
- Under the title: one-line subtitle, for example `Discover mission markets and back the futures you want to exist.`
- Right side of header: `Create mission` button.

Header specs:

- `Missions` title: 56px desktop, 36px mobile.
- Header height: around 180px including search/filter row.
- Add a faint large Singularity cone watermark on the right behind the header at 8-12% opacity.

Search row:

- Full-width glass search bar, height 58px.
- Placeholder: `Search missions, tokens, descriptions...`
- Left icon: magnifier.
- Right side optional filters:
  - `All`
  - `Highest liquidity`
  - `Newest`
  - `Treasury size`
  - `Council activity`
- On mobile, filters become horizontally scrollable pills under the search input.

Mission grid:

- Desktop: 3 columns.
- Large desktop: 4 columns if viewport is above 1600px.
- Tablet: 2 columns.
- Mobile: 1 column.
- Gap: 20px.

### Mission Card

Card dimensions:

- Desktop min height: 390px.
- Radius: 26px.
- Padding: 16px image container, 20px content.

Card content:

1. Mission image.
2. Total liquidity in AMM or curve.
3. Mission statement.
4. Mission description.

Card layout:

- Top image area: 16:10 aspect ratio, radius 20px, overflow hidden.
- Overlay at top left of image: token image/avatar, 42px circle.
- Overlay at top right: liquidity pill, for example `$1.24M liquidity`.
- Body:
  - Mission statement as title, max 2 lines.
  - Mission description, max 3 lines.
  - Footer row with token symbol, holder count, and small arrow icon.

Card visual interaction:

- On hover, image scales to 1.04.
- Border becomes brighter.
- Add orange/purple glow around the card.
- Arrow icon moves 4px right.

Empty and loading states:

- Loading: skeleton glass cards with shimmer.
- Empty search: centered card with Singularity icon and `No missions found`.

## Screen 3: Mission Page View

Route: `/missions/:missionId`

Purpose: combine mission story, market data, treasury governance, and trading actions.

### Desktop Layout

Use a two-column dashboard layout.

- Main column: 66-70% width.
- Right rail: 30-34% width.
- Gap: 24px.
- Content starts below navbar with 32px top margin.

### Mission Hero

Position: top of main column, spanning main content width.

Hero card:

- Radius: 32px.
- Height: 420-500px desktop.
- Mobile height: 320px.
- Background is mission image with dark gradient overlay.
- Top left: breadcrumb `Missions / TOKEN`.
- Top right: liquidity pill.
- Bottom left: mission statement and description.
- Bottom right: token image and symbol.

Required content:

1. Mission image.
2. Token image.
3. Total liquidity in AMM or curve.
4. Mission statement.
5. Mission description.

Hero typography:

- Mission statement: 48-64px desktop, 34-42px mobile.
- Description: 16-18px, max width 680px.

### Market Stats Row

Place directly under hero as a 4-card bento row.

Cards:

- `Token price`: show price and token symbol, for example `$0.0421 MARS`.
- `Holders`: number of holders.
- `Liquidity`: total liquidity.
- `Treasury`: USDC value.

Card specs:

- Desktop: 4 columns.
- Tablet: 2 columns.
- Mobile: 1 or 2 columns depending width.
- Height: 118px.
- Include small trend sparklines where relevant.

### Price Performance Module

Title: `If you invested $100`

User can click timeframes (in this order):

- `1H`
- `4H`
- `1D`
- `1W`
- `1M`
- `6M`
- `1Y`

Behavior:

- Default selected timeframe: `1D`.
- Main display: `Your $100 would be worth $128.42`.
- Secondary display: `+28.42% over 1D`.
- If negative, use danger red and phrase: `Your $100 would be worth $86.10`.
- Chart should show a smooth area line with orange/purple gradient stroke.
- Tooltip on hover shows timestamp and value.

Layout:

- Put this in a wide card under market stats.
- Height: 340px desktop, 280px mobile.
- Timeframe pills in top right on desktop, under title on mobile.

### Treasury Council Section

Title: `Treasury Council`

Subtitle: `The top 6 registered investors form this mission's treasury council. Funding requests require 4 of 6 approvals. 60% of trading fees are distributed between the top 6 councillors.`

Content:

- Show top 6 registered investors in a 6-card grid.
- Desktop: 3 columns x 2 rows or 6 compact horizontal cards depending available space.
- Each council member card:
  - Profile image.
  - Nickname or shortened address.
  - Token balance.
  - Ownership percentage.
  - Rank badge `#1` to `#6`.
- Highlight with gradient ring around profile image.
- The top investor can have a slightly stronger glow, but do not make it look like they have more governance power than others.
- Add a primary/secondary CTA near the section title: `Become councillor`.
- The CTA opens a registration modal for users who want to become eligible for future council epochs.

Council approval rule:

- Always show `4/6 approvals required` as a persistent pill near the section title.
- Use simple explanatory copy: `Council members are selected from registered candidates by tracked mission-token balances. A funding request passes when at least 4 of 6 approve.`

Council reward rule:

- Show compact helper copy near the CTA: `Councillors share 60% of trading fees. Other registered candidates share 10%.`
- Do not imply unregistered token holders earn council rewards.

### Become Councillor Modal

Triggered by: `Become councillor`.

Purpose: let a user register as a council candidate so their liquid mission-token balance can be tracked for future council epochs and trading-fee rewards.

Modal content:

- Title: `Become councillor`.
- Subtitle: `Register your wallet as a council candidate. Your liquid mission-token balance remains tradable, but voting later requires temporary escrow until the funding request resolves.`
- Current balance row: available mission token balance.
- Candidate registration summary:
  - Registered wallet address.
  - Tracked token accounts.
  - Current tracked mission-token balance.
  - Current estimated council rank, if indexer data is available.
- Eligibility preview:
  - `Council rank estimate`: show whether current tracked balance would place the user in top 6.
  - `Liquid tokens`: tokens remain tradable while registered.
  - `Vote escrow`: if selected as a councillor, voting temporarily escrows the required tokens until the request resolves.
  - `Rewards`: `Top 6 councillors share 60% of trading fees. Other registered candidates share 10%.`
- CTA: `Register candidacy`.
- Secondary action: `Cancel`.

Important states:

- Wallet not connected: CTA says `Sign in to register`.
- No mission token balance: show `Buy tokens to become competitive`.
- Pending transaction: show Singularity ring loader.
- Success: show receipt and next council epoch.
- Error: show actionable message.

### Funding Requests Section

Title: `Funding Requests`

Top right CTA: `Create funding request`

Tabs:

- `Active`
- `Accepted`
- `Rejected`
- `All`

Funding request card required fields:

1. Requester.
2. Request name.
3. Request amount in USD.
4. Council approvals and rejections.
5. Time left until end of request.

Card layout:

- Left:
  - Request status pill.
  - Request name.
  - Requester row with avatar, nickname, shortened address.
- Middle:
  - Amount, for example `$12,500`.
  - Converted mission token amount, for example `297,441 MARS`.
- Right:
  - Approval meter, for example `3 approved / 1 rejected`.
  - Time left, for example `18h 24m left`.
  - `View details` arrow.

Approval visualization:

- Six small council dots.
- Green dot: approved.
- Red dot: rejected.
- Muted dot: not voted.
- Under dots, show `Needs 1 more approval`.

Active request urgency:

- If less than 12 hours remain, time pill becomes amber.
- If expired and unresolved, status becomes `Expired`.

### Treasury Panel

Place in the right rail near the top.

Required content:

- `Treasury funds`: USDC amount.
- Mission token amount in treasury.
- Percentage of total token supply in treasury.

Example layout:

- Large value: `$428,000 USDC`
- Secondary line: `10,000,000 MARS`
- Percentage pill: `20.00% of total supply`
- Mini allocation ring:
  - 20% treasury in orange.
  - 80% AMM/curve in purple.

Include explanatory copy:

`The treasury is reserved for funding work that advances this mission.`

### Buy/Sell Token Panel

Place in right rail below Treasury Panel.

Tabs:

- `Buy`
- `Sell`

Buy form:

- Input: USDC amount.
- Output preview: estimated mission tokens.
- Show price impact.
- Show route/market: AMM or curve.
- Primary CTA: `Buy tokens`.

Sell form:

- Input: mission token amount.
- Output preview: estimated USDC.
- Show price impact.
- CTA: `Sell tokens`.

Important states:

- Wallet not connected: CTA says `Sign in to trade`.
- Insufficient balance: disable CTA and show helper text.
- Bonding market at 100% pool progress: primary CTA becomes `Graduate market` (Meteora DAMM migration) instead of buy/sell.
- Treasury allocation unclaimed: show claim CTA for creators when the 20% allocation has not been moved to the on-chain treasury vault.
- Pending transaction: show spinner using Singularity ring.
- Success: show compact receipt card.

### Mission Page Mobile Layout

Order:

1. Hero.
2. Buy/Sell panel.
3. Market stats.
4. Treasury panel.
5. Price performance.
6. Treasury council.
7. Funding requests.

Use sticky bottom action bar on mobile:

- `Buy`
- `Sell`
- `Request funding`

## Screen 4: Profile Page View

Route: `/profile` or `/profile/:address`

Purpose: show wallet identity, balances, mission participation, council roles, and created funding requests.

### Header

Profile hero card:

- Left: profile image, 96px desktop, 72px mobile.
- Center:
  - Nickname.
  - Short description.
  - Social links.
  - Public key/address with copy button.
- Right:
  - `Edit profile` button if current user.
  - Wallet connection status.

User editable fields:

- Nickname.
- Social links.
- Description.
- Profile image.

Non-editable:

- Account address/public key, derived from logged-in wallet.

### Balances Section

Title: `Balances`

Show:

- USDC balance.
- SOL balance.
- All platform-created mission token balances the user holds.

Do not show mission tokens with zero balance.
Do not show unrelated non-platform tokens.

Layout:

- USDC and SOL as larger top cards.
- Mission tokens in a responsive grid below.
- Each mission token balance card:
  - Token image.
  - Token symbol.
  - Balance.
  - Estimated USD value if available.
  - Link to mission.

### Missions Section

Title: `My Missions`

Show every mission the user is part of through token ownership.

Mission participation card:

- Mission image.
- Mission statement.
- Token balance.
- Ownership percentage.
- Current token value.
- Role indicators:
  - `Investor`
  - `Councillor` if in top 6 registered investors for an epoch.

If user is a councillor, make it unmistakable:

- Add a gradient `Council` badge.
- Add a tiny 6-dot council icon.
- Optionally separate into two subsections:
  - `Council seats`
  - `Investments`

Recommended structure:

- Show `Council seats` first if the user has any.
- Then show `Investments`.

### Funding Requests Created By User

Title: `My Funding Requests`

Show requests the user created across all missions.

Collapsed/general card state:

- Request name.
- Mission token/image.
- Amount requested in USD.
- Status.
- Approval count.
- Time left or final result.

Expanded/detail state after click:

- Full request description.
- Converted mission token amount.
- Council votes with member avatars.
- Timeline:
  - Created.
  - Voting started.
  - Approvals/rejections.
  - Accepted/rejected/expired.
- Link to mission page.

Status colors:

- Active: purple/blue.
- Accepted: green.
- Rejected: red.
- Expired: muted amber/gray.

### Earned Trading Fees Section

Title: `Earned trading fees`

Description: `Trading fees are distributed to mission creators, top councillors, and other registered candidates as markets trade.`

Replace any `Creator trading fees` section with this broader section.

Fee card fields:

1. Mission token/image.
2. Earning role:
   - `Creator`: 10% of trading fees for missions the user created.
   - `Councillor`: share of the 60% council reward allocation for epochs where the user was top 6.
   - `Registered candidate`: pro-rata share of the 10% other registered candidate allocation.
3. Earned amount in USDC.
4. Claimable amount in USDC.
5. CTA: `Claim trading fees`.

Card copy examples:

- `MARS council rewards`
- `SUN creator rewards`
- `TIDE candidate rewards`

Important states:

- No earned fees: show empty state `Register as a council candidate or create a mission to earn trading fees.`
- Pending claim: show compact loading state.
- Success: show receipt with claimed USDC amount.

### Edit Profile Modal

Fields:

- Profile image upload.
- Nickname.
- Description.
- Social links:
  - X/Twitter.
  - Telegram.
  - GitHub.
  - Website.

Validation:

- Nickname max 32 characters.
- Description max 280 characters.
- Social URLs must be valid.

## Screen 5: Launch Mission View

Route: `/missions/new`

Purpose: let a user create a mission, launch its token market, optionally buy initial tokens, and understand tokenomics.

### Page Layout

Desktop:

- Left column: education and tokenomics explanation, sticky.
- Right column: launch form.
- Columns: 40% / 60%.
- Max width: 1280px.

Mobile:

- Explanation first.
- Then form.
- Sticky bottom `Launch mission` button only after required fields are valid.

### Intro Copy

Title: `Launch a mission market`

Description:

`A mission can be anything: a product, research goal, community, protocol, creative project, public good, or ambitious outcome. Singularity creates a market around the mission so investors can back it and builders can request funding to move it forward.`

### Tokenomics Explanation

Use a prominent bento card with an allocation graphic.

Required explanation:

- A market is created for the mission.
- The market is the mission AMM, where investors buy and sell mission tokens.
- 20% of token supply goes to the treasury.
- 80% goes to AMM liquidity.
- Trading fees are shared between the mission creator, Singularity platform, councillors, and other registered candidates.

Visual:

- Donut or split bar:
  - 80% AMM/curve in purple.
  - 20% treasury in orange.
- Include labels and short descriptions:
  - `80% Market liquidity`: available for trading through the AMM or curve.
  - `20% Mission treasury`: reserved for funding mission-related work.
  - `Trading fee rewards`: 10% creator, 20% Singularity platform, 60% councillors, 10% other registered candidates.

### Launch Form

Required fields:

1. Mission image.
2. Mission statement.
3. Mission description.
4. Token symbol.
5. Token image.
6. Initial amount if user wants to buy tokens himself. This must have a minimum.

Field specifications:

Mission image:

- Large upload dropzone.
- Recommended ratio: 16:10.
- Accepted formats: PNG, JPG, WEBP only (SVG uploads are blocked server-side).
- Show crop/preview state.

Mission statement:

- Single-line or short textarea.
- Max 96 characters.
- Helper: `One sharp sentence people can rally around.`

Mission description:

- Textarea.
- Max 1200 characters.
- Helper: `Explain what the mission is, why it matters, and what funded work should advance.`

Token symbol:

- Uppercase input.
- Max 8 characters.
- Allowed characters: A-Z, 0-9.
- Preview as `$SYMBOL`.

Token image:

- Square upload, 1:1 ratio.
- Preview inside circular frame.

Initial purchase:

- Input unit: USDC.
- Helper: `Optional, but the launch requires a minimum initial purchase of [MIN_AMOUNT] USDC if the creator participates.`
- Show estimated tokens received.
- If backend defines a required minimum for all launches, make it explicit in the label.

### Live Preview

Show a sticky preview card near the form on desktop or below the form on mobile.

Preview includes:

- Mission card as it will appear in the mission aggregate page.
- Token symbol.
- Token image.
- Placeholder liquidity until market is created.

### Submit Area

CTA: `Launch mission`

Before launch:

- Show required field checklist.
- Show wallet/network status.
- Show estimated fees.

After click:

- Confirmation modal summarizing:
  - Mission statement.
  - Token symbol.
  - 80/20 allocation.
  - Initial purchase amount.
  - Creator trading fee note.
- Two-step on-chain flow: `prepare-launch` returns a transaction; after wallet submission, `confirm-launch` records the mission.
- Optional DBC simulation preview via `POST /api/markets/dbc-simulation` while editing launch parameters.

States:

- Disabled until required fields pass validation.
- Pending transaction (prepare, sign, confirm).
- Success with link to mission page.
- Error with actionable message.

## Screen 6: Request Funding View

Route: `/missions/:missionId/request-funding`

Purpose: let a user request mission treasury funds with clear governance context.

### Page Layout

Desktop:

- Left column: governance explanation and mission summary.
- Right column: funding request form.
- Columns: 38% / 62%.
- Max width: 1180px.

Mobile:

- Mission summary.
- Governance explanation.
- Form.

### Governance Explanation

Title: `Request mission funding`

Required explanation:

`Funding requests are reviewed by the mission's treasury council. Four of the six council members must approve for the request to pass. Voting lasts at least 3 days for protection purposes. Funding can be requested for any work related to accomplishing the mission, whether by an individual or a team.`

Show as three glass info cards:

- `4/6 approvals`: council approval threshold.
- `3 day minimum`: voting protection period.
- `Mission-related work`: individuals and teams can request funding.

### Mission Summary Card

Include:

- Mission image.
- Token image.
- Mission statement.
- Current treasury funds in USDC.
- Treasury token amount.
- Link back to mission page.

### Request Form

User fields:

1. Request name.
2. Request description.
3. Request amount in USD, converted into mission tokens.

Field specifications:

Request name:

- Max 90 characters.
- Placeholder: `Build the first community analytics dashboard`.

Request description:

- Textarea, min height 180px.
- Max 2000 characters.
- Helper prompt:
  - What will be delivered?
  - Who will do the work?
  - Why does it advance the mission?
  - What does success look like?

Request amount:

- Input in USD.
- Show conversion preview:
  - `$10,000 = 238,095 MARS`
  - `Based on current token price: $0.042`
- Show treasury impact:
  - `This request equals 2.3% of available treasury funds.`
- Validate that requested amount does not exceed available treasury funds.

### Submit Area

CTA: `Submit request`

Before submit:

- Show summary row:
  - Amount in USD.
  - Amount in mission tokens.
  - Voting duration: at least 3 days.
  - Required approvals: 4/6.

After click:

- Confirmation modal:
  - Request name.
  - Amount.
  - Mission.
  - Governance rule.
- Two-step on-chain flow: `prepare` returns a transaction; after wallet submission, `confirm` stores the funding request in Postgres.
- Council votes and execution also use prepare/confirm steps. Vote escrow release is available after requests resolve.

States:

- Pending state while transaction/request creation is submitted.
- Success state routes to request detail or mission page funding request section.

## Cross-Screen Components

### Mission Image Treatment

- Use uploaded images as the emotional anchor.
- Always overlay a dark gradient from bottom to top for text readability.
- If no image exists, generate a branded placeholder:
  - dark radial background;
  - faint grid;
  - central Singularity cone line art;
  - orange/purple gradient glow.

### Token Image Treatment

- Circular by default.
- Border: `1px solid rgba(255, 247, 237, 0.20)`.
- Add soft glow using token image dominant color if available; fallback orange/purple.

### Loading State

Use the Singularity cone or ring as a loading motif.

- Small inline loading: spinning gradient ring.
- Page loading: centered logo with text `Loading mission market...`.
- Skeletons: dark glass rectangles with diagonal shimmer.

### Empty States

Every empty state should include:

- Faint Singularity icon.
- Clear title.
- One sentence explanation.
- Primary action where relevant.

Examples:

- No missions: `No missions yet. Launch the first mission market.`
- No requests: `No funding requests yet. Builders can request treasury funds for mission-related work.`
- No token balances: `You do not hold any mission tokens yet.`

### Error States

Errors should be clear and non-alarming.

- Use red sparingly.
- Show what failed.
- Show what user can do next.
- Keep transaction hashes and technical details inside expandable disclosure.

## Interaction And Motion

Motion style should match the landing page: smooth, glowy, cinematic.

Use:

- Page entrance: fade up 12px, 500-700ms, cubic-bezier `(0.16, 1, 0.3, 1)`.
- Card hover: translate up 2px, 180-220ms.
- Modal: scale from 0.98 to 1 and fade in.
- Chart transitions: animate line draw over 600ms.
- Tab changes: crossfade content and slide active pill.

Avoid:

- Bouncy animations.
- Too many continuous animations inside data-heavy screens.
- Animating financial numbers in a way that makes values hard to read.

Respect `prefers-reduced-motion`:

- Disable shimmer, looping glow, and long transitions.
- Keep state changes instant or short.

## Accessibility Requirements

- Maintain WCAG AA contrast for all text.
- Text over images must have a dark gradient overlay.
- All buttons and links need visible focus states.
- Do not rely on color alone for request status; use text labels and icons.
- Interactive cards must be keyboard reachable.
- Forms need explicit labels, helper text, and error messages.
- Use semantic headings in order.
- Provide alt text for mission images and token images.

## Responsive Breakpoints

Use these breakpoints unless the implementation framework already has established tokens.

- Mobile: 320-639px.
- Tablet: 640-1023px.
- Desktop: 1024-1439px.
- Wide: 1440px+.

Desktop product screens should feel dense and powerful.
Mobile screens should prioritize task order and sticky primary actions.

## Implementation Notes

Current implementation lives in `apps/app`:

- `components/platform.tsx` — mission list, mission detail, launch, request funding, profile, trading, council, and modals.
- `lib/api.ts` — typed client for all backend routes.
- `lib/wallet.tsx` — Privy wallet provider, `POST /api/auth/privy` session verification, and prepared transaction signing.
- `lib/mock-data.ts` — shared TypeScript shapes (runtime data comes from API/Postgres).

Auth:

- Primary login is Privy (`Sign in` opens Privy modal, then backend session via `/api/auth/privy`).
- A Privy-connected wallet is not treated as app-authenticated until the session cookie exists.

Reusable primitives to preserve or extract:

- App shell, glass cards, stat cards, mission cards, token avatars, status pills, council grid, funding request cards, trade panel, image upload, form fields.

Guidelines:

- Reuse brand SVG paths from the landing page for logo and loading states.
- Preserve color variables from `apps/app/app/globals.css`.
- Keep the landing page cinematic and app pages operational, but visually related.
- Use API-backed data with skeleton/empty/error states, not static mock renders.
- Keep financial actions behind explicit confirmation and prepare/confirm transaction flows.
- Use exact route names from this spec unless backend constraints require changes.

