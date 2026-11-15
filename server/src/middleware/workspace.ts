import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';

let resolvedWorkspaceId: string | null = null;

export async function getOrInitializeWorkspace(): Promise<string> {
  const targetWsId = process.env.WORKSPACE_ID || env.WORKSPACE_ID;

  // 1. If explicit WORKSPACE_ID is provided in env
  if (targetWsId) {
    const existing = await prisma.workspace.findUnique({
      where: { id: targetWsId },
    });
    if (existing) {
      resolvedWorkspaceId = existing.id;
      return existing.id;
    }
    // Auto-create with this ID if specified
    const created = await prisma.workspace.create({
      data: { id: targetWsId },
    });
    resolvedWorkspaceId = created.id;
    return created.id;
  }

  // 2. Check if our cached workspace ID still actually exists in PostgreSQL
  if (resolvedWorkspaceId) {
    const existing = await prisma.workspace.findUnique({
      where: { id: resolvedWorkspaceId },
    });
    if (existing) {
      return existing.id;
    }
    // Stale cached workspace ID (e.g. wiped during testing or DB reset)
    resolvedWorkspaceId = null;
  }

  // 3. Find first existing workspace or create a primary workspace for MVP
  const workspaces = await prisma.workspace.findMany({
    take: 1,
    orderBy: { createdAt: 'desc' },
  });

  if (workspaces.length > 0) {
    resolvedWorkspaceId = workspaces[0].id;
    return workspaces[0].id;
  } else {
    const created = await prisma.workspace.create({ data: {} });
    resolvedWorkspaceId = created.id;
    console.log(`[ContextMind] Created primary workspace: ${resolvedWorkspaceId}`);
    return created.id;
  }
}

export async function initializeWorkspace(): Promise<string> {
  return getOrInitializeWorkspace();
}

export async function workspaceMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const workspaceId = await getOrInitializeWorkspace();
    req.workspaceId = workspaceId;
    next();
  } catch (err) {
    next(err);
  }
}

// Allow tests to explicitly set or reset the workspace
export function setWorkspaceId(id: string): void {
  resolvedWorkspaceId = id;
}

export function resetWorkspace(): void {
  resolvedWorkspaceId = null;
}
