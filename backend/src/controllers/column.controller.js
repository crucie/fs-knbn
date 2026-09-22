import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  createColumnSchema,
  updateColumnSchema,
  reorderColumnsSchema,
} from "../validations/column.validation.js";

// POST /api/projects/:projectId/columns
export const createColumn = asyncHandler(async (req, res) => {
  const parsed = createColumnSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId } = req.params;
  const { name, color } = parsed.data;

  const agg = await prisma.boardColumn.aggregate({
    where: { projectId },
    _max: { position: true },
  });
  const position = (agg._max.position ?? -1) + 1;

  const column = await prisma.boardColumn.create({
    data: {
      projectId,
      name,
      position,
      color: color || "#888888",
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, column, "Column created."));
});

// PATCH /api/projects/:projectId/columns/:columnId
export const updateColumn = asyncHandler(async (req, res) => {
  const parsed = updateColumnSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, columnId } = req.params;
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, projectId },
  });
  if (!column) {
    throw new ApiError(404, "Column not found.");
  }

  const updated = await prisma.boardColumn.update({
    where: { id: columnId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.color !== undefined && { color: parsed.data.color }),
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Column updated."));
});

// DELETE /api/projects/:projectId/columns/:columnId
export const deleteColumn = asyncHandler(async (req, res) => {
  const { projectId, columnId } = req.params;

  const columns = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });

  if (columns.length <= 1) {
    throw new ApiError(400, "A board must keep at least one column.");
  }

  const target = columns.find((c) => c.id === columnId);
  if (!target) {
    throw new ApiError(404, "Column not found.");
  }

  const fallback = columns.find((c) => c.id !== columnId);

  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { columnId, projectId },
      data: { columnId: fallback.id },
    });
    await tx.boardColumn.delete({ where: { id: columnId } });

    const remaining = await tx.boardColumn.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
    });
    await Promise.all(
      remaining.map((c, i) =>
        tx.boardColumn.update({ where: { id: c.id }, data: { position: i } })
      )
    );
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Column deleted. Tasks moved to another column."));
});

// PATCH /api/projects/:projectId/columns/reorder
export const reorderColumns = asyncHandler(async (req, res) => {
  const parsed = reorderColumnsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId } = req.params;
  const { columnIds } = parsed.data;

  const existing = await prisma.boardColumn.findMany({ where: { projectId } });
  if (existing.length !== columnIds.length) {
    throw new ApiError(400, "columnIds must include every column exactly once.");
  }

  const existingIds = new Set(existing.map((c) => c.id));
  if (!columnIds.every((id) => existingIds.has(id))) {
    throw new ApiError(400, "Invalid column id in reorder list.");
  }

  await prisma.$transaction(
    columnIds.map((id, position) =>
      prisma.boardColumn.update({ where: { id }, data: { position } })
    )
  );

  const columns = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, columns, "Columns reordered."));
});
