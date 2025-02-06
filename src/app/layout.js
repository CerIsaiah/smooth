// app/layout.js
import { Poppins } from 'next/font/google'
import { Analytics } from "@vercel/analytics/react"
import './globals.css'

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
        <script src="https://accounts.google.com/gserviceauth/js"></script>
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      </head>
      <body className="font-poppins">
        {children}
        <Analytics />

        </body>
    </html>
  )
}