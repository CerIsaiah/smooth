// app/layout.js
import { Poppins } from 'next/font/google'
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
      <body className="font-poppins">{children}</body>
    </html>
  )
}