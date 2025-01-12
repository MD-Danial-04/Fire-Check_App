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
    <aside className="w-64 border-r border-neutral-100 bg-white p-4">
      <div className="flex items-center gap-3 px-2 py-4">
        <div className="h-8 w-8 rounded-lg bg-neutral-900"></div>
        <span className="text-xl font-medium">FireTrack</span>
      </div>
      <nav className="mt-8 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === item.href
                  ? 'bg-neutral-100 text-neutral-900 font-medium'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

