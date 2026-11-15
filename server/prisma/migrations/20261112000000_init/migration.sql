-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('PENDING', 'SUCCESS', 'ERROR', 'TIMEOUT');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_sources" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "citation_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "retrieved_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "message_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "ToolStatus" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_workspace_id_updated_at_idx" ON "conversations"("workspace_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "message_sources_message_id_idx" ON "message_sources"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_sources_message_id_citation_index_key" ON "message_sources"("message_id", "citation_index");

-- CreateIndex
CREATE INDEX "tool_executions_conversation_id_created_at_idx" ON "tool_executions"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
