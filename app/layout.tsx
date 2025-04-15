import { Inter } from 'next/font/google'
import { Sidebar } from '@/components/sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { ThemeProvider } from './providers/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'
import '@fontsource/azeret-mono/400.css' // Regular
import '@fontsource/azeret-mono/500.css' // Medium
import { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FireTrack Dashboard',
  description: 'Fire Department Resource Management System',
  viewport: {
    width: 'device-width',
    initialScale: 1.0,
    maximumScale: 5.0,
    userScalable: true
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-screen bg-background text-foreground">
            {/* Desktop Sidebar - hidden on mobile */}
            <div className="hidden md:block">
              <Sidebar />
            </div>
            
            {/* Main Content */}
            <div className="flex flex-col flex-1 w-full">
              {/* Mobile Header */}
              <header className="flex items-center h-16 px-4 border-b md:hidden">
                <MobileNav />
                <div className="ml-4 font-medium">FireTrack</div>
              </header>
              
              {/* Page Content */}
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

