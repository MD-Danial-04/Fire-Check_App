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
  Database
} from 'lucide-react'
import { ThemeToggle } from '@/app/components/ui/theme-toggle'

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

  return (
    <aside className="w-64 border-r border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800 p-4 flex flex-col h-screen">
      <div className="flex items-center gap-3 px-2 py-4">
        <div className="h-8 w-8 rounded-lg bg-neutral-900 dark:bg-neutral-100"></div>
        <span className="text-xl font-medium dark:text-white">FireTrack</span>
      </div>
      <nav className="mt-8 space-y-1 flex-1">
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
      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4 mt-auto">
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}

