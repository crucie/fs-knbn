import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { z } from "zod";
import { setTaskAssignees, isMaintainerRole, canMutateCards } from "../utils/cardHelpers.js";
import { invalidateProject } from "../utils/cache.js";
import { closeGithubIssue, setGithubAssignees } from "../services/githubPush.service.js";

const createSchema = z.object({
  amount: z.union([z.number().positive(), z.string()]),
  tokenSymbol: z.string().max(16).optional(),
});

const submitSchema = z.object({
  url: z.string().url().optional(),
  note: z.string().max(5000).optional(),
});

async function getBountyOrThrow(id) {
  const bounty = await prisma.bounty.findUnique({
    where: { id },
    include: {
      card: { select: { id: true, projectId: true, title: true, externalLink: true } },
      funder: { select: { id: true, username: true } },
      claimant: { select: { id: true, username: true } },
      events: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });
  if (!bounty) throw new ApiError(404, "Bounty not found.");
  return bounty;
}

async function assertMembership(projectId, userId) {
  const m = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!m) throw new ApiError(403, "Forbidden.");
  return m;
}

async function appendEvent(bountyId, type, actorId, metadata = null, tx = prisma) {
  return tx.bountyEvent.create({
    data: { bountyId, type, actorId, metadata },
  });
}

async function ledgerBalance(userId, currency = "USD") {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["currency"],
    where: { userId, currency },
    _sum: { amount: true },
  });
  return Number(rows[0]?._sum?.amount || 0);
}

function shapeBounty(b) {
  if (!b) return b;
  return {
    ...b,
    amount: String(b.amount),
    events: b.events,
  };
}

/** Ensure funder has custodial balance — seed demo funds if empty. */
async function ensureDemoBalance(userId, amount, currency = "USD") {
  const bal = await ledgerBalance(userId, currency);
  if (bal >= amount) return;
  const seed = Math.max(amount * 2, 1000);
  await prisma.ledgerEntry.create({
    data: {
      userId,
      amount: seed,
      currency,
      refType: "SEED",
      note: "Custodial demo credit",
    },
  });
}

// POST /projects/:projectId/tasks/:taskId/bounty
export const createBounty = asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);

  const { projectId, taskId } = req.params;
  const membership = await assertMembership(projectId, req.user.id);
  if (!isMaintainerRole(membership.role)) {
    throw new ApiError(403, "Only maintainers can create bounties.");
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) throw new ApiError(404, "Task not found.");

  const existing = await prisma.bounty.findUnique({ where: { cardId: taskId } });
  if (existing) throw new ApiError(409, "This card already has a bounty.");

  const amount = Number(parsed.data.amount);
  if (!(amount > 0)) throw new ApiError(400, "Amount must be positive.");

  const bounty = await prisma.$transaction(async (tx) => {
    const b = await tx.bounty.create({
      data: {
        cardId: taskId,
        funderId: req.user.id,
        amount,
        tokenSymbol: parsed.data.tokenSymbol || "USD",
        chain: "CUSTODIAL",
        status: "DRAFT",
      },
    });
    await appendEvent(b.id, "CREATED", req.user.id, { amount }, tx);
    return b;
  });

  await invalidateProject(projectId);
  return res.status(201).json(new ApiResponse(201, shapeBounty(bounty), "Bounty drafted."));
});

// POST /bounties/:id/fund
export const fundBounty = asyncHandler(async (req, res) => {
  const bounty = await getBountyOrThrow(req.params.id);
  const membership = await assertMembership(bounty.card.projectId, req.user.id);
  if (!isMaintainerRole(membership.role)) {
    throw new ApiError(403, "Only maintainers can fund bounties.");
  }
  if (bounty.status !== "DRAFT" && bounty.status !== "REFUNDED") {
    throw new ApiError(400, `Cannot fund bounty in status ${bounty.status}.`);
  }

  const amount = Number(bounty.amount);
  await ensureDemoBalance(req.user.id, amount, bounty.tokenSymbol);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        userId: req.user.id,
        amount: -amount,
        currency: bounty.tokenSymbol,
        refType: "BOUNTY_FUND",
        refId: bounty.id,
        note: `Fund bounty on ${bounty.card.title}`,
      },
    });
    const b = await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "FUNDED", funderId: req.user.id, fundTxHash: `custodial:${Date.now()}` },
    });
    await appendEvent(b.id, "FUNDED", req.user.id, { amount }, tx);
    return b;
  });

  await invalidateProject(bounty.card.projectId);
  return res.status(200).json(new ApiResponse(200, shapeBounty(updated), "Bounty funded."));
});

// POST /bounties/:id/claim
export const claimBounty = asyncHandler(async (req, res) => {
  const bounty = await getBountyOrThrow(req.params.id);
  const membership = await assertMembership(bounty.card.projectId, req.user.id);
  if (!canMutateCards(membership.role)) {
    throw new ApiError(403, "Viewers cannot claim bounties.");
  }
  if (bounty.status !== "FUNDED") {
    throw new ApiError(400, "Only FUNDED bounties can be claimed.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "CLAIMED", claimantId: req.user.id },
    });
    await setTaskAssignees(bounty.cardId, [req.user.id], tx);
    await appendEvent(b.id, "CLAIMED", req.user.id, null, tx);
    return b;
  });

  try {
    await setGithubAssignees(bounty.card.projectId, bounty.cardId);
  } catch (err) {
    console.warn("[bounty claim github]", err.message);
  }

  await invalidateProject(bounty.card.projectId);
  return res.status(200).json(new ApiResponse(200, shapeBounty(updated), "Bounty claimed."));
});

