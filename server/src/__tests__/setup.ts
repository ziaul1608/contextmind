// Set environment variables before any module is loaded
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://contextmind:contextmind@localhost:5432/contextmind';
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.WORKSPACE_ID = '';
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL = 'qwen2.5:3b';
process.env.TAVILY_API_KEY = 'tvly-test-key';
process.env.TAVILY_SEARCH_DEPTH = 'basic';

