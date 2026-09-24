import Link from 'next/link';
import { VoteBox } from '../components/lab/VoteBox';
import { Scoreboard } from '../components/lab/Scoreboard';
import { VerdictCard } from '../components/lab/VerdictCard';
import { VERDICTS } from './verdicts';

export const metadata = {
  title: 'The Dating App Lab — real experiments, honest verdicts',
  description:
    'We run dating-app experiments on sacrificial accounts and publish the numbers. No affiliate links, ever.',
};

export default function LabIndex() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Hero */}
      <header className="mb-10 sm:mb-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 sm:mb-6 text-gray-900 leading-tight tracking-tight">
          The Dating App <span className="text-pink-500">Lab</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-800 font-medium mb-3">
          We run dating-app experiments on sacrificial accounts, count what happened, and
          publish the verdict. Then we tell you what to do tonight.
        </p>
        <p className="text-base sm:text-lg text-gray-600">
          We sell one thing, a $4.99 subscription. The verdicts are free. No affiliate
          links, ever.
        </p>
      </header>

      {/* Manifesto */}
      <section className="mb-10 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-800">
          What this is
        </h2>
        <div className="space-y-4 text-base sm:text-lg text-gray-700 leading-relaxed">
          <p>
            Dating advice is full of people selling certainty. Most of it was never
            tested. We run the tests, count what happened, and publish the results —
            including the ones that say we couldn&rsquo;t tell.
          </p>
          <p>
            How we test: sacrificial accounts we expect to lose to bans. We never message
            real users first, and we never run experiments on anything a reader told us.
            Real people see the test profiles, and some match with them; we never string
            anyone along, and we never publish anything that could identify a person.
          </p>
          <p>
            Every verdict uses the same five moves: the question, what we ran, what
            happened, what it means for you, and what to do tonight. The last one takes
            ten minutes and costs nothing.
          </p>
        </div>
      </section>

      {/* Live vote */}
      <section className="mb-10 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-gray-800">
          What should we test first?
        </h2>
        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
          You pick. We run the winner first.
        </p>
        <div className="bg-white p-5 sm:p-8 rounded-lg sm:rounded-xl shadow-md">
          <VoteBox />
        </div>
      </section>

      {/* Scoreboard */}
      <section className="mb-10 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-gray-800">
          The scoreboard
        </h2>
        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
          Every test, every verdict, all in one place.
        </p>
        <Scoreboard verdicts={[]} />
      </section>

      {/* Sample verdicts */}
      <section className="mb-10 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-gray-800">
          The format, before the first verdict
        </h2>
        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
          No real experiment has run yet. These samples show exactly what a verdict will
          look like — numbers, noise, and all.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VERDICTS.map((verdict) => (
            <VerdictCard
              key={verdict.slug}
              title={verdict.title}
              line={verdict.oneLine}
              href={`/lab/${verdict.slug}`}
              isSample
            />
          ))}
        </div>
      </section>

      {/* Diary shell */}
      <section className="mb-10 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-gray-800">
          The diary
        </h2>
        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
          Short entries while a test runs. One number each, boring days included.
        </p>
        <div className="bg-gray-50 rounded-lg sm:rounded-xl p-5 sm:p-8 text-sm sm:text-base text-gray-600">
          Day-by-day notes from the first experiment land here.
        </div>
      </section>

      <footer className="border-t border-gray-100 pt-6 text-sm sm:text-base text-gray-600">
        <p className="mb-3">
          If this saves you from buying one Boost, it paid for the month. That&rsquo;s the
          whole pitch.
        </p>
        <Link href="/" className="text-pink-500 font-medium hover:underline">
          Back to SmoothRizz →
        </Link>
      </footer>
    </article>
  );
}
