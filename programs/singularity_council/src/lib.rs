use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use std::str::FromStr;

declare_id!("4k7JhCHjs2uoiP1hmvYDawnwJuXMt5ZhUJotvMRqedKS");

const COUNCIL_SIZE: usize = 6;
const APPROVAL_THRESHOLD: u8 = 4;
const REJECTION_THRESHOLD: u8 = 3;
const MIN_VOTING_SECONDS: i64 = 3 * 24 * 60 * 60;
const DEFAULT_COUNCIL_AUTHORITY: &str = "11111111111111111111111111111111";
const DEFAULT_PLATFORM_FEE_RECIPIENT: &str = "11111111111111111111111111111111";

#[program]
pub mod singularity_council {
    use super::*;

    pub fn register_candidate(ctx: Context<RegisterCandidate>) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        candidate.mission = ctx.accounts.mission.key();
        candidate.owner = ctx.accounts.owner.key();
        candidate.registered_at = Clock::get()?.unix_timestamp;
        candidate.bump = ctx.bumps.candidate;

        emit!(CandidateRegistered {
            mission: candidate.mission,
            owner: candidate.owner,
        });

        Ok(())
    }

    pub fn finalize_epoch_council(
        ctx: Context<FinalizeEpochCouncil>,
        epoch: u64,
        members: [Pubkey; COUNCIL_SIZE],
        escrow_amounts: [u64; COUNCIL_SIZE],
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            configured_council_authority()?,
            CouncilError::UnauthorizedAuthority
        );
        require!(
            escrow_amounts_are_valid(&escrow_amounts),
            CouncilError::InvalidEscrowAmount
        );

        let council = &mut ctx.accounts.epoch_council;
        council.mission = ctx.accounts.mission.key();
        council.epoch = epoch;
        council.members = members;
        council.escrow_amounts = escrow_amounts;
        council.finalized_at = Clock::get()?.unix_timestamp;
        council.bump = ctx.bumps.epoch_council;

        emit!(EpochCouncilFinalized {
            mission: council.mission,
            epoch,
            members,
            escrow_amounts,
        });

        Ok(())
    }

    pub fn create_request(
        ctx: Context<CreateFundingRequest>,
        metadata_hash: [u8; 32],
        recipient: Pubkey,
        token_amount: u64,
    ) -> Result<()> {
        require!(token_amount > 0, CouncilError::InvalidAmount);

        let request = &mut ctx.accounts.request;
        request.mission = ctx.accounts.mission.key();
        request.requester = ctx.accounts.requester.key();
        request.epoch_council = ctx.accounts.epoch_council.key();
        request.metadata_hash = metadata_hash;
        request.recipient = recipient;
        request.token_amount = token_amount;
        request.status = RequestStatus::Active as u8;
        request.approvals = 0;
        request.rejections = 0;
        request.created_at = Clock::get()?.unix_timestamp;
        request.executed_at = 0;
        request.bump = ctx.bumps.request;

        emit!(FundingRequestCreated {
            request: request.key(),
            mission: request.mission,
            requester: request.requester,
            recipient,
            token_amount,
            metadata_hash,
        });

        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, approve: bool) -> Result<()> {
        let request = &mut ctx.accounts.request;
        require!(
            request.status == RequestStatus::Active as u8,
            CouncilError::RequestNotActive
        );
        let voter = ctx.accounts.voter.key();
        let member_index = council_member_index(&ctx.accounts.epoch_council.members, &voter)?;
        let escrow_amount = ctx.accounts.epoch_council.escrow_amounts[member_index];
        require!(escrow_amount > 0, CouncilError::InvalidEscrowAmount);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.voter_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vote_escrow_vault.to_account_info(),
                    authority: ctx.accounts.voter.to_account_info(),
                },
            ),
            escrow_amount,
            ctx.accounts.mint.decimals,
        )?;

        let vote = &mut ctx.accounts.vote;
        vote.request = request.key();
        vote.voter = voter;
        vote.approve = approve;
        vote.escrow_amount = escrow_amount;
        vote.created_at = Clock::get()?.unix_timestamp;
        vote.bump = ctx.bumps.vote;

        if approve {
            request.approvals = request.approvals.saturating_add(1);
        } else {
            request.rejections = request.rejections.saturating_add(1);
        }

        if request.approvals >= APPROVAL_THRESHOLD {
            request.status = RequestStatus::Accepted as u8;
        } else if request.rejections >= REJECTION_THRESHOLD {
            request.status = RequestStatus::Rejected as u8;
        }

        emit!(FundingRequestVote {
            request: request.key(),
            voter: vote.voter,
            approve,
            escrow_amount,
        });

        Ok(())
    }

    pub fn execute(ctx: Context<ExecuteRequest>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let request = &ctx.accounts.request;

        require!(
            is_accepted(request.status),
            CouncilError::RequestNotAccepted
        );
        require!(
            minimum_voting_period_met(request.created_at, now),
            CouncilError::VotingPeriodNotMet
        );
        require!(request.executed_at == 0, CouncilError::AlreadyExecuted);

        let mission = request.mission;
        let recipient = request.recipient;
        let token_amount = request.token_amount;
        let request_key = request.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"treasury_authority",
            mission.as_ref(),
            &[ctx.bumps.treasury_authority],
        ]];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.treasury_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.treasury_authority.to_account_info(),
                },
                signer_seeds,
            ),
            token_amount,
            ctx.accounts.mint.decimals,
        )?;

        let request = &mut ctx.accounts.request;
        request.status = RequestStatus::Executed as u8;
        request.executed_at = now;

        emit!(FundingRequestExecuted {
            request: request_key,
            mission,
            recipient,
            token_amount,
            treasury_vault: ctx.accounts.treasury_vault.key(),
            recipient_token_account: ctx.accounts.recipient_token_account.key(),
        });

        Ok(())
    }

    pub fn route_collected_fees(ctx: Context<RouteCollectedFees>, amount: u64) -> Result<()> {
        require!(amount > 0, CouncilError::InvalidAmount);
        require_keys_eq!(
            ctx.accounts.platform.key(),
            configured_platform_fee_recipient()?,
            CouncilError::UnauthorizedPlatformRecipient
        );

        let mission = ctx.accounts.mission.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"fee_router",
            mission.as_ref(),
            &[ctx.bumps.fee_router_authority],
        ]];
        let treasury_amount = amount / 2;
        let creator_amount = amount / 4;
        let platform_amount = amount
            .saturating_sub(treasury_amount)
            .saturating_sub(creator_amount);
        let decimals = ctx.accounts.mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.router_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_fee_account.to_account_info(),
                    authority: ctx.accounts.fee_router_authority.to_account_info(),
                },
                signer_seeds,
            ),
            treasury_amount,
            decimals,
        )?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.router_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.creator_fee_account.to_account_info(),
                    authority: ctx.accounts.fee_router_authority.to_account_info(),
                },
                signer_seeds,
            ),
            creator_amount,
            decimals,
        )?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.router_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.platform_fee_account.to_account_info(),
                    authority: ctx.accounts.fee_router_authority.to_account_info(),
                },
                signer_seeds,
            ),
            platform_amount,
            decimals,
        )?;

        emit!(CollectedFeesRouted {
            mission,
            mint: ctx.accounts.mint.key(),
            treasury_amount,
            creator_amount,
            platform_amount,
        });

        Ok(())
    }

    pub fn claim_dbc_fees_and_route(
        ctx: Context<ClaimDbcFeesAndRoute>,
        claim_instruction_data: Vec<u8>,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.platform.key(),
            configured_platform_fee_recipient()?,
            CouncilError::UnauthorizedPlatformRecipient
        );

        let mission = ctx.accounts.mission.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"fee_router",
            mission.as_ref(),
            &[ctx.bumps.fee_router_authority],
        ]];
        let router_key = ctx.accounts.fee_router_authority.key();
        let account_metas = ctx
            .remaining_accounts
            .iter()
            .map(|account| {
                let is_signer = account.is_signer || account.key() == router_key;
                if account.is_writable {
                    AccountMeta::new(account.key(), is_signer)
                } else {
                    AccountMeta::new_readonly(account.key(), is_signer)
                }
            })
            .collect::<Vec<_>>();
        let before_amount = ctx.accounts.router_vault.amount;
        let claim_instruction = Instruction {
            program_id: ctx.accounts.dbc_program.key(),
            accounts: account_metas,
            data: claim_instruction_data,
        };

        invoke_signed(
            &claim_instruction,
            ctx.remaining_accounts,
            signer_seeds,
        )?;

        ctx.accounts.router_vault.reload()?;
        let claimed_amount = ctx
            .accounts
            .router_vault
            .amount
            .checked_sub(before_amount)
            .ok_or(error!(CouncilError::NoFeesClaimed))?;
        require!(claimed_amount > 0, CouncilError::NoFeesClaimed);

        let treasury_amount = claimed_amount / 2;
        let creator_amount = claimed_amount / 4;
        let platform_amount = claimed_amount
            .saturating_sub(treasury_amount)
            .saturating_sub(creator_amount);
        let decimals = ctx.accounts.mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.router_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_fee_account.to_account_info(),
                    authority: ctx.accounts.fee_router_authority.to_account_info(),
                },
                signer_seeds,
            ),
            treasury_amount,
            decimals,
        )?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.router_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.creator_fee_account.to_account_info(),
                    authority: ctx.accounts.fee_router_authority.to_account_info(),
                },
                signer_seeds,
            ),
            creator_amount,
            decimals,
        )?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.router_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.platform_fee_account.to_account_info(),
                    authority: ctx.accounts.fee_router_authority.to_account_info(),
                },
                signer_seeds,
            ),
            platform_amount,
            decimals,
        )?;

        emit!(CollectedFeesRouted {
            mission,
            mint: ctx.accounts.mint.key(),
            treasury_amount,
            creator_amount,
            platform_amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterCandidate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: mission account is owned by registry program and indexed off-chain in MVP tests
    pub mission: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Candidate::INIT_SPACE,
        seeds = [b"candidate", mission.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub candidate: Account<'info, Candidate>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct FinalizeEpochCouncil<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: mission account is owned by registry program and indexed off-chain in MVP tests
    pub mission: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + EpochCouncil::INIT_SPACE,
        seeds = [b"epoch_council", mission.key().as_ref(), epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_council: Account<'info, EpochCouncil>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(metadata_hash: [u8; 32])]
pub struct CreateFundingRequest<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    /// CHECK: mission account is owned by registry program and indexed off-chain in MVP tests
    pub mission: UncheckedAccount<'info>,
    pub epoch_council: Account<'info, EpochCouncil>,
    #[account(
        init,
        payer = requester,
        space = 8 + FundingRequest::INIT_SPACE,
        seeds = [b"request", mission.key().as_ref(), metadata_hash.as_ref()],
        bump
    )]
    pub request: Account<'info, FundingRequest>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    pub epoch_council: Account<'info, EpochCouncil>,
    #[account(mut, has_one = epoch_council)]
    pub request: Account<'info, FundingRequest>,
    #[account(
        init,
        payer = voter,
        space = 8 + RequestVote::INIT_SPACE,
        seeds = [b"vote", request.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, RequestVote>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = voter
    )]
    pub voter_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA authority that owns the request-specific vote escrow vault.
    #[account(
        seeds = [b"vote_escrow_authority", request.key().as_ref()],
        bump
    )]
    pub vote_escrow_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = vote_escrow_authority
    )]
    pub vote_escrow_vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteRequest<'info> {
    pub executor: Signer<'info>,
    #[account(mut)]
    pub request: Account<'info, FundingRequest>,
    /// CHECK: PDA authority that must own the mission treasury token account.
    #[account(
        seeds = [b"treasury_authority", request.mission.as_ref()],
        bump
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = treasury_authority
    )]
    pub treasury_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = request.recipient
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RouteCollectedFees<'info> {
    pub payer: Signer<'info>,
    /// CHECK: mission account is owned by registry program and indexed off-chain in MVP tests
    pub mission: UncheckedAccount<'info>,
    /// CHECK: PDA authority that owns the fee router token account.
    #[account(
        seeds = [b"fee_router", mission.key().as_ref()],
        bump
    )]
    pub fee_router_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = fee_router_authority
    )]
    pub router_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA authority that owns the mission treasury token account.
    #[account(
        seeds = [b"treasury_authority", mission.key().as_ref()],
        bump
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = treasury_authority
    )]
    pub treasury_fee_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: token account authority is checked by constraint below.
    pub creator: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = creator
    )]
    pub creator_fee_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: compared with configured platform recipient.
    pub platform: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = platform
    )]
    pub platform_fee_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimDbcFeesAndRoute<'info> {
    pub payer: Signer<'info>,
    /// CHECK: mission account is owned by registry program and indexed off-chain in MVP tests
    pub mission: UncheckedAccount<'info>,
    /// CHECK: PDA authority that owns the fee router token account and signs the Meteora claim CPI.
    #[account(
        seeds = [b"fee_router", mission.key().as_ref()],
        bump
    )]
    pub fee_router_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = fee_router_authority
    )]
    pub router_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA authority that owns the mission treasury token account.
    #[account(
        seeds = [b"treasury_authority", mission.key().as_ref()],
        bump
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = treasury_authority
    )]
    pub treasury_fee_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: token account authority is checked by constraint below.
    pub creator: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = creator
    )]
    pub creator_fee_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: compared with configured platform recipient.
    pub platform: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = platform
    )]
    pub platform_fee_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: invoked with router PDA signer seeds and SDK-built remaining accounts.
    pub dbc_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Candidate {
    pub mission: Pubkey,
    pub owner: Pubkey,
    pub registered_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EpochCouncil {
    pub mission: Pubkey,
    pub epoch: u64,
    pub members: [Pubkey; COUNCIL_SIZE],
    pub escrow_amounts: [u64; COUNCIL_SIZE],
    pub finalized_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FundingRequest {
    pub mission: Pubkey,
    pub requester: Pubkey,
    pub epoch_council: Pubkey,
    pub metadata_hash: [u8; 32],
    pub recipient: Pubkey,
    pub token_amount: u64,
    pub status: u8,
    pub approvals: u8,
    pub rejections: u8,
    pub created_at: i64,
    pub executed_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RequestVote {
    pub request: Pubkey,
    pub voter: Pubkey,
    pub approve: bool,
    pub escrow_amount: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[repr(u8)]
pub enum RequestStatus {
    Active = 0,
    Accepted = 1,
    Rejected = 2,
    Executed = 3,
}

#[event]
pub struct CandidateRegistered {
    pub mission: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct EpochCouncilFinalized {
    pub mission: Pubkey,
    pub epoch: u64,
    pub members: [Pubkey; COUNCIL_SIZE],
    pub escrow_amounts: [u64; COUNCIL_SIZE],
}

#[event]
pub struct FundingRequestCreated {
    pub request: Pubkey,
    pub mission: Pubkey,
    pub requester: Pubkey,
    pub recipient: Pubkey,
    pub token_amount: u64,
    pub metadata_hash: [u8; 32],
}

#[event]
pub struct FundingRequestVote {
    pub request: Pubkey,
    pub voter: Pubkey,
    pub approve: bool,
    pub escrow_amount: u64,
}

#[event]
pub struct FundingRequestExecuted {
    pub request: Pubkey,
    pub mission: Pubkey,
    pub recipient: Pubkey,
    pub token_amount: u64,
    pub treasury_vault: Pubkey,
    pub recipient_token_account: Pubkey,
}

#[event]
pub struct CollectedFeesRouted {
    pub mission: Pubkey,
    pub mint: Pubkey,
    pub treasury_amount: u64,
    pub creator_amount: u64,
    pub platform_amount: u64,
}

#[error_code]
pub enum CouncilError {
    #[msg("Funding request amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Funding request is not active.")]
    RequestNotActive,
    #[msg("Funding request has not been accepted.")]
    RequestNotAccepted,
    #[msg("The minimum voting period has not been met.")]
    VotingPeriodNotMet,
    #[msg("Funding request has already been executed.")]
    AlreadyExecuted,
    #[msg("Only finalized epoch council members can vote.")]
    NotCouncilMember,
    #[msg("Council escrow amount must be greater than zero.")]
    InvalidEscrowAmount,
    #[msg("Only the configured council authority can finalize epoch councils.")]
    UnauthorizedAuthority,
    #[msg("Configured council authority public key is invalid.")]
    InvalidAuthorityConfig,
    #[msg("Platform fee recipient does not match configured recipient.")]
    UnauthorizedPlatformRecipient,
    #[msg("Configured platform fee recipient public key is invalid.")]
    InvalidPlatformRecipientConfig,
    #[msg("No mission token fees were claimed from Meteora.")]
    NoFeesClaimed,
}

fn is_accepted(status: u8) -> bool {
    status == RequestStatus::Accepted as u8
}

fn minimum_voting_period_met(created_at: i64, now: i64) -> bool {
    now.saturating_sub(created_at) >= MIN_VOTING_SECONDS
}

fn escrow_amounts_are_valid(amounts: &[u64; COUNCIL_SIZE]) -> bool {
    amounts.iter().all(|amount| *amount > 0)
}

fn configured_council_authority() -> Result<Pubkey> {
    Pubkey::from_str(
        option_env!("SINGULARITY_COUNCIL_AUTHORITY_PUBKEY")
            .unwrap_or(DEFAULT_COUNCIL_AUTHORITY),
    )
    .map_err(|_| error!(CouncilError::InvalidAuthorityConfig))
}

fn configured_platform_fee_recipient() -> Result<Pubkey> {
    Pubkey::from_str(
        option_env!("SINGULARITY_PLATFORM_FEE_RECIPIENT")
            .unwrap_or(DEFAULT_PLATFORM_FEE_RECIPIENT),
    )
    .map_err(|_| error!(CouncilError::InvalidPlatformRecipientConfig))
}

fn council_member_index(members: &[Pubkey; COUNCIL_SIZE], voter: &Pubkey) -> Result<usize> {
    members
        .iter()
        .position(|member| member == voter)
        .ok_or(error!(CouncilError::NotCouncilMember))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepted_status_can_execute() {
        assert!(is_accepted(RequestStatus::Accepted as u8));
        assert!(!is_accepted(RequestStatus::Active as u8));
        assert!(!is_accepted(RequestStatus::Rejected as u8));
        assert!(!is_accepted(RequestStatus::Executed as u8));
    }

    #[test]
    fn voting_period_must_be_at_least_three_days() {
        let created_at = 1_000;

        assert!(!minimum_voting_period_met(
            created_at,
            created_at + MIN_VOTING_SECONDS - 1
        ));
        assert!(minimum_voting_period_met(
            created_at,
            created_at + MIN_VOTING_SECONDS
        ));
        assert!(minimum_voting_period_met(
            created_at,
            created_at + MIN_VOTING_SECONDS + 1
        ));
    }

    #[test]
    fn voting_thresholds_match_council_size() {
        assert_eq!(COUNCIL_SIZE, 6);
        assert_eq!(APPROVAL_THRESHOLD, 4);
        assert_eq!(REJECTION_THRESHOLD, 3);
    }

    #[test]
    fn escrow_amounts_must_be_positive() {
        assert!(escrow_amounts_are_valid(&[1; COUNCIL_SIZE]));
        assert!(!escrow_amounts_are_valid(&[0; COUNCIL_SIZE]));
    }

    #[test]
    fn council_member_lookup_returns_member_index() {
        let members = [
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
        ];

        assert_eq!(council_member_index(&members, &members[3]).unwrap(), 3);
        assert!(council_member_index(&members, &Pubkey::new_unique()).is_err());
    }
}
