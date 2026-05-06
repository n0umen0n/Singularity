use anchor_lang::prelude::*;

declare_id!("7CxZRBgnYwi5MtSKebmaSh7XTRVXk3QgzjXRUgLzcXT5");

#[program]
pub mod singularity_registry {
    use super::*;

    pub fn initialize_mission(
        ctx: Context<InitializeMission>,
        slug_hash: [u8; 32],
        metadata_hash: [u8; 32],
        token_mint: Pubkey,
        treasury_vault: Pubkey,
        total_supply: u64,
        treasury_bps: u16,
    ) -> Result<()> {
        require!(
            treasury_bps == 2_000,
            RegistryError::InvalidTreasuryAllocation
        );

        let mission = &mut ctx.accounts.mission;
        mission.creator = ctx.accounts.creator.key();
        mission.slug_hash = slug_hash;
        mission.metadata_hash = metadata_hash;
        mission.token_mint = token_mint;
        mission.treasury_vault = treasury_vault;
        mission.total_supply = total_supply;
        mission.treasury_bps = treasury_bps;
        mission.lifecycle = MissionLifecycle::Bonding as u8;
        mission.bump = ctx.bumps.mission;

        emit!(MissionInitialized {
            mission: mission.key(),
            creator: mission.creator,
            token_mint,
            metadata_hash,
        });

        Ok(())
    }

    pub fn mark_graduated(ctx: Context<UpdateMissionLifecycle>, damm_pool: Pubkey) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require_keys_eq!(
            mission.creator,
            ctx.accounts.authority.key(),
            RegistryError::Unauthorized
        );

        mission.lifecycle = MissionLifecycle::Graduated as u8;
        mission.damm_pool = damm_pool;

        emit!(MissionGraduated {
            mission: mission.key(),
            damm_pool,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(slug_hash: [u8; 32])]
pub struct InitializeMission<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Mission::INIT_SPACE,
        seeds = [b"mission", slug_hash.as_ref()],
        bump
    )]
    pub mission: Account<'info, Mission>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMissionLifecycle<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = creator @ RegistryError::Unauthorized)]
    pub mission: Account<'info, Mission>,
    /// CHECK: compared with mission.creator through has_one
    pub creator: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Mission {
    pub creator: Pubkey,
    pub slug_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub token_mint: Pubkey,
    pub treasury_vault: Pubkey,
    pub damm_pool: Pubkey,
    pub total_supply: u64,
    pub treasury_bps: u16,
    pub lifecycle: u8,
    pub bump: u8,
}

#[repr(u8)]
pub enum MissionLifecycle {
    Bonding = 0,
    Graduated = 1,
}

#[event]
pub struct MissionInitialized {
    pub mission: Pubkey,
    pub creator: Pubkey,
    pub token_mint: Pubkey,
    pub metadata_hash: [u8; 32],
}

#[event]
pub struct MissionGraduated {
    pub mission: Pubkey,
    pub damm_pool: Pubkey,
}

#[error_code]
pub enum RegistryError {
    #[msg("Only the mission creator or configured authority may update mission lifecycle.")]
    Unauthorized,
    #[msg("MVP requires exactly 20% treasury allocation.")]
    InvalidTreasuryAllocation,
}
