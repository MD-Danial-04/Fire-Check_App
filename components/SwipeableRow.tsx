import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from "@/lib/utils"
import { Pencil, Trash2 } from 'lucide-react'

interface SwipeableRowProps {
  children: React.ReactNode
  onEdit?: () => void
  onClear?: () => void
  className?: string
  isChecked?: boolean
}

export function SwipeableRow({ children, onEdit, onClear, className, isChecked }: SwipeableRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const currentX = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  // Constants for swipe behavior
  const SWIPE_THRESHOLD = -50 // minimum distance to trigger action (negative for left swipe)
  const MAX_SWIPE = -100 // maximum swipe distance (negative for left swipe)

  // Memoize the closeMenu function to avoid recreating it on each render
  const closeMenu = useCallback(() => {
    if (isProcessing || isExiting) return
    
    setIsExiting(true)
    setIsMenuOpen(false)
    
    // Reset exiting state after animation completes
    const timer = setTimeout(() => {
      setIsExiting(false)
    }, 80) // Further reduced animation duration
    
    return () => clearTimeout(timer)
  }, [isProcessing, isExiting])

  useEffect(() => {
    const handleClickAway = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickAway)
      document.addEventListener('touchstart', handleClickAway, { passive: true })
    }

    return () => {
      document.removeEventListener('mousedown', handleClickAway)
      document.removeEventListener('touchstart', handleClickAway)
    }
  }, [isMenuOpen, closeMenu])

  const handleDragStart = (event: React.TouchEvent | React.MouseEvent) => {
    if (isProcessing || isExiting) return
    
    // Don't start dragging on form elements
    const target = event.target as HTMLElement
    if (target.closest('button, select, input, a, [role="button"]')) {
      return
    }
    
    setIsDragging(true)
    startX.current = 'touches' in event 
      ? event.touches[0].clientX 
      : (event as React.MouseEvent).clientX
    currentX.current = 0
  }

  const handleDragMove = (event: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || isProcessing || isExiting) return

    const clientX = 'touches' in event 
      ? event.touches[0].clientX 
      : (event as React.MouseEvent).clientX
    
    const diff = clientX - startX.current
    // Only allow left swipe (negative values)
    currentX.current = Math.min(0, Math.max(MAX_SWIPE, diff))
  }

  const handleDragEnd = () => {
    if (isProcessing || isExiting) return
    setIsDragging(false)
    
    if (currentX.current < SWIPE_THRESHOLD) {
      setIsMenuOpen(true)
    } else {
      closeMenu()
    }
    
    currentX.current = 0
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isProcessing || isExiting) return
    
    setIsProcessing(true)
    
    // Execute callback immediately and close menu faster
    if (onEdit) {
      setIsMenuOpen(false)
      setIsExiting(true)
      
      // Execute the edit action immediately
      onEdit()
      
      // Reset states immediately
      setIsProcessing(false)
      setIsExiting(false)
    } else {
      closeMenu()
      setIsProcessing(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isProcessing || isExiting) return
    
    setIsProcessing(true)
    
    // Execute callback immediately
    if (onClear) {
      setIsMenuOpen(false)
      setIsExiting(true)
      
      // Execute the clear action immediately
      onClear()
      
      // Reset processing state immediately
      setIsProcessing(false)
      setIsExiting(false)
    } else {
      closeMenu()
      setIsProcessing(false)
    }
  }

  return (
    <div 
      ref={containerRef} 
      className="relative border-b border-gray-200 dark:border-gray-800"
      style={{ touchAction: "manipulation" }}
    >
      {/* Overlay to block interactions when menu is open */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className="absolute inset-0 bg-black/5 dark:bg-black/20 z-40"
            onClick={() => !isProcessing && !isExiting && closeMenu()}
          />
        )}
      </AnimatePresence>

      {/* Action buttons with black background */}
      <motion.div 
        className={cn(
          "absolute right-0 top-0 bottom-0 flex items-center gap-2 px-3 z-50",
          "bg-black"
        )}
        initial={{ x: "100%" }}
        animate={{ 
          x: isMenuOpen ? 0 : "100%",
          opacity: isMenuOpen ? 1 : 0.95
        }}
        transition={{ 
          type: "spring", 
          stiffness: 700, 
          damping: 40,
          opacity: { duration: 0.08 }
        }}
      >
        <motion.button
          onClick={handleEdit}
          className={cn(
            "p-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors",
            (isProcessing || isExiting) && "opacity-50 pointer-events-none"
          )}
          whileTap={{ scale: 1 }}
          aria-label="Edit"
        >
          <Pencil className="w-5 h-5 text-white" />
        </motion.button>
        <motion.button
          onClick={handleClear}
          className={cn(
            "p-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors",
            (isProcessing || isExiting) && "opacity-50 pointer-events-none"
          )}
          whileTap={{ scale: 1 }}
          aria-label="Clear"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </motion.button>
      </motion.div>

      {/* Swipeable content layer */}
      <motion.div
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        animate={{ 
          x: isMenuOpen ? MAX_SWIPE : 0,
          transition: { 
            type: "spring", 
            stiffness: 700, 
            damping: 40,
            duration: 0.08
          }
        }}
        className={cn(
          "relative bg-white dark:bg-neutral-900 will-change-transform",
          isMenuOpen && "pointer-events-none",
          "select-none",
          className
        )}
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </motion.div>
    </div>
  )
} 