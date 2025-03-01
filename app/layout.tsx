import { Inter } from 'next/font/google'
import { Sidebar } from '@/components/sidebar'
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
      <body className={inter.className}>
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-screen bg-background text-foreground">
            <Sidebar />
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

