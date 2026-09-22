# Kanban Platform — Backend & System Architecture Spec

> Purpose: this document is the build prompt for the backend and system logic of a
> Kanban-based productivity platform with optional GitHub integration and an
> on-chain escrow/bounty system. Hand this file to Cursor as context and build
> module by module, in the order listed under "Build Order" at the end.

---

## 1. Product Summary

A collaborative project-management platform, Kanban at its core, that works
**standalone** for any kind of project (design, game dev, marketing, software)
and can **optionally** connect a project to GitHub (Issues, and optionally
Projects v2) when the project is code-based. On top of this, any card can carry
a **funded bounty/escrow**, allowing a maintainer to pay a contributor in
crypto the moment their submitted work is approved.

Core design principle: **the platform's own database is always the source of
truth.** GitHub (or any future integration — Figma, Linear, etc.) is a
strictly optional connector attached to a project, never a dependency of the
core data model.

---

## 2. Core Domain Model

```
User
  id, email, display_name, avatar_url, wallet_address (nullable),
  created_at

Organization / Workspace
  id, name, owner_id, plan_tier

Project
  id, workspace_id, name, type (generic | github-linked),
  created_by, created_at

Board
  id, project_id, name, columns: [ { id, name, order, is_locked_column: bool } ]

Card
  id, board_id, column_id, title, description, order,
  assignees: [user_id],
  labels: [string],
  attachments: [ { url, type, uploaded_by } ],
  comments: [ { id, author_id, body, created_at } ],
  external_link: nullable {
     provider: "github",
     type: "issue" | "pr",
     external_id, external_number, url,
     last_synced_at
  },
  bounty_id: nullable -> Bounty,
  created_at, updated_at

ProjectMember
  project_id, user_id, role: owner | maintainer | contributor | viewer

GithubConnection
  id, project_id, installation_id, repo_owner, repo_name,
  sync_issues: bool, sync_projects_v2: bool,
  last_synced_at

GithubIdentity
  app_user_id, github_user_id, github_login,
  access_token (encrypted), refresh_token (encrypted), token_expires_at

Bounty
  id, card_id, funder_id, claimant_id (nullable),
  amount, token_symbol, chain,
  status: DRAFT | FUNDED | CLAIMED | IN_REVIEW | APPROVED | DISPUTED | RELEASED | REFUNDED,
  escrow_contract_address, fund_tx_hash, release_tx_hash,
  submission: nullable { url, note, submitted_at },
  created_at, updated_at

BountyEvent   -- immutable audit log, append-only
  id, bounty_id, type, actor_id, tx_hash (nullable), metadata (json), created_at
```

**Rule:** nothing in `Board`/`Card` may hard-depend on GitHub-specific fields.
All third-party integration data lives inside `external_link` (generic shape)
or in dedicated connector tables (`GithubConnection`, `GithubIdentity`), never
inlined into the core card schema. This keeps the door open for future
connectors (Figma, Linear) without touching core models.

---

## 3. Roles & Permissions

- **Owner** — full control of workspace/project, billing.
- **Maintainer** — can create/fund bounties, approve/reject submissions,
  manage GitHub connection, manage members.
- **Contributor** — can claim bounties, move cards, comment, submit work.
- **Viewer** — read-only (used for client-portal-style access, see future
  work).

Enforce all of the above **server-side** on every mutating endpoint — never
rely on UI hiding buttons as the permission boundary.

---

## 4. GitHub Integration

### 4.1 Auth: GitHub App (not OAuth App)

- Register a **GitHub App**, not a plain OAuth App. Permissions needed:
  `Issues: read/write`, `Pull requests: read/write`, `Contents: read`,
  `Metadata: read`, `Members: read` (org-level, optional).
- Two token types to support:
  - **Installation access token** — server-to-server, used for automated
    platform actions (bot comments, background sync).
  - **User-to-server token** (OAuth flow layered on the App) — used when an
    action should appear as coming from the actual human (e.g. posting a PR
    review as themselves).
- Store both per `GithubIdentity` record, encrypted at rest.

### 4.2 Connecting a project

