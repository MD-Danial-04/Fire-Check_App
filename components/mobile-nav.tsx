'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Database,
  Users,
  HardHat,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/app/components/ui/theme-toggle'
import { useTheme } from '@/app/providers/theme-provider'

// Navigation items - same as in the sidebar
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

export function MobileNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  return (
    <div className="md:hidden">
      {/* Minimal top header with just menu button */}
      <div className="fixed top-0 left-0 right-0 flex items-center p-4 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800 z-50">
        <Button 
          variant="outline"
          size="icon" 
          onClick={toggleMenu}
          aria-label="Toggle menu"
          className="h-10 w-10 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-md"
        >
          {isOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu */}
      <div 
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-3/4 max-w-sm bg-white dark:bg-neutral-900 shadow-lg transform transition-transform duration-200 ease-in-out mt-[73px]",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header with app name and theme toggle */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-neutral-900 dark:bg-neutral-100"></div>
              <span className="text-xl font-medium dark:text-white">FireTrack</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="h-9 w-9 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-blue-400" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-neutral-100 text-neutral-900 font-medium dark:bg-neutral-800 dark:text-white"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 