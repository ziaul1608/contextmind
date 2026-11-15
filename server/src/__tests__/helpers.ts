import { Application } from 'express';
import { createApp } from '../app';
import { resetWorkspace, setWorkspaceId } from '../middleware/workspace';
import { prisma } from '../config/prisma';

export async function createTestApp(): Promise<{
  app: Application;
  workspaceId: string;
  cleanup: () => Promise<void>;
}> {
  // Always create an isolated, dedicated workspace for the test suite
  const testWorkspace = await prisma.workspace.create({ data: {} });
  const workspaceId = testWorkspace.id;
  setWorkspaceId(workspaceId);
  process.env.WORKSPACE_ID = workspaceId;
  const app = createApp();

  const cleanup = async () => {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    resetWorkspace();
    process.env.WORKSPACE_ID = '';
  };

  return { app, workspaceId, cleanup };
}
