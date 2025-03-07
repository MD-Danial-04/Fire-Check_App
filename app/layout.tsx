import { Inter } from 'next/font/google'
import { Sidebar } from '@/components/sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { ThemeProvider } from './providers/theme-provider'
import './globals.css'
import '@fontsource/azeret-mono/400.css' // Regular
import '@fontsource/azeret-mono/500.css' // Medium

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
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
        </ThemeProvider>
      </body>
    </html>
  )
}

