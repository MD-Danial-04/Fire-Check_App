'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface Column {
  key: string
  header: string
  className?: string
  render?: (value: any, item: any) => React.ReactNode
}

interface ResponsiveTableProps {
  columns: Column[]
  data: any[]
  className?: string
  cardClassName?: string
  emptyMessage?: string
  keyField?: string
}

export function ResponsiveTable({
  columns,
  data,
  className,
  cardClassName,
  emptyMessage = "No data available",
  keyField = "id"
}: ResponsiveTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      {/* Desktop Table - Hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className={cn("w-full border-collapse", className)}>
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              {columns.map((column) => (
                <th 
                  key={column.key} 
                  className={cn(
                    "px-4 py-3 text-left text-sm font-medium text-neutral-500 dark:text-neutral-400",
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr 
                key={item[keyField] || index}
                className="border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                {columns.map((column) => (
                  <td 
                    key={`${item[keyField] || index}-${column.key}`}
                    className={cn(
                      "px-4 py-3 text-sm",
                      column.className
                    )}
                  >
                    {column.render 
                      ? column.render(item[column.key], item)
                      : item[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards - Shown only on mobile */}
      <div className="md:hidden space-y-4">
        {data.map((item, index) => (
          <div 
            key={item[keyField] || index}
            className={cn(
              "p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900",
              cardClassName
            )}
          >
            {columns.map((column) => (
              <div key={`${item[keyField] || index}-${column.key}`} className="mb-2 last:mb-0">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  {column.header}
                </div>
                <div className="text-sm">
                  {column.render 
                    ? column.render(item[column.key], item)
                    : item[column.key]}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
} 