create table if not exists profiles (
  wallet_address text primary key,
  display_name text not null,
  avatar_url text,
  bio text,
  socials jsonb not null default '[]'::jsonb,
  balances jsonb not null default '{}'::jsonb,
  token_balances jsonb not null default '[]'::jsonb,
  created_missions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists missions (
  id text primary key,
  mission_pda text unique,
  creator_wallet text not null,
  token_mint text,
  dbc_pool text,
  damm_pool text,
  treasury_vault text,
  lifecycle_state text not null default 'draft',
  metadata_hash text not null,
  statement text not null,
  description text not null,
  image_url text not null,
  token_image_url text not null,
  token_symbol text not null,
  total_supply numeric(40, 0) not null,
  treasury_supply_percent numeric(8, 4) not null default 20,
  performance_json jsonb not null default '{}'::jsonb,
  council_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pending_mission_launches (
  id text primary key,
  creator_wallet text not null,
  metadata_hash text not null,
  metadata_uri text not null,
  statement text not null,
  description text not null,
  image_url text not null,
  token_image_url text not null,
  token_symbol text not null,
  total_supply numeric(40, 0) not null,
  treasury_supply_percent numeric(8, 4) not null default 20,
  initial_purchase_usdc numeric(40, 6) not null default 0,
  launch_accounts jsonb not null default '{}'::jsonb,
  status text not null default 'prepared' check (status in ('prepared', 'submitted', 'confirmed', 'failed')),
  signature text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists mission_metrics (
  mission_id text primary key references missions(id),
  token_price_usdc numeric(40, 12) not null default 0,
  holders integer not null default 0,
  liquidity_usdc numeric(40, 6) not null default 0,
  treasury_usdc numeric(40, 6) not null default 0,
  treasury_tokens numeric(40, 0) not null default 0,
  market_tokens numeric(40, 6),
  circulating_tokens numeric(40, 6),
  base_reserve numeric(40, 6),
  quote_reserve numeric(40, 6),
  pool_progress_percent numeric(8, 4),
  treasury_allocation_claimed boolean,
  market_data_updated_at timestamptz,
  volume_usdc numeric(40, 6) not null default 0,
  updated_at timestamptz not null default now()
);

alter table mission_metrics add column if not exists market_tokens numeric(40, 6);
alter table mission_metrics add column if not exists circulating_tokens numeric(40, 6);
alter table mission_metrics add column if not exists base_reserve numeric(40, 6);
alter table mission_metrics add column if not exists quote_reserve numeric(40, 6);
alter table mission_metrics add column if not exists pool_progress_percent numeric(8, 4);
alter table mission_metrics add column if not exists treasury_allocation_claimed boolean;
alter table mission_metrics add column if not exists market_data_updated_at timestamptz;

create table if not exists price_points (
  id bigserial primary key,
  mission_id text not null references missions(id),
  timestamp timestamptz not null,
  price_usdc numeric(40, 12) not null,
  volume_usdc numeric(40, 6) not null default 0,
  source text not null
);

create table if not exists council_candidates (
  id bigserial primary key,
  mission_id text not null references missions(id),
  owner_wallet text not null,
  latest_checkpoint_balance numeric(40, 0) not null default 0,
  status text not null default 'registered',
  created_at timestamptz not null default now(),
  unique (mission_id, owner_wallet)
);

create table if not exists epoch_councils (
  id bigserial primary key,
  mission_id text not null references missions(id),
  epoch_number integer not null,
  member_wallets jsonb not null,
  checkpoint_balances jsonb not null,
  escrow_amounts jsonb not null default '[]'::jsonb,
  checkpoint_slot bigint,
  finalized_at timestamptz not null default now(),
  unique (mission_id, epoch_number)
);

create table if not exists funding_requests (
  id text primary key,
  request_pda text unique,
  mission_id text not null references missions(id),
  requester_wallet text not null,
  recipient_wallet text not null,
  mission_token_amount numeric(40, 0) not null,
  derived_usd_estimate numeric(40, 6) not null,
  status text not null default 'active',
  metadata_hash text not null,
  title text not null,
  description text not null,
  voting_starts_at timestamptz not null default now(),
  voting_ends_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists funding_request_votes (
  id bigserial primary key,
  request_id text not null references funding_requests(id),
  voter_wallet text not null,
  vote text not null check (vote in ('approve', 'reject')),
  signature text,
  slot bigint,
  created_at timestamptz not null default now(),
  unique (request_id, voter_wallet)
);

create table if not exists reward_epochs (
  id bigserial primary key,
  mission_id text not null references missions(id),
  epoch_number integer not null,
  source_usdc_amount numeric(40, 6) not null,
  creator_amount numeric(40, 6) not null,
  platform_amount numeric(40, 6) not null,
  council_amount numeric(40, 6) not null,
  other_lockers_amount numeric(40, 6) not null,
  created_at timestamptz not null default now(),
  unique (mission_id, epoch_number)
);

create table if not exists transactions (
  signature text primary key,
  wallet text not null,
  mission_id text references missions(id),
  type text not null,
  status text not null,
  slot bigint,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists auth_nonces (
  nonce text primary key,
  wallet_address text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists metadata_uploads (
  hash text primary key,
  uri text not null,
  owner_wallet text not null,
  content_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists indexer_state (
  source text primary key,
  last_slot bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists raw_chain_events (
  id bigserial primary key,
  source text not null,
  signature text not null,
  slot bigint not null,
  program_id text not null,
  instruction_index integer not null default 0,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (signature, instruction_index)
);

create table if not exists migration_reconciliation_jobs (
  id bigserial primary key,
  mission_id text references missions(id),
  dbc_pool text not null,
  damm_pool text,
  signature text,
  slot bigint,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dbc_pool, signature)
);

create index if not exists idx_mission_metrics_liquidity_usdc on mission_metrics (liquidity_usdc desc);
create index if not exists idx_mission_metrics_holders on mission_metrics (holders desc);
create index if not exists idx_missions_created_at on missions (created_at desc);
create index if not exists idx_funding_requests_mission_id on funding_requests (mission_id);
create index if not exists idx_funding_requests_requester_wallet on funding_requests (requester_wallet);
create index if not exists idx_funding_request_votes_request_id on funding_request_votes (request_id);
create index if not exists idx_council_candidates_mission_status on council_candidates (mission_id, status);

create table if not exists platform_metric_snapshots (
  id bigserial primary key,
  collected_at timestamptz not null default now(),
  source text not null,
  total_value_locked_usdc numeric(40, 6) not null default 0,
  bonding_value_locked_usdc numeric(40, 6) not null default 0,
  graduated_value_locked_usdc numeric(40, 6) not null default 0,
  treasury_value_usdc numeric(40, 6) not null default 0,
  total_mission_token_volume_usdc numeric(40, 6) not null default 0,
  total_mission_token_market_value_usdc numeric(40, 6) not null default 0,
  circulating_mission_token_market_value_usdc numeric(40, 6) not null default 0,
  funding_requested_value_usdc numeric(40, 6) not null default 0,
  missions_count bigint not null default 0,
  launched_missions_count bigint not null default 0,
  bonding_missions_count bigint not null default 0,
  graduated_missions_count bigint not null default 0,
  dbc_pools_count bigint not null default 0,
  damm_pools_count bigint not null default 0,
  funding_requests_count bigint not null default 0,
  active_funding_requests_count bigint not null default 0,
  accepted_funding_requests_count bigint not null default 0,
  rejected_funding_requests_count bigint not null default 0,
  expired_funding_requests_count bigint not null default 0,
  registered_councillors_count bigint not null default 0,
  unique_councillor_wallets_count bigint not null default 0,
  price_points_count bigint not null default 0,
  raw_chain_events_count bigint not null default 0,
  indexed_transactions_count bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists price_points_mission_timestamp_idx on price_points (mission_id, timestamp desc);
create index if not exists missions_symbol_idx on missions (token_symbol);
create index if not exists funding_requests_mission_status_idx on funding_requests (mission_id, status);
create index if not exists auth_nonces_expires_at_idx on auth_nonces (expires_at);
create index if not exists raw_chain_events_program_slot_idx on raw_chain_events (program_id, slot desc);
create index if not exists migration_reconciliation_jobs_status_idx on migration_reconciliation_jobs (status, updated_at);
create index if not exists pending_mission_launches_creator_status_idx on pending_mission_launches (creator_wallet, status);
create index if not exists platform_metric_snapshots_collected_at_idx on platform_metric_snapshots (collected_at desc);

alter table profiles add column if not exists balances jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists token_balances jsonb not null default '[]'::jsonb;
alter table profiles add column if not exists created_missions jsonb not null default '[]'::jsonb;
alter table missions add column if not exists performance_json jsonb not null default '{}'::jsonb;
alter table missions add column if not exists council_json jsonb not null default '[]'::jsonb;
alter table funding_requests add column if not exists epoch_number integer not null default 1;
alter table funding_requests add column if not exists executed_at timestamptz;
alter table epoch_councils add column if not exists escrow_amounts jsonb not null default '[]'::jsonb;
