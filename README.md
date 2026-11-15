# ContextMind

> **A locally powered AI agent with tool orchestration, persistent long-term memory, historical retrieval, source-backed responses, and real-time streaming.**

ContextMind is a full-stack, local-first conversational AI agent built with **React**, **Node.js**, **Express**, **PostgreSQL**, **Prisma ORM**, and **Ollama**. Unlike traditional chatbots that rely entirely on paid cloud APIs and forget previous conversations as soon as context windows expire, ContextMind runs its core reasoning engine 100% locally using open-source models (such as **Qwen 2.5 3B**), orchestrates tools autonomously, and persists long-term memories across conversations using PostgreSQL full-text search.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Local Installation Guide](#complete-local-installation-guide)
- [Environment Variables Reference](#environment-variables-reference)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Testing & Quality Checks](#testing-and-quality-checks)
- [Troubleshooting](#troubleshooting)
- [Privacy & Security](#privacy-and-security)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Project Overview

### What ContextMind Is

ContextMind is an agentic AI assistant designed to solve three major limitations of standard AI chat applications:

1. **Vendor Lock-in and Cloud Costs**: Standard conversational applications depend on paid cloud API providers (such as OpenAI or Anthropic), incurring recurring subscription fees, token charges, and strict rate limits. ContextMind runs locally via [Ollama](https://ollama.com/), providing free, unlimited local inference.
2. **Context Amnesia Across Conversations**: Standard chat interfaces lose track of your preferences, project details, and past decisions when you start a new conversation. ContextMind maintains a persistent **Memory Vault** and extracts key facts into PostgreSQL, allowing historical cross-conversation retrieval via full-text search.
3. **Outdated Knowledge & Hallucinations**: When questions require real-world, current information, ContextMind's local agent autonomously invokes an integrated `web_search` tool (powered by Tavily), inspects and ranks external sources, and synthesizes answers with inline citations.

### How Local LLM Inference Works

ContextMind communicates with a locally running **Ollama** service (by default on `http://127.0.0.1:11434`). The backend dispatches chat requests using Ollama's native `/api/chat` endpoint with stream processing. On Apple Silicon, Ollama leverages Metal/MLX unified memory for fast generation (~44–48 tokens/second on an M-series Mac) with minimal resource overhead.

### How Agentic Tool Orchestration Works

ContextMind does not blindly search the web on every query. Instead, it equips the local model with a native function tool definition (`web_search`). When you ask a programming, math, or personal question, the model responds directly from its weights or recalled memory. When you ask about recent world events or live documentation, the model decides to emit a structured `tool_call`. The backend executes the search, filters and deduplicates results, injects the results back into the agent context, and streams the final cited answer.

### How Persistent Memory & Historical Retrieval Work

ContextMind employs a **three-tier memory hierarchy**:
- **Tier 1: Active Conversation History**: The chronological message stream within the current conversation session.
- **Tier 2: Rolling Summaries**: Background asynchronous summarization of past conversation turns, compressed to retain context without exhausting the prompt budget.
- **Tier 3: Long-Term Memory Vault**: Standalone extracted facts, preferences, and architectural constraints stored in PostgreSQL with GIN-indexed `tsvector` columns. Prior to model inference, the backend queries the database with `websearch_to_tsquery` to retrieve relevant memories and injects them into structured `<historical_memory_context>` tags with provenance metadata.

---

## Key Features

- **100% Free & Local AI Inference**: Powered by Ollama and Qwen 2.5 3B. No Anthropic API keys, no Claude subscriptions, and zero per-token cloud costs.
- **Real-Time SSE Streaming**: Progressive token-by-token streaming via Server-Sent Events (`text/event-stream`) for immediate visual feedback.
- **Agentic Tool Calling**: Native Ollama function calling schema automatically executes `web_search` when external real-world knowledge is needed.
- **Source-Backed Responses & Inline Citations**: Automatic citation mapping with clickable inline markers (`[1]`, `[2]`) linked to responsive source drawer cards.
- **Cross-Conversation Long-Term Memory**: Automatically recalls user preferences and technical constraints stated in prior conversations.
- **Memory Vault Interface**: Searchable UI modal with category filtering, importance indicators, timestamp provenance, and manual deletion/editing.
- **PostgreSQL Persistence with GIN FTS**: Conversations, messages, sources, tool executions, and memories persisted in PostgreSQL 16 with native full-text search indexing.
- **Strict Workspace Isolation**: Multi-tenant architecture ensuring all queries, memories, and conversations are partitioned by workspace ID.
- **Graceful Cancellation & Abort Propagation**: Premature browser disconnections cleanly abort active Ollama streams and Tavily fetch requests via `AbortController`.
- **Markdown & Code Highlighting**: Syntax-highlighted code blocks with copy-to-clipboard buttons and clean Markdown typography.
- **Automated Secret Redaction**: In-flight regex filters block API keys, tokens, and passwords from entering long-term memory storage.

---

## System Architecture

```mermaid
flowchart TD
    User["User / Web Browser"]
    Client["React 18 Frontend\n(Vite + Tailwind CSS)"]
    Server["Express Backend\n(Node.js + TypeScript)"]
    DB[("PostgreSQL 16\n(Prisma ORM + GIN FTS)")]
    Ollama["Local Ollama Daemon\n(qwen2.5:3b via Metal/MLX)"]
    Tavily["Tavily Web Search API\n(Optional External Tool)"]

    User -->|"1. Types message & sends"| Client
    Client -->|"2. POST /conversations/:id/messages"| Server
    Server -->|"3. Query relevant memories & summaries"| DB
    DB -->|"4. Return tsvector matches"| Server
    Server -->|"5. Stream /api/chat with memory context"| Ollama

    Ollama -.->|"6a. Emits tool_call (web_search)"| Server
    Server -.->|"6b. Execute search query"| Tavily
    Tavily -.->|"6c. Normalized sources"| Server
    Server -.->|"6d. Return tool_result"| Ollama

    Ollama -->|"7. Stream final response tokens"| Server
    Server -->|"8. SSE (text_delta, sources, done)"| Client
    Client -->|"9. Progressive render with citations"| User

    Server -.->|"10. Async background summary & memory extract"| DB
```

### Request Flow Explained

1. **User Request**: The user submits a prompt in the React chat composer.
2. **Memory Retrieval**: The Express backend searches PostgreSQL using full-text search (`tsvector @@ websearch_to_tsquery`) to find relevant memories and past conversation snippets.
3. **Prompt Composition**: The backend injects recalled memories into a system prompt formatted with `<historical_memory_context>` tags.
4. **Local LLM Streaming**: The prompt is dispatched to the local Ollama `/api/chat` streaming endpoint.
5. **Autonomous Tool Routing**:
   - If the model answers directly, tokens are streamed immediately to the client via SSE.
   - If the model yields a `tool_calls` request for `web_search`, the server calls Tavily, records the `ToolExecution`, formats the results, and hands them back to Ollama to synthesize the final cited answer.
6. **Persistence & Asynchronous Processing**: Assistant messages, citations, and tool executions are saved to PostgreSQL. In the background, rolling summaries and new memory entries are extracted asynchronously without delaying the user response.

---

## Technology Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| **Frontend Framework** | React | `^18.3.1` (Vite SPA) |
| **Language** | TypeScript | `^5.4.5` (Strict typing across monorepo) |
| **Styling** | Tailwind CSS | `^3.4.4` (Custom dark theme) |
| **Icons & UI** | Lucide React | `^1.72.0` |
| **Markdown Rendering**| React Markdown & Syntax Highlighter | GitHub-flavored markdown with code highlighting |
| **Backend Runtime** | Node.js | `>=20.x` |
| **Web Framework** | Express | `^4.19.2` |
| **Validation** | Zod | `^3.23.8` (Runtime schema validation for env and DTOs) |
| **Security** | Helmet & CORS | HTTP security headers and origin enforcement |
| **Database** | PostgreSQL | `16-alpine` (Docker container) |
| **ORM** | Prisma | `^5.14.0` (Migrations, schema, typed queries) |
| **Local AI Engine** | Ollama | `^0.4.x` (Metal / MLX unified memory on macOS) |
| **Active Local Model** | Qwen 2.5 3B (`qwen2.5:3b`) | 4-bit quantized, 32k context, native tool calling |
| **Web Search** | Tavily API | Optional search provider for real-world knowledge |
| **Testing** | Vitest & Supertest | 124 automated tests across 11 suites |
| **Process Management**| Docker Compose & concurrently | Containerized database and monorepo dev orchestrator |

---

## Prerequisites

Before setting up ContextMind, verify that your machine meets the following requirements:

1. **Operating System**: macOS (Apple Silicon recommended for hardware acceleration), Linux, or Windows (WSL2).
2. **Git**: Installed and configured.
3. **Node.js**: `v20.x` or higher ([Download Node.js](https://nodejs.org/)).
4. **npm**: `v10.x` or higher (bundled with Node.js).
5. **Docker Desktop**: Running Docker daemon for PostgreSQL ([Download Docker Desktop](https://www.docker.com/products/docker-desktop/)).
6. **Ollama**: Local LLM runner installed ([Download Ollama for Mac](https://ollama.com/download/mac)).
7. **Hardware Resources**:
   - **RAM**: Minimum 8 GB RAM (16 GB Unified Memory strongly recommended).
   - **Disk Space**: At least 3 GB free disk space for the `qwen2.5:3b` model weights.

> **Note**: An Anthropic API key is **NOT** required. Core AI inference runs 100% locally.

---

## Complete Local Installation Guide

Follow these step-by-step instructions to clone, configure, and run ContextMind locally.

### Step 1 — Clone the Repository

```bash
git clone <repository-url>
```

### Step 2 — Enter the Project Directory

```bash
cd contextmind
```

### Step 3 — Install Dependencies

Install all dependencies across the monorepo root, `shared`, `server`, and `client`:

```bash
npm install
```

### Step 4 — Configure Environment Variables

Create the server environment file from the provided example template:

```bash
cp .env.example server/.env
```

*(Optional)* You can also keep a copy at the project root:

```bash
cp .env.example .env
```

The default values in `.env.example` are preconfigured for local Docker and Ollama. If you have an optional Tavily API key for web search, open `server/.env` and supply it:

```env
# Database
DATABASE_URL=postgresql://contextmind:contextmind@localhost:5432/contextmind

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Local AI Configuration (Ollama - Free & Local)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b

# Optional Web Search (Tavily)
TAVILY_API_KEY=
TAVILY_SEARCH_DEPTH=basic
```

### Step 5 — Start PostgreSQL via Docker Compose

Launch the containerized PostgreSQL 16 instance:

```bash
docker compose up -d
```

Verify that the container is healthy and running:

```bash
docker compose ps
```

*Expected output*: `contextmind-postgres` showing status `Up (healthy)`.

### Step 6 — Install and Start Ollama

Verify that Ollama is installed:

```bash
ollama --version
```

Start the Ollama daemon (if not already running as a background service):

```bash
ollama serve
```

In a new terminal window, pull the verified local model:

```bash
ollama pull qwen2.5:3b
```

Verify that the model is ready and installed:

```bash
ollama list
```

Verify the local Ollama API connectivity:

```bash
curl http://127.0.0.1:11434/api/tags
```

### Step 7 — Run Database Migrations

Apply the Prisma migrations to set up the database schema and full-text search indexes:

```bash
npm run db:migrate --workspace=server
```

*(Alternatively, run `npx prisma migrate deploy` from inside the `server/` directory).*

### Step 8 — Start the Backend Server

Start the backend API in development mode (runs on port `5000` with hot-reloading):

```bash
npm run dev --workspace=server
```

Verify backend health in your browser or via curl:

```bash
curl http://127.0.0.1:5000/api/v1/health
```

### Step 9 — Start the Frontend Client

In a separate terminal window, start the React Vite frontend (runs on port `5173`):

```bash
npm run dev --workspace=client
```

*(Tip: You can also start both server and client concurrently from the project root with `npm run dev`).*

### Step 10 — Open ContextMind

Open your web browser and navigate to:

```
http://localhost:5173
```

Check the top header:
- **Local AI Status**: Should display `Local AI (Ollama · qwen2.5:3b): Connected` with a green indicator.
- **Web Search**: Shows `Active (Tavily)` if an API key is configured, or `Disabled (Offline Mode)` if omitted.

### Step 11 — Test the Application

Try testing the core workflows:

1. **Direct AI Conversation (No Search Needed)**:
   - Ask: *"Write a TypeScript function to check if a binary tree is balanced."*
   - Notice immediate token-by-token streaming without invoking web search.
2. **Cross-Conversation Long-Term Memory**:
   - In Conversation 1, tell the agent: *"My favorite backend language is Go and I prefer PostgreSQL."*
   - Click **+ New Chat** in the sidebar to start Conversation 2.
   - Ask: *"What language and database do I prefer for backend work?"*
   - Notice the purple `Memory Retrieved` badge in the header, and observe the agent accurately recalling your preferences.
3. **Autonomous Web Search & Citations (requires Tavily API key)**:
   - Ask: *"What are the most recent developments in humanoid robotics in 2026?"*
   - Observe the agent transition to `Searching web...`, fetch external sources, and stream a cited answer with numbered references (`[1]`, `[2]`).
4. **Memory Vault Inspection**:
   - Click the **Brain** icon in the header to open the **Memory Vault**.
   - Review the extracted memories, filter by category, or delete entries.

---

## Environment Variables Reference

| Variable | Purpose | Required | Default Value | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **Yes** | `postgresql://contextmind:contextmind@localhost:5432/contextmind` | Used by Prisma ORM |
| `PORT` | Backend HTTP server port | No | `5000` | Port for Express API |
| `NODE_ENV` | Application environment | No | `development` | `development`, `production`, or `test` |
| `CLIENT_URL` | Frontend origin for CORS | No | `http://localhost:5173` | Enforced by CORS middleware |
| `WORKSPACE_ID` | Multi-tenant workspace ID | No | Auto-generated | If omitted, auto-creates default workspace |
| `OLLAMA_BASE_URL` | Local Ollama API address | **Yes** | `http://127.0.0.1:11434` | Endpoint for Ollama daemon |
| `OLLAMA_MODEL` | Local LLM model identifier | **Yes** | `qwen2.5:3b` | Must match model pulled in Ollama |
| `TAVILY_API_KEY` | Tavily Web Search API key | No | `""` (Empty) | If empty, agent operates 100% offline |
| `TAVILY_SEARCH_DEPTH` | Tavily search depth parameter | No | `basic` | `basic` or `advanced` |
| `VITE_API_BASE_URL` | Frontend API base URL | No | `/api/v1` (Proxied) | Configured in `client/` if hosted separately |

---

## API Overview

Base URL: `http://localhost:5000/api/v1`

### Health & Telemetry

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Returns server health, database connectivity, and provider status (`ollama`, `ollamaModel`, `modelInstalled`, `tavily`). |

### Conversations

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/conversations` | List conversations in workspace (supports `?q=`, `?limit=`, `?cursor=`). |
| `POST` | `/conversations` | Create a new conversation (`{ "title": "Optional Title" }`). |
| `GET` | `/conversations/:id` | Get conversation details along with full message history and citations. |
| `PATCH` | `/conversations/:id` | Rename conversation (`{ "title": "New Title" }`). |
| `DELETE` | `/conversations/:id` | Delete conversation and cascade messages/sources. |
| `GET` | `/conversations/:id/summary` | Fetch the rolling summary for the conversation. |

### Messages & Streaming

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/conversations/:id/messages` | Submit a user message (`{ "content": "..." }`) and receive a progressive Server-Sent Events (`text/event-stream`) response. |

#### Server-Sent Events (SSE) Event Stream Protocol:
- `event: meta` — User message persisted: `{ "userMessageId": "...", "createdAt": "..." }`
- `event: memory_retrieved` — Recalled cross-conversation memories injected into context.
- `event: status` — Agent phase updates: `{ "phase": "thinking" | "searching" | "synthesizing" }`
- `event: sources` — Web search results retrieved: `[{ "citationIndex": 1, "title": "...", "url": "..." }]`
- `event: text_delta` — Incremental response tokens: `{ "delta": "..." }`
- `event: done` — Turn complete: `{ "assistantMessageId": "...", "model": "qwen2.5:3b", "latencyMs": 1420 }`
- `event: error` — Error reporting: `{ "code": "...", "message": "...", "retryable": boolean }`

### Memory Vault

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/memories` | List persistent memories with optional pagination and category/status filters. |
| `GET` | `/memories/search` | Search memories using PostgreSQL full-text search (`?q=query`). |
| `GET` | `/memories/:id` | Get specific memory details. |
| `POST` | `/memories` | Manually record a memory fact (`{ "content": "...", "category": "...", "importance": 0.8 }`). |
| `PATCH` | `/memories/:id` | Update memory content, importance, or lifecycle status (`active`, `superseded`, `archived`). |
| `DELETE` | `/memories/:id` | Permanently remove a memory. |

---

## Project Structure

ContextMind is organized as an npm workspaces monorepo:

```
contextmind/
├── package.json               # Root monorepo workspace configuration
├── docker-compose.yml         # Container configuration for PostgreSQL 16
├── .gitignore                 # Comprehensive ignore rules (secrets, dist, node_modules)
├── .env.example               # Clean environment template with placeholders
├── README.md                  # Complete project documentation
├── docs/                      # Architectural reports & phase verification logs
│   ├── phase-6a-local-verification-report.md
│   ├── phase-6a-message-submission-bug-report.md
│   ├── phase-6a-frontend-interaction-bug-report.md
│   └── phase-6b-local-ollama-migration-report.md
├── shared/                    # Shared TypeScript package
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           # Re-exports shared modules
│       └── types.ts           # Shared domain types, DTOs, and SSE protocol definitions
├── server/                    # Express backend & Prisma data layer
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts       # Vitest test runner configuration
│   ├── prisma/
│   │   ├── schema.prisma      # Prisma schema (Workspaces, Conversations, Messages, Memories)
│   │   └── migrations/        # SQL migration history (including tsvector GIN indexes)
│   └── src/
│       ├── app.ts             # Express application factory & middleware setup
│       ├── index.ts           # Server entrypoint and graceful shutdown handling
│       ├── config/            # Environment validation (env.ts) and Prisma singleton (prisma.ts)
│       ├── controllers/       # HTTP controllers (conversation, message, memory)
│       ├── middleware/        # Error handler, rate limiting, workspace resolver, validator
│       ├── repositories/      # Prisma repositories with raw FTS queries
│       ├── routes/            # Express routers (/health, /conversations, /memories)
│       ├── schemas/           # Zod validation schemas
│       ├── services/          # Core business logic:
│       │   ├── agent.service.ts       # Multi-turn tool orchestration loop
│       │   ├── ollama.service.ts      # Native Ollama API streaming & tool schema
│       │   ├── memory.service.ts      # Memory extraction, redaction & ranking
│       │   └── webSearch.service.ts   # Tavily integration, caching & deduplication
│       └── __tests__/         # 11 comprehensive Vitest test suites
└── client/                    # React 18 single-page application (Vite)
    ├── package.json
    ├── vite.config.ts         # Vite bundler configuration & backend proxy
    ├── tailwind.config.js     # Tailwind CSS styles and theme extensions
    └── src/
        ├── App.tsx            # Main application layout & global error boundary
        ├── api/               # Axios client configuration
        ├── hooks/             # Custom React hooks (useChatStream, useConversations)
        └── components/
            ├── chat/          # ChatWorkspace, MessageBubble, SourceCards, Composer
            ├── memory/        # MemoryVaultModal, MemoryBadge
            └── sidebar/       # ConversationList, SearchBar
```

---

## Testing and Quality Checks

ContextMind contains a comprehensive automated test suite verifying everything from database constraints to multi-turn tool loops:

```bash
# Run all automated tests (124 tests across 11 suites)
npm test

# Run tests in watch mode during development
npm run test:watch --workspace=server

# Run code coverage report
npm run test:coverage --workspace=server

# Run TypeScript type-checking across all packages
npm run lint

# Build all monorepo packages for production
npm run build
```

### Verified Test Suites

| Test Suite | Purpose | Tests |
|---|---|---|
| `conversation.test.ts` | Conversation CRUD, pagination, and workspace isolation | 13 |
| `health.test.ts` | Backend health probe, DB status, and Ollama provider checks | 2 |
| `message.test.ts` | Message submission, SSE streaming format, and cancellation | 9 |
| `ollama.test.ts` | Ollama connection, streaming parser, prompt generation, tool contracts | 7 |
| `webSearch.test.ts` | Tavily client, caching, deduplication, retry logic, error handling | 12 |
| `toolCalling.test.ts` | Agentic loop, tool invocation, iteration limit, anti-injection guards | 9 |
| `memory.test.ts` | Long-term memory extraction, ranking, secret redaction, superseding | 16 |
| `memoryAudit.test.ts` | Strict workspace isolation and SQL injection safety in FTS | 7 |
| `securityAndReliability.test.ts` | Rate limiting, CORS, input validation, secret leakage defense | 22 |
| `frontendInteractions.test.ts` | New Chat creation, workspace self-healing, UI error surfacing | 18 |
| `processRestart.test.ts` | Backend startup, DB reconnection, and workspace persistence | 9 |
| **Total** | **All 11 suites passing** | **124** |

---

## Troubleshooting

### 1. Ollama Connection Error (`LOCAL_AI_UNAVAILABLE` / HTTP 503)
- **Symptom**: Chat requests return `LOCAL_AI_UNAVAILABLE` or header shows `Local AI: Offline`.
- **Cause**: The Ollama daemon is not running on `http://127.0.0.1:11434`.
- **Solution**: Run `ollama serve` in a terminal window, or check if Ollama is running in your menu bar. Confirm with `curl http://127.0.0.1:11434/`.

### 2. Model Not Found (`MODEL_NOT_INSTALLED` / HTTP 503)
- **Symptom**: Error stating `Configured model 'qwen2.5:3b' is not installed`.
- **Cause**: The model has not been downloaded to the local Ollama repository.
- **Solution**: Run `ollama pull qwen2.5:3b`. Verify with `ollama list`.

### 3. PostgreSQL Connection Failure
- **Symptom**: Backend fails at startup with `Can't reach database server at localhost:5432`.
- **Cause**: Docker container is stopped or port 5432 is occupied.
- **Solution**: Run `docker compose ps` to check container status. If stopped, run `docker compose up -d`. If port 5432 conflicts with another local PostgreSQL installation, adjust the mapped host port in `docker-compose.yml` and `DATABASE_URL` in `server/.env`.

### 4. Port Conflicts (5000 or 5173 Already in Use)
- **Symptom**: `EADDRINUSE: address already in use :::5000`.
- **Solution**: Check which process is occupying the port with `lsof -i :5000` and terminate it, or change `PORT=5001` in `server/.env` and update the proxy port in `client/vite.config.ts`.

### 5. Web Search Returns No Results or Search Fails
- **Symptom**: Header shows `Web Search: Disabled (Offline Mode)` or search queries fail.
- **Cause**: `TAVILY_API_KEY` is missing, invalid, or monthly search quota is exceeded.
- **Behavior**: ContextMind gracefully falls back to answering using local model knowledge. If search is required, supply a valid API key in `server/.env`.

---

## Privacy and Security

- **Local Inference Privacy**: By default, user prompts, assistant responses, and memory facts remain strictly on the host machine. Local model inference does not transmit conversational data to third-party cloud LLM providers.
- **External Web Search Data Disclosure**: When web search is enabled (`TAVILY_API_KEY` set) and the agent determines that external search is required, only the specific search query generated by the agent is sent to Tavily. Conversation histories and personal memories are not sent to Tavily.
- **Secret Redaction**: Real-time regex filters automatically strip API keys (such as `sk-ant-*`, `tvly-*`), authorization bearer tokens, and passwords from entering long-term memory.
- **Tenant Isolation**: Every database record is bounded by `workspaceId`. Queries are strictly parameterized through Prisma and PostgreSQL template literals to eliminate SQL injection risks.
- **Defensive Context Framing**: Web search results injected into model prompts are strictly demarcated as untrusted external informational data to mitigate prompt injection risks.

---

## Future Improvements

- Support for local embeddings (e.g. `nomic-embed-text`) alongside PostgreSQL `pgvector` for hybrid vector + keyword retrieval.
- Additional local tool definitions (e.g., local file reader, calculator, Python code sandbox).
- Multi-workspace switching interface in the frontend UI.
- Support for larger local models (e.g., `qwen2.5:7b`, `llama3.1:8b`) on workstations with 32 GB+ RAM.

---

## License

No license has been specified. All rights reserved by the repository owner.
