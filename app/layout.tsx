import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Quest Tracker',
  description: 'Track your daily quests and savings',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
