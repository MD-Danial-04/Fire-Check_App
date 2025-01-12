import { Inter } from 'next/font/google'
import { Sidebar } from '@/components/sidebar'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'FireTrack Dashboard',
  description: 'Fire Department Resource Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-[#fefefe]">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  )
}

