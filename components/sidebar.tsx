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
  X
} from 'lucide-react'
import { ThemeToggle } from '@/app/components/ui/theme-toggle'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
    icon: LayoutDashboard
  },
  {
    name: 'BA Master List',
    href: '/ba-master-list',
    icon: Database
  },
  {
    name: 'Manning List',
    href: '/manning-list',
    icon: Users
  },
  {
    name: 'PPE Check',
    href: '/ppe-check',
    icon: HardHat
  }
]

export function Sidebar() {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

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
      {/* Mobile menu button - only visible on small screens */}
      {isMobile && (
        <div className="fixed top-4 left-4 z-50">
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
        </div>
      )}

      {/* Theme toggle - fixed position on mobile */}
      {isMobile && !isMobileMenuOpen && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full p-2 shadow-md">
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* Sidebar - full on desktop, slide-in on mobile */}
      <aside 
        className={cn(
          "w-64 border-r border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800 p-4 flex flex-col h-screen",
          isMobile ? "fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out" : "",
          isMobile && !isMobileMenuOpen ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <div className="flex items-center justify-between px-2 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-neutral-900 dark:bg-neutral-100"></div>
            <span className="text-xl font-medium dark:text-white">FireTrack</span>
          </div>
          
          {/* Theme toggle inside sidebar - visible on desktop or when mobile menu is open */}
          {(!isMobile || isMobileMenuOpen) && (
            <ThemeToggle />
          )}
        </div>
        
        <nav className="mt-6 space-y-1 flex-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-neutral-100 text-neutral-900 font-medium dark:bg-neutral-800 dark:text-white'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
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