1. User clicks "Connect GitHub" on a project.
2. Install the GitHub App on the target org/repo (GitHub's install flow).
3. Complete OAuth to link the installing user's `GithubIdentity`.
4. Create a `GithubConnection` row: `installation_id`, `repo_owner`,
   `repo_name`, default `sync_issues = true`, `sync_projects_v2 = false`.
5. Initial backfill: pull existing issues via
   `GET /repos/{owner}/{repo}/issues` and offer the user a mapping step
   (create matching cards, or skip).

### 4.3 Sync direction — push-on-write, pull-on-demand (NO webhooks in v1)

This platform does **not** run a webhook listener for GitHub in v1. Sync is
intentionally one-directional-by-default and simple:

- **App → GitHub (push, real-time):** whenever a linked card is created or
  edited in-app, immediately fire the corresponding GitHub API call
  synchronously (create issue / edit issue / add comment / update
  assignees / close issue).
- **GitHub → App (pull, on-demand):** two triggers only:
  - Manual "Sync now" button per project.
  - Background cron job every 5–15 minutes per active `GithubConnection`,
    calling `GET /repos/{owner}/{repo}/issues?since={last_synced_at}` and
    updating mirrored fields only (status, latest comment count, title/body
    if changed). **Never** overwrite app-only fields (board column/position,
    bounty state, internal notes) from a pull.
- Update `GithubConnection.last_synced_at` after every successful pull.

### 4.4 Creating an issue from a card

```
POST /repos/{owner}/{repo}/issues
{
  "title": card.title,
  "body": card.description,
  "labels": [ mapped from card.labels / column ],
  "assignees": [ github_login for each assignee with a linked GithubIdentity ]
}
```
Store `external_link = { provider: "github", type: "issue", external_id, external_number, url }` on the card.

### 4.5 Comments and PR reviews

- General comment (issue or PR, same endpoint since PRs are issues under the hood):
  `POST /repos/{owner}/{repo}/issues/{number}/comments`
- Line-specific review comment:
  `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments`
  with `commit_id`, `path`, `line`.
- Full review (approve / request changes):
  `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
  with `event: APPROVE | REQUEST_CHANGES | COMMENT`.
- Use the **user-to-server token** for any of the above where attribution to
  a specific human matters; fall back to the installation token (bot
  identity) for system-generated comments (e.g. bounty status updates).

### 4.6 GitHub Projects v2 (optional, GraphQL only)

Only relevant if `GithubConnection.sync_projects_v2 = true`. Separate code
path from Issues sync, built after Issues sync is stable.

- Create: `mutation { createProjectV2(input: { ownerId, title }) }`
- Add existing issue as item: `mutation { addProjectV2ItemById(input: { projectId, contentId }) }`
- Set status/column field: `mutation { updateProjectV2ItemFieldValue(...) }`
- Pull back state: `query { node(id: $projectId) { ... on ProjectV2 { items { ... } } } }`

### 4.7 Plan-in-app → scaffold GitHub repo

Flow for "Setup GitHub Repo" from a fully-planned project with no repo yet:

1. `POST /orgs/{org}/repos` (or generate from template via
   `POST /repos/{template_owner}/{template_repo}/generate`).
2. Create labels matching board columns/tags:
   `POST /repos/{owner}/{repo}/labels`.
3. Optionally create milestones per phase/sprint:
   `POST /repos/{owner}/{repo}/milestones`.
4. Bulk-create one issue per existing planning card (§4.4), storing
   `external_link` back on each card as it's created.

---

## 5. Non-GitHub Projects

Design, Unity, marketing, or any other project type requires **zero**
third-party API calls. Cards just support attachments, comments, and
assignees natively. This is the default path — GitHub is opt-in per project,
never required. Future connectors (e.g. Figma) should follow the exact same
`external_link.provider` pattern established for GitHub — additive, no core
schema changes.

---

## 6. Escrow / Bounty System

### 6.1 Lifecycle

```
DRAFT -> FUNDED -> CLAIMED -> IN_REVIEW -> APPROVED -> RELEASED
                                        \-> DISPUTED -> RELEASED | REFUNDED
FUNDED -> REFUNDED (if abandoned/cancelled before claim)
```

### 6.2 Creating & funding

- Only a **maintainer** may create a bounty on a card. Creating it produces a
  `DRAFT` bounty — **not visible to contributors as claimable** until it is
  actually funded. Never advertise an unfunded bounty.
- Funding paths (support both):
  - **On-chain:** maintainer's wallet calls escrow contract `fund(bountyId, token, amount)`.
    Backend listens for the `Funded` event / polls the tx receipt, then sets
    status `FUNDED` and records `fund_tx_hash`.
  - **Custodial fallback** (for users without a wallet yet): fiat/stablecoin
    on-ramp into a platform-custodied ledger; "escrow" is a DB ledger entry
    rather than an on-chain lock. Same state machine either way.

### 6.3 Claiming

- Once `FUNDED`, eligible contributors see a "Claim" action (open to all
  project members, or restricted — configurable per project).
- On claim: set `claimant_id`, status → `CLAIMED`, auto-assign the card to
  that user. If the card is GitHub-linked, push an assignee update to the
  actual issue (one-way app → GitHub, per §4.3).
- One active claimant at a time by default. Maintainer can force-release a
  stale claim (configurable inactivity threshold, e.g. 7 days).

### 6.4 Submission

- Contributor submits via:
  - Opening a PR referencing the linked issue (`Fixes #123`) — detected on
    the next pull cycle (§4.3) and auto-flags the bounty `IN_REVIEW`.
  - Or, for non-GitHub cards, an in-app "Submit for review" action with a
    link/note: `{ url, note, submitted_at }` stored on the bounty.

### 6.5 Review & release — always in-app, never GitHub-native

- GitHub issue open/close state is **cosmetic only** and never triggers
  release. All release decisions happen through the platform's review UI:
  **Approve / Request changes / Dispute.**
- Optional convenience: treat a merged linked PR (`merged: true`, detected on
  pull) as an *alternate* approve trigger, but the in-app Approve button
  remains the primary path.
- On **Approve**: call escrow contract `release(bountyId)`, set status
  `RELEASED`, record `release_tx_hash`. If GitHub-linked, push a `state:
  closed` update to the issue (app → GitHub, one-way) and post a bot comment
  noting the bounty was released.
- On **Request changes**: bounty returns to `CLAIMED`/`IN_REVIEW` pending
  resubmission; funds remain locked.
- On **Dispute**: status `DISPUTED`, `release`/`refund` locked pending manual
  admin resolution (v1: platform admin or multisig decides; v2: staking or
  community arbitration — out of scope for v1 build).

### 6.6 Consistency rule for GitHub vs. bounty state

If an issue is closed directly on GitHub while its bounty is still
unresolved, the next pull must **not** interpret this as approval. Instead
flag it to the maintainer in-app: *"Issue was closed on GitHub but bounty #X
is still unreleased — resolve?"*

### 6.7 Bot comments on GitHub (optional but recommended)

Post a bot comment on the linked GitHub issue at each bounty state change
(funded / claimed / released) via the installation token, so activity is
visible to people working directly on GitHub without opening the platform.

### 6.8 Smart contract interface (v1, centralized-admin release model)

```solidity
struct Bounty {
    address funder;
    address token;
    uint256 amount;
    address claimant;
    BountyStatus status; // Funded, Claimed, Released, Refunded, Disputed
}

function fund(bytes32 bountyId, address token, uint256 amount) external;
function assignClaimant(bytes32 bountyId, address claimant) external onlyMaintainer;
function release(bytes32 bountyId) external onlyMaintainer;
function refund(bytes32 bountyId) external onlyMaintainer;
function raiseDispute(bytes32 bountyId) external;
```

- `release`/`refund` gated to a maintainer address or platform multisig in
  v1 — do not attempt full decentralized arbitration before there are real
  users and real disputes to learn from.
- Use standard ERC-20 `approve` + `transferFrom` for funding; add
  reentrancy guards on `release`/`refund`.

### 6.9 Audit trail

Every bounty state transition writes a `BountyEvent` row (`type`, `actor_id`,
`tx_hash`, `metadata`, `created_at`). This append-only log is the primary
evidence source for disputes — treat it as critical infrastructure, not a
nice-to-have.

---

## 7. API Surface (indicative, not exhaustive)

```
POST   /projects/:id/github/connect
POST   /projects/:id/github/sync            (manual sync trigger)
POST   /cards                                (create card; auto-pushes to GitHub if linked)
PATCH  /cards/:id
POST   /cards/:id/comments                   (pushes to GitHub if linked)
POST   /cards/:id/bounty                     (maintainer only; creates DRAFT bounty)
POST   /bounties/:id/fund
POST   /bounties/:id/claim
POST   /bounties/:id/submit
POST   /bounties/:id/approve
POST   /bounties/:id/request-changes
POST   /bounties/:id/dispute
```

All mutating endpoints must re-check role permissions server-side (§3)
regardless of what the client UI allows.

---

## 8. Build Order (recommended)

1. Core domain model: Workspace → Project → Board → Card → ProjectMember,
   with no third-party integration at all. Ship this as a fully usable
   standalone Kanban tool first.
2. Role/permission enforcement middleware.
3. GitHub App registration + `GithubConnection` + `GithubIdentity`, OAuth
   flow, push-on-write issue creation/edit/comment.
4. Pull-on-demand sync job (manual button + cron), reconciliation logic per
   §4.3.
5. Bounty state machine + custodial ledger fallback (ship this before the
   smart contract, to validate the review/approve UX with fake money first).
6. Smart contract integration for on-chain funding/release, wired into the
   same state machine.
7. GitHub Projects v2 (GraphQL) as an optional layer, only after 3–4 are
   stable.
8. "Plan in-app → scaffold GitHub repo" flow (§4.7), since it depends on
   both issue creation and label/milestone creation being solid.

Do not build steps 6–8 before 1–5 are working end-to-end with real test
projects.
