import Link from 'next/link';

// A card for one published (or sample) verdict. Used on the Lab index.
export function VerdictCard({ title, line, date, href, isSample = false }) {
  return (
    <Link
      href={href}
      className="block bg-white border border-gray-200 rounded-xl p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-pink-400 transition-all duration-200"
    >
      <div className="flex items-center gap-2 mb-2">
        {isSample && (
          <span className="text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            Sample
          </span>
        )}
        {date && (
          <span className="text-xs sm:text-sm text-gray-500">{date}</span>
        )}
      </div>
      <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm sm:text-base text-gray-700">{line}</p>
    </Link>
  );
}
