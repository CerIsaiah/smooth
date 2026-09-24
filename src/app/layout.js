// app/layout.js
import { Poppins } from 'next/font/google'
import { Analytics } from "@vercel/analytics/react"
import './globals.css'
import Script from 'next/script'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
})

export const metadata = {
  title: 'SmoothRizz',
  description: 'Be the Smooth Talker',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable}`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- keeping the original synchronous load; changing script timing is a behavior change */}
        <script src="https://accounts.google.com/gserviceauth/js"></script>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-FD93L95WFQ"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-FD93L95WFQ');
          `}
        </Script>
      </head>
      <body className="font-poppins">
        {children}
        <Analytics />

        </body>
    </html>
  )
}