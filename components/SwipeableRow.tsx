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
    }, 150) // Match this with animation duration
    
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
      document.addEventListener('touchstart', handleClickAway)
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
    
    // Execute callback immediately but keep menu open until callback completes
    if (onEdit) {
      // Start closing animation immediately
      setIsMenuOpen(false)
      setIsExiting(true)
      
      // Execute the edit action with minimal delay
      requestAnimationFrame(() => {
        onEdit()
        
        // Reset states after a short delay
        requestAnimationFrame(() => {
          setIsProcessing(false)
          setIsExiting(false)
        })
      })
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
      // Start closing animation immediately
      setIsMenuOpen(false)
      setIsExiting(true)
      
      // Execute the clear action immediately
      onClear()
      
      // Reset processing state after a minimal delay to allow UI to update
      requestAnimationFrame(() => {
        setIsProcessing(false)
        
        // Reset exiting state slightly later to ensure animations complete
        setTimeout(() => {
          setIsExiting(false)
        }, 100)
      })
    } else {
      closeMenu()
      setIsProcessing(false)
    }
  }

  return (
    <div ref={containerRef} className="relative touch-pan-y border-b border-gray-200 dark:border-gray-800">
      {/* Overlay to block interactions when menu is open */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
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
          stiffness: 550, 
          damping: 30,
          opacity: { duration: 0.1 }
        }}
      >
        <motion.button
          onClick={handleEdit}
          className={cn(
            "p-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors",
            (isProcessing || isExiting) && "opacity-50 pointer-events-none"
          )}
          whileTap={{ scale: 0.95 }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.1 }}
        >
          <Pencil className="w-5 h-5 text-white" />
        </motion.button>
        <motion.button
          onClick={handleClear}
          className={cn(
            "p-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors",
            (isProcessing || isExiting) && "opacity-50 pointer-events-none"
          )}
          whileTap={{ scale: 0.95 }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.1 }}
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
            stiffness: 550, 
            damping: 30,
            duration: 0.15
          }
        }}
        className={cn(
          "relative bg-white dark:bg-neutral-900 touch-pan-y will-change-transform",
          // Only disable pointer events when menu is open, not during exiting state
          isMenuOpen && "pointer-events-none",
          // Always apply select-none to prevent text selection during swipe
          "select-none",
          className
        )}
      >
        {children}
      </motion.div>
    </div>
  )
} 