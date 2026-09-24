import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TRUST_FOOTER, getVerdictBySlug, getVerdictSlugs } from '../verdicts';

// The Lab ships with specimen verdicts only; unknown slugs 404 rather than render.
export const dynamicParams = false;

export function generateStaticParams() {
  return getVerdictSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const verdict = getVerdictBySlug(slug);
  if (!verdict) return {};
  return {
    title: `${verdict.title} — Dating App Lab`,
    description: verdict.metaDescription,
  };
}

// No JSON-LD here on purpose: these verdicts are specimens with illustrative
// numbers, and structured data would hand search engines invented results as
// reported ones. Add Article schema when the first real verdict publishes — and
// without a fabricated aggregateRating.
export default async function LabVerdictPage({ params }) {
  const { slug } = await params;
  const verdict = getVerdictBySlug(slug);
  if (!verdict) {
    notFound();
  }

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {verdict.isSample && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-8 text-sm sm:text-base">
          {verdict.sampleNote}
        </div>
      )}

      <header className="mb-10 sm:mb-16">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-pink-500 mb-3">
          <Link href="/lab" className="hover:underline">
            Dating App Lab
          </Link>
        </p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 sm:mb-6 text-gray-900 leading-tight tracking-tight">
          {verdict.title}
        </h1>
        {/* Verdict first: the answer is the second line on the page, every time. */}
        <p className="text-lg sm:text-xl text-gray-800 font-bold">{verdict.answer}</p>
        {verdict.date && (
          <p className="text-gray-600 text-sm sm:text-base mt-2">
            <time dateTime={verdict.date}>{verdict.date}</time>
          </p>
        )}
      </header>

      <div className="space-y-6 sm:space-y-8">
        <section className="bg-white rounded-lg sm:rounded-xl p-5 sm:p-8 shadow-md">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-800">
            What we ran
          </h2>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
            {verdict.ran}
          </p>
        </section>

        <section className="bg-white rounded-lg sm:rounded-xl p-5 sm:p-8 shadow-md">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-800">
            What happened
          </h2>
          <ul className="space-y-3">
            {verdict.happened.map((line) => (
              <li key={line} className="flex items-start space-x-3">
                <span className="text-pink-500 text-xl mt-1">•</span>
                <span className="text-base sm:text-lg text-gray-700 leading-relaxed">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-lg sm:rounded-xl p-5 sm:p-8 shadow-md">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-800">
            What it means for you
          </h2>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
            {verdict.meaning}
          </p>
        </section>

        <section className="bg-white rounded-lg sm:rounded-xl p-5 sm:p-8 shadow-md">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-800">
            Do this tonight
          </h2>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
            {verdict.tonight}
          </p>
        </section>
      </div>

      <aside className="bg-gray-50 rounded-lg sm:rounded-xl p-5 sm:p-8 mt-10 sm:mt-16">
        <h2 className="text-lg sm:text-2xl font-bold mb-4 text-gray-800">
          {TRUST_FOOTER.heading}
        </h2>
        <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
          {TRUST_FOOTER.body}
        </p>
      </aside>
    </article>
  );
}
