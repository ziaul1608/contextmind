import { Bot, Sparkles, Terminal, Code2, Globe } from 'lucide-react';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
  {
    icon: Code2,
    title: 'Explain React Server Components',
    prompt: 'Can you explain how React Server Components work and how they differ from Client Components?',
  },
  {
    icon: Terminal,
    title: 'Design a REST API in Express',
    prompt: 'How would you structure a production-quality Express REST API with TypeScript, Prisma, and Zod validation?',
  },
  {
    icon: Globe,
    title: 'Compare PostgreSQL indexing strategies',
    prompt: 'What is the difference between B-tree and GIN indexes in PostgreSQL, and when should I use each?',
  },
  {
    icon: Sparkles,
    title: 'Write a TypeScript debounce utility',
    prompt: 'Write a type-safe debounce function in TypeScript with cancel and flush methods.',
  },
];

export function WelcomeScreen({ onSelectPrompt }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto space-y-8">
      {/* Hero Badge & Title */}
      <div className="space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
          <Bot className="w-7 h-7 text-indigo-400" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
          How can ContextMind help you today?
        </h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
          Intelligent local AI agent powered by Ollama, featuring real-time streaming, tool orchestration, persistent context, and verified references.
        </p>
      </div>

      {/* Suggested Prompt Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
        {EXAMPLE_PROMPTS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              onClick={() => onSelectPrompt(item.prompt)}
              className="group p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-indigo-500/50 hover:bg-gray-900 transition-all text-left shadow-sm hover:shadow-indigo-500/10 flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700/80 flex items-center justify-center text-gray-400 group-hover:text-indigo-400 group-hover:bg-indigo-950/40 transition-colors flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-semibold text-gray-200 group-hover:text-white transition-colors truncate">
                  {item.title}
                </h3>
                <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-snug">
                  {item.prompt}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
