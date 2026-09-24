import Head from "next/head";

/**
 * SEO metadata, Open Graph/Twitter tags, and JSON-LD for the home page.
 *
 * Note: `asPath` comes from the App Router's `useRouter()`, which has no
 * `asPath` — the canonical href renders as in the original page.js (flagged
 * for a follow-up, intentionally not fixed here to avoid changing canonical URLs).
 */
export function SeoHead({ asPath }) {
  return (
    <Head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      {/* Preconnect for performance */}
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <link rel="preconnect" href="https://www.google-analytics.com" />
      <link rel="preconnect" href="https://accounts.google.com" />
      {/* Alternate/Hreflang */}
      <link rel="alternate" hrefLang="en" href="https://www.smoothrizz.com" />
      {/* Apple Touch Icon */}
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

      {/* Updated SEO Meta Tags */}
      <title>SmoothRizz - AI Dating Response Generator | Get More Matches</title>
      <meta
        name="description"
        content="Generate witty, personalized dating app responses with SmoothRizz AI. Improve your match rate and stand out from the crowd with smart conversation starters."
      />
      <meta name="keywords" content="ai rizz, dating app responses, AI dating assistant, conversation starter, digital dating help, dating message generator, smooth talker ai" />
      <meta name="robots" content="index, follow" />
      <link
        rel="canonical"
        href={`https://smoothrizz.com${asPath}`}
      />

      <meta property="og:title" content="SmoothRizz - AI-Powered Dating Response Generator | Master Digital Charisma" />
      <meta
        property="og:description"
        content="Transform your dating game with SmoothRizz's AI-powered response generator. Get personalized, witty responses for dating apps and boost your success rate. Try it now!"
      />
      <meta property="og:url" content="https://www.smoothrizz.com" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.smoothrizz.com/og-image.jpg" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="SmoothRizz - AI-Powered Dating Response Generator | Master Digital Charisma" />
      <meta
        name="twitter:description"
        content="Transform your dating game with SmoothRizz's AI-powered response generator. Get personalized, witty responses for dating apps and boost your success rate. Try it now!"
      />
      <meta name="twitter:image" content="https://www.smoothrizz.com/og-image.jpg" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "SmoothRizz",
            "url": "https://www.smoothrizz.com",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://www.smoothrizz.com/search?q={search_term_string}",
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is AI Rizz?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "AI Rizz is our innovative artificial intelligence solution designed to enhance digital communication by providing smart suggestions and insights."
                }
              },
              {
                "@type": "Question",
                "name": "How does the AI Rizz App work?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "The AI Rizz App uses advanced algorithms to analyze conversations and provide tailored suggestions that help improve your interaction style."
                }
              }
            ]
          }),
        }}
      />
    </Head>
  );
}
