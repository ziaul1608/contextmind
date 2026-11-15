import { useHealthCheck } from '../hooks/useHealthCheck';

const STATUS_CONFIG = {
  loading: { label: 'Checking...', dotColor: 'bg-yellow-400', textColor: 'text-yellow-400' },
  healthy: { label: 'Connected', dotColor: 'bg-green-400', textColor: 'text-green-400' },
  degraded: { label: 'Degraded', dotColor: 'bg-orange-400', textColor: 'text-orange-400' },
  error: { label: 'Unreachable', dotColor: 'bg-red-400', textColor: 'text-red-400' },
} as const;

const STACK = ['React + TypeScript', 'Node.js + Express', 'PostgreSQL + Prisma'] as const;

export function FoundationPage() {
  const health = useHealthCheck();
  const { label, dotColor, textColor } = STATUS_CONFIG[health.status];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">
            Context<span className="text-indigo-400">Mind</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Intelligent conversational AI with persistent memory
          </p>
        </div>

        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          <span className="text-indigo-300 text-sm font-medium">
            Foundation Ready — Phase 1
          </span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-left space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Backend Status
          </h2>
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${dotColor}`} />
            <span className={`font-semibold ${textColor}`}>{label}</span>
            {health.data && (
              <span className="ml-auto text-xs text-gray-500">
                DB: {health.data.db}
              </span>
            )}
          </div>
          {health.data && (
            <p className="text-xs text-gray-600">
              Last checked: {new Date(health.data.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          {STACK.map((tech) => (
            <div
              key={tech}
              className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-gray-400 text-center"
            >
              {tech}
            </div>
          ))}
        </div>

        <p className="text-gray-700 text-xs">
          ContextMind — minimi Software Engineering Internship Challenge
        </p>
      </div>
    </div>
  );
}