// POST /bounties/:id/submit
export const submitBounty = asyncHandler(async (req, res) => {
  const parsed = submitSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);

  const bounty = await getBountyOrThrow(req.params.id);
  await assertMembership(bounty.card.projectId, req.user.id);
  if (bounty.claimantId !== req.user.id && !isMaintainerRole((await assertMembership(bounty.card.projectId, req.user.id)).role)) {
    if (bounty.claimantId !== req.user.id) {
      throw new ApiError(403, "Only the claimant can submit work.");
    }
  }
  if (!["CLAIMED", "IN_REVIEW"].includes(bounty.status)) {
    throw new ApiError(400, "Cannot submit in current status.");
  }

  const submission = {
    url: parsed.data.url || null,
    note: parsed.data.note || null,
    submittedAt: new Date().toISOString(),
  };

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "IN_REVIEW", submission },
    });
    await appendEvent(b.id, "SUBMITTED", req.user.id, submission, tx);
    return b;
  });

  await invalidateProject(bounty.card.projectId);
  return res.status(200).json(new ApiResponse(200, shapeBounty(updated), "Submitted for review."));
});

// POST /bounties/:id/approve
export const approveBounty = asyncHandler(async (req, res) => {
  const bounty = await getBountyOrThrow(req.params.id);
  const membership = await assertMembership(bounty.card.projectId, req.user.id);
  if (!isMaintainerRole(membership.role)) {
    throw new ApiError(403, "Only maintainers can approve.");
  }
  if (!["IN_REVIEW", "CLAIMED", "APPROVED", "DISPUTED"].includes(bounty.status)) {
    throw new ApiError(400, `Cannot approve from ${bounty.status}.`);
  }
  if (!bounty.claimantId) throw new ApiError(400, "No claimant to pay.");

  const amount = Number(bounty.amount);
  const updated = await prisma.$transaction(async (tx) => {
    // Pay claimant from custodial escrow
    await tx.ledgerEntry.create({
      data: {
        userId: bounty.claimantId,
        amount,
        currency: bounty.tokenSymbol,
        refType: "BOUNTY_PAYOUT",
        refId: bounty.id,
      },
    });
    const b = await tx.bounty.update({
      where: { id: bounty.id },
      data: {
        status: "RELEASED",
        releaseTxHash: `custodial:${Date.now()}`,
      },
    });
    await appendEvent(b.id, "APPROVED", req.user.id, null, tx);
    await appendEvent(b.id, "RELEASED", req.user.id, { amount }, tx);
    await tx.task.update({
      where: { id: bounty.cardId },
      data: { githubClosedPending: false },
    });
    return b;
  });

  try {
    await closeGithubIssue(
      bounty.card.projectId,
      bounty.cardId,
      `Bounty released (${amount} ${bounty.tokenSymbol}) via fs-knbn.`
    );
  } catch (err) {
    console.warn("[bounty approve github]", err.message);
  }

  await invalidateProject(bounty.card.projectId);
  return res.status(200).json(new ApiResponse(200, shapeBounty(updated), "Bounty released."));
});

// POST /bounties/:id/request-changes
export const requestChanges = asyncHandler(async (req, res) => {
  const bounty = await getBountyOrThrow(req.params.id);
  const membership = await assertMembership(bounty.card.projectId, req.user.id);
  if (!isMaintainerRole(membership.role)) {
    throw new ApiError(403, "Only maintainers can request changes.");
  }
  if (bounty.status !== "IN_REVIEW") {
    throw new ApiError(400, "Only IN_REVIEW bounties can request changes.");
  }
  const note = req.body?.note || null;
  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "CLAIMED" },
    });
    await appendEvent(b.id, "REQUEST_CHANGES", req.user.id, { note }, tx);
    return b;
  });
  await invalidateProject(bounty.card.projectId);
  return res.status(200).json(new ApiResponse(200, shapeBounty(updated), "Changes requested."));
});

// POST /bounties/:id/dispute
export const disputeBounty = asyncHandler(async (req, res) => {
  const bounty = await getBountyOrThrow(req.params.id);
  const membership = await assertMembership(bounty.card.projectId, req.user.id);
  if (!canMutateCards(membership.role) && !isMaintainerRole(membership.role)) {
    throw new ApiError(403, "Forbidden.");
  }
  if (!["CLAIMED", "IN_REVIEW", "FUNDED"].includes(bounty.status)) {
    throw new ApiError(400, "Cannot dispute in current status.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "DISPUTED" },
    });
    await appendEvent(b.id, "DISPUTED", req.user.id, { note: req.body?.note || null }, tx);
    return b;
  });
  await invalidateProject(bounty.card.projectId);
  return res.status(200).json(new ApiResponse(200, shapeBounty(updated), "Dispute opened."));
});

// GET /bounties/:id
export const getBounty = asyncHandler(async (req, res) => {
  const bounty = await getBountyOrThrow(req.params.id);
  await assertMembership(bounty.card.projectId, req.user.id);
  // Hide DRAFT from non-maintainers
  const membership = await assertMembership(bounty.card.projectId, req.user.id);
  if (bounty.status === "DRAFT" && !isMaintainerRole(membership.role)) {
    throw new ApiError(404, "Bounty not found.");
  }
  return res.status(200).json(new ApiResponse(200, shapeBounty(bounty), "OK"));
});

// GET /ledger/me
export const myLedger = asyncHandler(async (req, res) => {
  const entries = await prisma.ledgerEntry.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const balance = await ledgerBalance(req.user.id, "USD");
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        balance: String(balance),
        entries: entries.map((e) => ({ ...e, amount: String(e.amount) })),
      },
      "Ledger"
    )
  );
});
