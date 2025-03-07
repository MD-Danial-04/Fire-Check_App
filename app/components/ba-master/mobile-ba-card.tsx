'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BaMasterList } from '@/types/database'

interface MobileBACardProps {
  backplate: BaMasterList
  getRole: (location: string | null) => string
  isServiceDueThisMonth: (dueDate: string | null) => boolean
  isServiceOverdue: (dueDate: string | null) => boolean
}

export function MobileBACard({ 
  backplate, 
  getRole, 
  isServiceDueThisMonth, 
  isServiceOverdue 
}: MobileBACardProps) {
  return (
    <div className="p-3 border border-gray-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">
          {getRole(backplate.location)}
        </span>
        {!backplate.is_spare ? (
          <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-1">
            <Check className="h-3 w-3 text-green-800 dark:text-green-400" />
          </div>
        ) : (
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-full p-1">
            <X className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Backplate</span>
          <span className="text-sm font-medium">
            {backplate.serial_number}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Cylinder</span>
          <span className="text-sm font-medium">
            {backplate.cylinder_serial || 'Not assigned'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Last Service</span>
          <span className="text-sm font-medium">
            {backplate.hydro_date || 'Not recorded'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Next Service</span>
          <span className={cn(
            "text-sm font-medium",
            isServiceDueThisMonth(backplate.service_due_date) && "text-amber-600 dark:text-amber-400",
            isServiceOverdue(backplate.service_due_date) && "text-red-600 dark:text-red-400"
          )}>
            {backplate.service_due_date || 'Not scheduled'}
          </span>
        </div>
      </div>
    </div>
  )
} 