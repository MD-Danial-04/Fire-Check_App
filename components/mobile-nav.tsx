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
  Moon,
  Home,
  Shield,
  FileCheck
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
    icon: Shield
  },
  {
    name: 'Equipment Checklist',
    href: '/equipment-checklist',
    icon: FileCheck
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
      {/* Fixed header with app name and menu button */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 h-14">
          <Button 
            variant="ghost"
            size="icon" 
            onClick={toggleMenu}
            aria-label="Toggle menu"
            className="h-9 w-9 rounded-lg"
          >
            {isOpen ? (
              <X className="h-4 w-4 transition-transform duration-200" />
            ) : (
              <Menu className="h-4 w-4 transition-transform duration-200" />
            )}
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-neutral-900 dark:bg-neutral-100"></div>
            <span className="text-lg font-medium">FireTrack</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="h-9 w-9 rounded-lg"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-blue-400" />
            )}
          </Button>
        </div>
      </div>

      {/* Overlay with improved fade effect */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu with improved animation */}
      <div 
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-[280px] bg-background shadow-lg transform transition-all duration-300 ease-in-out border-r border-border",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto">
            {/* App info section */}
            <div className="p-4 mb-2 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-neutral-900 dark:bg-neutral-100"></div>
                <span className="text-lg font-medium">FireTrack</span>
              </div>
            </div>

            {/* Navigation section */}
            <div className="px-4 py-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Navigation</h2>
            </div>
            
            <ul className="px-2 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Footer with version */}
          <div className="border-t border-border p-4 bg-muted/50">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-medium text-muted-foreground">FireTrack</span>
              <span className="text-xs text-muted-foreground">v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 