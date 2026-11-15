import { useState } from 'react';
import type { MessageSource } from '@contextmind/shared';
import { Globe, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';


interface SourceCardsProps {
  sources: MessageSource[];
}

export function isSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getDomain(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

export function SourceCards({ sources }: SourceCardsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!sources || sources.length === 0) {
    return null;
  }

  const toggleExpand = (idx: number) => {
    setExpandedIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="mt-4 pt-3 border-t border-gray-800/60 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
        <Globe className="w-3.5 h-3.5 text-indigo-400" />
        <span>Sources & Citations</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 font-mono">
          {sources.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
        {sources.map((source) => {
          const safe = isSafeUrl(source.url);
          const domain = getDomain(source.url);
          const isExpanded = expandedIndex === source.citationIndex;
          const scorePercent = Math.round(source.score * 100);

          return (
            <div
              key={`${source.citationIndex}-${source.url}`}
              id={`source-${source.citationIndex}`}
              className="group relative flex flex-col justify-between bg-gray-900/70 hover:bg-gray-900 border border-gray-800/80 hover:border-indigo-500/40 rounded-xl p-2.5 transition-all text-xs shadow-sm hover:shadow-indigo-500/5"
            >
              <div>
                {/* Header: Citation index badge + domain + relevance */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[10px] font-bold font-mono flex items-center justify-center">
                      {source.citationIndex}
                    </span>
                    <span className="truncate text-[11px] text-gray-400 font-medium">
                      {domain}
                    </span>
                  </div>

                  <span
                    className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-800/80 text-gray-400 group-hover:text-indigo-300 flex-shrink-0"
                    title={`Relevance score: ${scorePercent}%`}
                  >
                    {scorePercent}% match
                  </span>
                </div>

                {/* Title (Link) */}
                {safe ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-gray-200 hover:text-indigo-300 line-clamp-2 leading-snug transition-colors flex items-start gap-1"
                  >
                    <span className="flex-1">{source.title || domain}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <span className="font-medium text-gray-300 line-clamp-2 leading-snug">
                    {source.title || domain}
                  </span>
                )}

                {/* Snippet preview */}
                <p
                  className={`mt-1.5 text-[11px] text-gray-400 leading-relaxed ${
                    isExpanded ? 'block' : 'line-clamp-2'
                  }`}
                >
                  {source.snippet}
                </p>
              </div>

              {/* Footer: Expand button + Timestamp */}
              <div className="mt-2 pt-1.5 border-t border-gray-800/40 flex items-center justify-between text-[10px] text-gray-500">
                <button
                  type="button"
                  onClick={() => toggleExpand(source.citationIndex)}
                  className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <span>Less</span>
                      <ChevronUp className="w-2.5 h-2.5" />
                    </>
                  ) : (
                    <>
                      <span>More</span>
                      <ChevronDown className="w-2.5 h-2.5" />
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1 text-gray-500">
                  <Globe className="w-2.5 h-2.5" />
                  <span>Web Source</span>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
