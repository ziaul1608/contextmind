/*
  Warnings:

  - You are about to drop the column `search_vector` on the `messages` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "messages_search_vector_gin_idx";

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "search_vector";

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "source_conversation_id" TEXT,
    "source_message_id" TEXT,
    "original_timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source_type" TEXT NOT NULL DEFAULT 'user_provided',
    "status" TEXT NOT NULL DEFAULT 'active',
    "superseded_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memories_workspace_id_status_idx" ON "memories"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "memories_workspace_id_category_idx" ON "memories"("workspace_id", "category");

-- CreateIndex
CREATE INDEX "memories_source_conversation_id_idx" ON "memories"("source_conversation_id");

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
