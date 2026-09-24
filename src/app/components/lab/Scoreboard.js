import { VerdictCard } from './VerdictCard';

// The running record of every experiment. Its job is trust: every verdict, its
// numbers, and its date, visible in one place. With no verdicts yet, it says so.
export function Scoreboard({ verdicts = [] }) {
  return (
    <div>
      {verdicts.length === 0 ? (
        <div className="bg-gray-50 rounded-lg sm:rounded-xl p-5 sm:p-8 text-sm sm:text-base text-gray-600">
          No verdicts yet. The first experiment is starting.
        </div>
      ) : (
        <div className="space-y-4">
          {verdicts.map((verdict) => (
            <VerdictCard
              key={verdict.href}
              title={verdict.title}
              line={verdict.line}
              date={verdict.date}
              href={verdict.href}
              isSample={verdict.isSample}
            />
          ))}
        </div>
      )}
    </div>
  );
}
