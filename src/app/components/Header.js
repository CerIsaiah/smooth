import Link from "next/link";

/**
 * Header bar: brand mark plus the Google sign-in button (anonymous visitors)
 * or the Dashboard link (signed-in users).
 */
export function Header({ isSignedIn, googleButtonRef }) {
  return (
    <div className="flex justify-between items-center p-3 sm:p-4 bg-white/95 backdrop-blur-sm border-b border-pink-100">
      <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pink-500 to-rose-600 bg-clip-text text-transparent">
        SmoothRizz
      </div>
      <div className="scale-78 origin-right sm:scale-100">
        {!isSignedIn && <div ref={googleButtonRef} className="!min-w-[120px]"></div>}
        {isSignedIn && (
          <Link
            href="/saved"
            className="px-4 py-2 rounded-full text-white text-sm font-medium bg-gray-900 hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            Dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
