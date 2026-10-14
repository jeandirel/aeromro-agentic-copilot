import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AeroMRO | Engine intelligence',
  description: 'Decision support for aircraft engine maintenance teams.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
