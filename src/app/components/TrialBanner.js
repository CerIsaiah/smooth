/**
 * Gradient announcement bar with the "Try Free" checkout shortcut.
 */
export function TrialBanner({ onCheckout }) {
  return (
    <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 text-white py-1.5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center justify-center gap-1.5">
            <span className="bg-yellow-400 text-yellow-800 text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full">NEW</span>
            <p className="text-xs sm:text-sm font-medium">
              3x faster learning and unlimited swipes with free 3 day trial!
            </p>
          </div>
          <button
            onClick={onCheckout}
            className="text-[10px] sm:text-xs bg-white text-pink-600 px-2.5 py-0.5 rounded-full font-medium hover:bg-pink-50 transition-colors whitespace-nowrap"
          >
            Try Free
          </button>
        </div>
      </div>
      {/* Smaller sparkle effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-0.5 h-0.5 bg-white rounded-full opacity-75 animate-ping"></div>
        <div className="absolute top-1/3 right-1/3 w-0.5 h-0.5 bg-white rounded-full opacity-75 animate-ping delay-300"></div>
        <div className="absolute bottom-1/2 right-1/4 w-0.5 h-0.5 bg-white rounded-full opacity-75 animate-ping delay-700"></div>
      </div>
    </div>
  );
}
