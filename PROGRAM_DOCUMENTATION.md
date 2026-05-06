# Program Documentation

This document gives a simple overview of the two Anchor programs in `programs`.

## `singularity_registry`

The registry program is for creating and tracking missions. A mission starts in the bonding stage, stores its token and treasury information, and can later be marked as graduated.

### Main Functions

| Function | What it does | Who it is for |
| --- | --- | --- |
| `initialize_mission` | Creates a new mission account from a slug hash, metadata hash, token mint, treasury vault, total supply, and treasury allocation. It requires the treasury allocation to be exactly 20% for the MVP, sets the mission lifecycle to `Bonding`, and emits a `MissionInitialized` event. | Mission creators and the backend flow that launches a new mission. |
| `mark_graduated` | Moves a mission from bonding to graduated and stores the DAMM pool address. Only the mission creator can do this. It emits a `MissionGraduated` event. | Mission creators or the backend authority that finalizes a mission's graduation after liquidity is ready. |

### Data Structures

| Name | What it stores | Who uses it |
| --- | --- | --- |
| `Mission` | The mission creator, slug hash, metadata hash, token mint, treasury vault, DAMM pool, total supply, treasury allocation, lifecycle, and PDA bump. | The app, backend, indexers, and other programs that need mission state. |
| `MissionLifecycle` | The mission status: `Bonding` or `Graduated`. | The app and backend when deciding what actions are available for a mission. |
| `MissionInitialized` | Event emitted when a mission is created. | Indexers and backend services that track new missions. |
| `MissionGraduated` | Event emitted when a mission graduates. | Indexers and backend services that track lifecycle changes. |
| `RegistryError` | Registry-specific errors for unauthorized lifecycle updates and invalid treasury allocation. | Developers, tests, and clients handling failed transactions. |

## `singularity_council`

The council program is for registering council candidates, finalizing epoch councils, creating funding requests, voting on them, and paying accepted requests from a mission treasury.

### Main Functions

| Function | What it does | Who it is for |
| --- | --- | --- |
| `register_candidate` | Creates a candidate account for a mission and records the candidate owner and registration time. It emits a `CandidateRegistered` event. | People or agents who want to be considered for a mission council. |
| `finalize_epoch_council` | Creates the council for a specific mission epoch with exactly six member public keys and six matching token escrow amounts. It only accepts the compile-time configured council authority, records when the council was finalized, and emits an `EpochCouncilFinalized` event. | The configured council authority responsible for publishing each epoch's council and required voting escrow amounts. |
| `create_request` | Creates a funding request tied to a mission and epoch council. It stores the request metadata hash, recipient, token amount, requester, and starts the request as `Active`. The token amount must be greater than zero. | Builders, contributors, or mission participants requesting treasury funding. |
| `vote` | Records one council member's vote on an active funding request and transfers that member's required mission-token escrow amount into the request escrow vault. It counts approvals and rejections, accepts the request at four approvals, and rejects it at three rejections. It emits a `FundingRequestVote` event. | Finalized council members voting on funding requests. |
| `execute` | Transfers tokens from the mission treasury vault to the approved recipient after the request is accepted, the three-day voting period has passed, and the request has not already been executed. It marks the request as `Executed` and emits a `FundingRequestExecuted` event. | Anyone submitting the final transaction after council approval and the required waiting period. |

### Helper Functions

| Function | What it does | Who it is for |
| --- | --- | --- |
| `is_accepted` | Checks whether a funding request status equals `Accepted`. | Internal program logic and tests. |
| `minimum_voting_period_met` | Checks whether at least three days have passed since a funding request was created. | Internal program logic and tests. |

### Test Functions

| Function | What it checks | Who it is for |
| --- | --- | --- |
| `accepted_status_can_execute` | Confirms that only the `Accepted` status passes the execution status check. | Developers maintaining the council execution logic. |
| `voting_period_must_be_at_least_three_days` | Confirms that execution is blocked before three days and allowed once the period is met. | Developers maintaining the voting delay rule. |
| `voting_thresholds_match_council_size` | Confirms the MVP council settings: six members, four approvals, and three rejections. | Developers maintaining council rules and tests. |

### Data Structures

| Name | What it stores | Who uses it |
| --- | --- | --- |
| `Candidate` | A mission, candidate owner, registration time, and PDA bump. | Council selection flows, backend services, and indexers. |
| `EpochCouncil` | A mission, epoch number, six council members, six voting escrow amounts, finalization time, and PDA bump. | Funding requests, voting, backend services, and indexers. |
| `FundingRequest` | A mission, requester, epoch council, metadata hash, recipient, token amount, status, vote counts, timestamps, and PDA bump. | Requesters, council members, executors, backend services, and the app UI. |
| `RequestVote` | A funding request, voter, approval choice, escrowed token amount, vote time, and PDA bump. | Council vote tracking, indexers, and audit views. |
| `RequestStatus` | The funding request status: `Active`, `Accepted`, `Rejected`, or `Executed`. | The council program, backend, app UI, and tests. |
| `CandidateRegistered` | Event emitted when someone registers as a candidate. | Indexers and backend services tracking council candidates. |
| `EpochCouncilFinalized` | Event emitted when an epoch council is finalized. | Indexers and backend services tracking council membership. |
| `FundingRequestCreated` | Event emitted when a funding request is created. | Indexers, backend services, and app notifications. |
| `FundingRequestVote` | Event emitted when a council member votes, including the escrowed token amount. | Indexers, backend services, and vote-history views. |
| `FundingRequestExecuted` | Event emitted when treasury tokens are paid to the recipient. | Indexers, backend services, accounting, and app notifications. |
| `CouncilError` | Council-specific errors for invalid amounts, inactive requests, unaccepted requests, early execution, double execution, and non-council voters. | Developers, tests, and clients handling failed transactions. |

## High-Level Flow

1. A mission creator calls `initialize_mission` in `singularity_registry`.
2. Candidates call `register_candidate` in `singularity_council`.
3. The backend or authority calls `finalize_epoch_council` to publish the six council members and their required voting escrow amounts for an epoch.
4. A requester calls `create_request` to ask for treasury funding.
5. Council members call `vote`, which escrows their required voting tokens for that request.
6. After four approvals and at least three days, anyone can call `execute` to pay the recipient from the treasury vault.
7. When the mission is ready, the creator calls `mark_graduated` to store the DAMM pool and mark the mission as graduated.
