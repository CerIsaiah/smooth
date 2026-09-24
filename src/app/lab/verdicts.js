// The first two verdicts shipped with the Lab are SPECIMENS: they show the exact
// format a real verdict will use, with illustrative numbers from the voice guide.
// They are clearly labeled as samples on the page. When the first real experiment
// completes, add its verdict here with isSample: false and a real date.
//
// No JSON-LD on these pages (see [slug]/page.js): structured data would publish
// invented numbers to search engines as if they were reported results.

export const TRUST_FOOTER = {
  heading: 'How we test',
  body: "We run sacrificial accounts we expect to lose to bans. We never message real users first, and we never run experiments on anything a reader told us. The apps' fine print doesn't love us; that's the price of running real tests. We sell one thing, this subscription. No affiliate links, ever. If we ever get paid to say something, it says so in the first line.",
};

export const VERDICTS = [
  {
    slug: 'sample-hinge-boost',
    isSample: true,
    sampleNote: 'Sample — this shows the format. No real experiment has run yet.',
    title: 'Does Hinge Boost do anything?',
    answer: 'Yes. Barely.',
    oneLine: 'Two extra likes for $9.99. Worth it? Barely.',
    metaDescription:
      'A sample Dating App Lab verdict, showing the format. No real experiment has run yet.',
    ran: 'Four accounts, one city, two weeks in September. Same photos, same prompts throughout. Two random nights per week we hit Boost at 8pm; the rest we touched nothing.',
    happened: [
      'Boosted nights averaged 11 likes. Unboosted nights, 9.',
      'Two extra likes for $9.99, with swings of ±3 either way.',
      'Matches: 2.3 per boosted night versus 1.9 without. A gap smaller than our noise.',
    ],
    meaning:
      "Boost gets you seen a little more. Seen isn't the bottleneck; the extra likes converted at the same rate as the regular ones. On this test Boost cost about $5 per extra like and changed nothing about who actually matched.",
    tonight:
      "Nothing. Keep the $9.99. Nothing in our data says a Boost rescues a profile that isn't converting on a normal night.",
  },
  {
    slug: 'sample-first-message-length',
    isSample: true,
    sampleNote: 'Sample — this shows the format. No real experiment has run yet.',
    title: 'Do longer first messages get more replies?',
    answer: "We can't tell, and we tried harder than we expected to.",
    oneLine: "600 messages, and the gap sits inside the noise. We can't tell.",
    metaDescription:
      'A sample Dating App Lab verdict, showing the format. No real experiment has run yet.',
    ran: 'Six accounts, three weeks, two cities. Each sent 100 first messages: 50 at 10–20 words, 50 at 40–60, written the same way, sent at the same times of day.',
    happened: [
      'Short messages: 31 replies of 100.',
      'Long: 34 of 100.',
      'Across 600 messages, that gap sits well inside the noise. A coin flip lands there often.',
    ],
    meaning:
      "Nothing we can defend yet. If length matters, it's smaller than this test can see. One thing we can say: effort didn't get punished. Long messages didn't lose, whatever the \u201cjust say hi\u201d crowd claims.",
    tonight: "Write whatever's natural. Spend your energy on the photos, which is the next vote.",
  },
];

export function getVerdictBySlug(slug) {
  return VERDICTS.find((verdict) => verdict.slug === slug) || null;
}

export function getVerdictSlugs() {
  return VERDICTS.map((verdict) => verdict.slug);
}
