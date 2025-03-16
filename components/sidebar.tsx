'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  FileCheck,
  HardHat,
  Database,
  Menu,
  X,
  Sun,
  Moon,
  Home,
  Shield,
  Truck,
  Smartphone
} from 'lucide-react'
import { ThemeToggle } from '@/app/components/ui/theme-toggle'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/app/providers/theme-provider'

const routes = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
    href: '/',
    color: 'text-sky-500',
  },
  {
    name: 'BA Master List',
    icon: Database,
    href: '/ba-master-list',
    color: 'text-blue-700',
  },
  {
    name: 'Manning List',
    icon: Users,
    href: '/manning-list',
    color: 'text-violet-500',
  },
  {
    name: 'PPE Check',
    icon: Shield,
    href: '/ppe-check',
    color: 'text-pink-700',
  },
  {
    name: 'Equipment Checklist',
    icon: FileCheck,
    href: '/equipment-checklist',
    color: 'text-orange-700',
  }
]

export function Sidebar() {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { theme, setTheme } = useTheme()

  // Check if we're on mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    // Initial check
    checkIfMobile()
    
    // Add event listener
    window.addEventListener('resize', checkIfMobile)
    
    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile)
  }, [])

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile menu button and theme toggle container - only visible on small screens */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 flex items-center justify-between p-4 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800 z-50">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-md"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="h-10 w-10 rounded-full bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 shadow-lg"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Sun className="h-5 w-5 text-amber-500" />
            ) : (
              <Moon className="h-5 w-5 text-blue-400" />
            )}
          </Button>
        </div>
      )}

      {/* Sidebar - full on desktop, slide-in on mobile */}
      <aside 
        className={cn(
          "w-64 border-r border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800 p-4 flex flex-col h-screen",
          isMobile ? "fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out mt-[73px]" : "",
          isMobile && !isMobileMenuOpen ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <div className="flex items-center justify-between px-2 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-neutral-900 dark:bg-neutral-100"></div>
            <span className="text-xl font-medium dark:text-white">FireTrack</span>
          </div>
          
          {/* Theme toggle inside sidebar - always visible */}
          <ThemeToggle />
        </div>
        
        <nav className="mt-6 space-y-1 flex-1 overflow-y-auto">
          {routes.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  pathname === item.href
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-700 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100',
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-md'
                )}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                <Icon
                  className={cn(
                    pathname === item.href
                      ? item.color || 'text-neutral-500'
                      : 'text-neutral-400 group-hover:text-neutral-500 dark:text-neutral-500 dark:group-hover:text-neutral-400',
                    'mr-3 flex-shrink-0 h-5 w-5'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
        
        {/* Version info at bottom */}
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4 mt-auto">
          <div className="px-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">FireTrack v1.0.0</span>
          </div>
        </div>
      </aside>
      
      {/* Backdrop for mobile menu */}
      {isMobile && isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}

