import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Quest Tracker',
  description: 'Track your daily quests and savings',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Quest Tracker',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: '#0a0a0a' }}>
      <head>
        {/* iOS Safari theme color - multiple for different states */}
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0a0a0a" />
        
        {/* iOS PWA settings */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* Prevent white flash */}
        <style dangerouslySetInnerHTML={{ __html: `
          html, body { 
            background-color: #0a0a0a !important; 
          }
          /* iOS overscroll background */
          html::before {
            content: '';
            position: fixed;
            top: -100vh;
            left: 0;
            right: 0;
            height: 100vh;
            background-color: #0a0a0a;
            z-index: -1;
          }
          html::after {
            content: '';
            position: fixed;
            bottom: -100vh;
            left: 0;
            right: 0;
            height: 100vh;
            background-color: #0a0a0a;
            z-index: -1;
          }
        `}} />
      </head>
      <body className={`${inter.className} bg-[#0a0a0a] text-white antialiased min-h-screen`} style={{ backgroundColor: '#0a0a0a' }}>
        <div className="min-h-screen bg-[#0a0a0a]">
          {children}
        </div>
      </body>
    </html>
  )
}
