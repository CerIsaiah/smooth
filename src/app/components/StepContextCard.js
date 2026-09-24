/**
 * Step 2 card: the three context phases (First Move / Mid-Game / End Game).
 */
export function StepContextCard({ mode, onModeSelection }) {
  return (
    <div id="step-2" className="bg-white rounded-xl shadow-lg border border-gray-100 transform transition-all hover:scale-[1.01] hover:shadow-xl">
      <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
            <span className="text-xl font-semibold text-pink-500">2</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Choose Your Context</h2>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 gap-3">
          {[
            { name: "First Move", desc: "Nail that opener", emoji: "👋" },
            { name: "Mid-Game", desc: "Keep it flowing", emoji: "💭" },
            { name: "End Game", desc: "Bring it home", emoji: "🎯" },
          ].map((phase) => {
            const isSelected = mode === phase.name.toLowerCase().replace(" ", "-");
            return (
              <button
                key={phase.name}
                className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                  isSelected
                    ? "bg-pink-50 border-2 border-pink-200"
                    : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                }`}
                onClick={() => onModeSelection(phase.name.toLowerCase().replace(" ", "-"))}
              >
                <span className="text-2xl">{phase.emoji}</span>
                <div className="text-left">
                  <div className="font-medium">{phase.name}</div>
                  <div className="text-sm text-gray-500">{phase.desc}</div>
                </div>
                {isSelected && (
                  <div className="ml-auto">
                    <svg className="w-6 h-6 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
