'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "../../components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from "@/lib/utils"
import type { BaMasterList } from '@/types/database'

interface ValidationResult {
  location: string
  setNumber: string
  backplateNumber: string
  cylinderNumber: string
  status: 'match' | 'mismatch' | 'missing'
  details?: string
}

interface BAValidationPanelProps {
  baList: BaMasterList[]
  isOpen: boolean
  onClose: () => void
}

export const BAValidationPanel = ({ baList, isOpen, onClose }: BAValidationPanelProps) => {
  const [inputText, setInputText] = useState('')
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [isValidating, setIsValidating] = useState(false)
  const [debugParsed, setDebugParsed] = useState<ValidationResult[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [activePanel, setActivePanel] = useState<'input' | 'results'>('input')
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchEndX, setTouchEndX] = useState<number | null>(null)
  const [swipeDelta, setSwipeDelta] = useState<number>(0)

  const parseInputText = (text: string): ValidationResult[] => {
    const results: ValidationResult[] = []
    const lines = text.split('\n')
    let currentLocation = ''
    let currentSet = ''
    let backplateNumber = ''
    let cylinderNumber = ''

    const locationHeaderRegex = /^\*([A-Z0-9]+)\*/i
    const setRegex = /^\*([A-Z0-9]+) BA Set (\d+)\*/i
    const roleRegex = /^\((SC|PO|FF ?1|FF ?2)\)/i
    const backplateRegex1 = /Backplate No\.:\s*([A-Z0-9\-]+)/i
    const backplateRegex2 = /Backplate number\s*-\s*([A-Z0-9\-]+)/i
    const backplateParenRegex = /Backplate number\s*-\s*\(([^)]+)\)/i
    const cylinderParenRegex = /\(cylinder:\s*([A-Z0-9\-]+)\)/i
    const cylinderLineRegex2 = /Cylinder number\s*-\s*([A-Z0-9\-]+)/i
    const cylinderParenRegex2 = /Cylinder number\s*-\s*\(([^)]+)\)/i
    const backplateAndCylinderCombinedRegex = /Backplate No\.: \(Backplate ([A-Z0-9\-]+) *\)\(Cylinder ([A-Z0-9\-]+) *\)/i

    const pushResult = () => {
      if (currentLocation && currentSet && backplateNumber) {
        // Case-insensitive, trimmed matching
        const setIsRole = ['SC', 'PO', 'FF1', 'FF2'].includes(currentSet.toUpperCase().replace(' ', ''))
        const expectedLocation = setIsRole
          ? `${currentLocation} - ${currentSet.replace(' ', '')}`
          : `${currentLocation} - Set ${currentSet}`
        const expectedLocationNorm = expectedLocation.trim().toUpperCase()
        const inputBackplate = backplateNumber.trim().toUpperCase()
        const inputCylinder = cylinderNumber.trim().toUpperCase()
        const matchingBA = baList.find(ba =>
          ba.serial_number.trim().toUpperCase() === inputBackplate &&
          (!cylinderNumber || ba.cylinder_serial.trim().toUpperCase() === inputCylinder) &&
          (ba.location?.trim().toUpperCase() === expectedLocationNorm)
        )
        let details: string | undefined = undefined
        if (!matchingBA) {
          // Try to find a partial match for better error reporting
          const baByLocation = baList.find(ba => ba.location?.trim().toUpperCase() === expectedLocationNorm)
          const baByBackplate = baList.find(ba => ba.serial_number.trim().toUpperCase() === inputBackplate)
          const baByCylinder = baList.find(ba => ba.cylinder_serial && ba.cylinder_serial.trim().toUpperCase() === inputCylinder)
          const baByLocAndBackplate = baList.find(ba => ba.location?.trim().toUpperCase() === expectedLocationNorm && ba.serial_number.trim().toUpperCase() === inputBackplate)
          let mismatchMessages: string[] = []
          if (!baByLocAndBackplate) {
            // Location or backplate mismatch
            if (!baByLocation) mismatchMessages.push(`Location does not match any master list entry`)
            if (!baByBackplate) mismatchMessages.push(`Backplate number does not match any master list entry`)
          } else {
            // Location and backplate match, check cylinder
            if (cylinderNumber && baByLocAndBackplate.cylinder_serial.trim().toUpperCase() !== inputCylinder) {
              mismatchMessages.push(`Cylinder number does not match: expected '${baByLocAndBackplate.cylinder_serial}', got '${cylinderNumber}'`)
            }
          }
          if (mismatchMessages.length === 0) mismatchMessages.push('Not found in master list')
          details = mismatchMessages.join('; ')
        }
        results.push({
          location: currentLocation,
          setNumber: currentSet,
          backplateNumber,
          cylinderNumber,
          status: matchingBA ? 'match' : 'mismatch',
          details
        })
      }
    }

    for (const line of lines) {
      // Detect location header
      const locationHeaderMatch = line.match(locationHeaderRegex)
      if (locationHeaderMatch) {
        pushResult()
        currentLocation = locationHeaderMatch[1].trim()
        currentSet = ''
        backplateNumber = ''
        cylinderNumber = ''
        continue
      }
      // Detect set header
      const setMatch = line.match(setRegex)
      if (setMatch) {
        pushResult()
        currentLocation = setMatch[1].trim()
        currentSet = setMatch[2].trim()
        backplateNumber = ''
        cylinderNumber = ''
        continue
      }
      // Detect role header
      const roleMatch = line.match(roleRegex)
      if (roleMatch) {
        pushResult()
        currentSet = roleMatch[1].replace(' ', '').toUpperCase()
        backplateNumber = ''
        cylinderNumber = ''
        continue
      }
      // Backplate and cylinder combined (RFV811 format)
      const combinedMatch = line.match(backplateAndCylinderCombinedRegex)
      if (combinedMatch) {
        backplateNumber = combinedMatch[1].trim()
        cylinderNumber = combinedMatch[2].trim()
        continue
      }
      // Backplate number (parenthesis)
      const backplateParenMatch = line.match(backplateParenRegex)
      if (backplateParenMatch) {
        backplateNumber = backplateParenMatch[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
      // Backplate number
      const backplateMatch1 = line.match(backplateRegex1)
      if (backplateMatch1) {
        backplateNumber = backplateMatch1[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
      const backplateMatch2 = line.match(backplateRegex2)
      if (backplateMatch2) {
        backplateNumber = backplateMatch2[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
      // Cylinder number (parenthesis, custom for Cylinder number - (...))
      const cylinderParenMatch2 = line.match(cylinderParenRegex2)
      if (cylinderParenMatch2) {
        cylinderNumber = cylinderParenMatch2[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
      // Cylinder number (parenthesis)
      const cylinderParenMatch = line.match(cylinderParenRegex)
      if (cylinderParenMatch) {
        cylinderNumber = cylinderParenMatch[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
      // Cylinder number (line, specific first)
      const cylinderLineMatch2 = line.match(cylinderLineRegex2)
      if (cylinderLineMatch2) {
        cylinderNumber = cylinderLineMatch2[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
      // Cylinder number (line, generic, but must not match 'number')
      const cylinderLineMatch1 = line.match(/cylinder[:\s-]+([A-Z0-9][A-Z0-9\-]+)/i)
      if (cylinderLineMatch1) {
        cylinderNumber = cylinderLineMatch1[1].split(/\s|[^A-Z0-9\-]/i)[0].trim()
        continue
      }
    }
    // Push the last set if exists
    pushResult()
    setDebugParsed([...results])
    return results
  }

  const handleValidate = () => {
    setIsValidating(true)
    const results = parseInputText(inputText)
    setValidationResults(results)
    setIsValidating(false)
    // On mobile, switch to results panel after validating
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setActivePanel('results')
    }
  }

  // Handle swipe gesture
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(e.changedTouches[0].clientX)
    setSwipeDelta(0)
  }
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchEndX(e.changedTouches[0].clientX)
    if (touchStartX !== null) {
      setSwipeDelta(e.changedTouches[0].clientX - touchStartX)
    }
  }
  const handleTouchEnd = () => {
    if (touchStartX !== null && touchEndX !== null) {
      const distance = touchEndX - touchStartX
      if (distance > 50 && activePanel === 'results') {
        setActivePanel('input')
      } else if (distance < -50 && activePanel === 'input') {
        setActivePanel('results')
      }
    }
    setTouchStartX(null)
    setTouchEndX(null)
    setSwipeDelta(0)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Responsive Header Row for Input and Results */}
        <div className="hidden md:flex flex-row md:items-center md:justify-between mb-4 gap-2 md:gap-0">
          <div className="w-full md:w-1/2 pr-0 md:pr-6">
            <h2 className="text-lg font-semibold md:mb-0 mb-2">Validate BA List</h2>
          </div>
          <div className="w-full md:w-1/2 flex items-center justify-between md:justify-start md:pl-6 mt-0">
            <h2 className="text-lg font-semibold md:mb-0 mb-2">Validation Results</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebug((v) => !v)}
              className="ml-2 px-3 py-1 text-xs"
              aria-label={showDebug ? 'Hide Debug Output' : 'Show Debug Output'}
            >
              {showDebug ? 'Hide Debug' : 'Show Debug'}
            </Button>
          </div>
        </div>
        {/* Mobile slider: only show one panel at a time */}
        <div
          className="block md:hidden relative"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ minHeight: 400, width: '100%' }}
        >
          <div className="relative min-h-[400px] w-full">
            <div
              className={cn(
                'space-y-4 border-r-0 pr-0 w-full absolute inset-0 transition-opacity duration-200',
                activePanel === 'input' ? 'z-10 block opacity-100' : 'pointer-events-none hidden opacity-0'
              )}
              style={{
                transform: activePanel === 'input' || swipeDelta !== 0 ? `translateX(${activePanel === 'results' && swipeDelta === 0 ? '-100%' : swipeDelta}px)` : undefined,
                transition: touchStartX === null ? 'transform 0.2s' : 'none',
                opacity: swipeDelta !== 0 ? Math.max(0.7, 1 - Math.abs(swipeDelta) / 300) : 1,
              }}
            >
              <h2 className="text-lg font-semibold mb-2">Validate BA List</h2>
              <Textarea
                placeholder="Paste your BA list here..."
                value={inputText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                className="h-[300px] font-mono text-sm bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
                aria-label="Paste BA list"
              />
              <Button 
                onClick={handleValidate}
                disabled={isValidating || !inputText}
                className="w-full"
                aria-label="Validate BA List"
              >
                {isValidating ? 'Validating...' : 'Validate List'}
              </Button>
            </div>
            <div
              className={cn(
                'space-y-4 w-full absolute inset-0 transition-opacity duration-200',
                activePanel === 'results' ? 'z-10 block opacity-100' : 'pointer-events-none hidden opacity-0'
              )}
              style={{
                transform: activePanel === 'results' || swipeDelta !== 0 ? `translateX(${activePanel === 'input' && swipeDelta === 0 ? '100%' : swipeDelta}px)` : undefined,
                transition: touchStartX === null ? 'transform 0.2s' : 'none',
                opacity: swipeDelta !== 0 ? Math.max(0.7, 1 - Math.abs(swipeDelta) / 300) : 1,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Validation Results</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDebug((v) => !v)}
                  className="ml-2 px-3 py-1 text-xs"
                  aria-label={showDebug ? 'Hide Debug Output' : 'Show Debug Output'}
                >
                  {showDebug ? 'Hide Debug' : 'Show Debug'}
                </Button>
              </div>
              {showDebug && (
                <div className="mb-2 p-2 bg-gray-100 rounded text-xs text-gray-700 border border-gray-300">
                  <div className="font-bold mb-1">Parser Debug Output:</div>
                  {debugParsed.length === 0 ? (
                    <div>No sets parsed yet. Click 'Validate List' to see debug info.</div>
                  ) : (
                    <ul className="space-y-1">
                      {debugParsed.map((d, i) => (
                        <li key={i}>
                          <span className="font-mono">{d.location} - Set {d.setNumber} | Backplate: {d.backplateNumber} | Cylinder: {d.cylinderNumber}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-neutral-900 rounded-lg p-2 border border-gray-200 dark:border-neutral-700">
                {validationResults.length === 0 && (
                  <div className="text-gray-400 text-sm text-center py-8">No results yet. Paste your BA list and click Validate.</div>
                )}
                {validationResults.map((result, index) => (
                  <Card key={index} className={cn(
                    "border shadow-sm transition-all",
                    result.status === 'match' ? "border-green-200 bg-green-50 dark:bg-green-950" :
                    result.status === 'mismatch' ? "border-red-200 bg-red-50 dark:bg-red-950" :
                    "border-yellow-200 bg-yellow-50 dark:bg-yellow-950"
                  )}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        {result.status === 'match' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="font-semibold text-sm mb-0.5">{result.location} - Set {result.setNumber}</div>
                          <div className="text-xs text-gray-700 dark:text-gray-300">Backplate: <span className="font-mono">{result.backplateNumber}</span></div>
                          <div className="text-xs text-gray-700 dark:text-gray-300">Cylinder: <span className="font-mono">{result.cylinderNumber}</span></div>
                          {result.details && (
                            <div className="text-xs text-red-600 mt-1">{result.details}</div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          {/* Slider navigation arrows and dots */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActivePanel('input')}
              disabled={activePanel === 'input'}
              aria-label="Show Input Panel"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex gap-1">
              <span className={cn(
                'h-2 w-2 rounded-full',
                activePanel === 'input' ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300 dark:bg-gray-700'
              )} />
              <span className={cn(
                'h-2 w-2 rounded-full',
                activePanel === 'results' ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300 dark:bg-gray-700'
              )} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActivePanel('results')}
              disabled={activePanel === 'results'}
              aria-label="Show Results Panel"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {/* Desktop: side-by-side grid */}
        <div className="hidden md:grid grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4 border-r border-gray-200 pr-0 md:pr-6">
            <h2 className="text-lg font-semibold mb-2 md:hidden">Validate BA List</h2>
            <Textarea
              placeholder="Paste your BA list here..."
              value={inputText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
              className="h-[300px] md:h-[500px] font-mono text-sm bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-700"
              aria-label="Paste BA list"
            />
            <Button 
              onClick={handleValidate}
              disabled={isValidating || !inputText}
              className="w-full"
              aria-label="Validate BA List"
            >
              {isValidating ? 'Validating...' : 'Validate List'}
            </Button>
            {/* Mobile: Results header and debug toggle below input */}
            <div className="block md:hidden mt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Validation Results</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDebug((v) => !v)}
                  className="ml-2 px-3 py-1 text-xs"
                  aria-label={showDebug ? 'Hide Debug Output' : 'Show Debug Output'}
                >
                  {showDebug ? 'Hide Debug' : 'Show Debug'}
                </Button>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            {/* Desktop: Results header and debug toggle */}
            {/* Already handled above for md+ */}
            {/* Debug Output */}
            {showDebug && (
              <div className="mb-2 p-2 bg-gray-100 rounded text-xs text-gray-700 border border-gray-300">
                <div className="font-bold mb-1">Parser Debug Output:</div>
                {debugParsed.length === 0 ? (
                  <div>No sets parsed yet. Click 'Validate List' to see debug info.</div>
                ) : (
                  <ul className="space-y-1">
                    {debugParsed.map((d, i) => (
                      <li key={i}>
                        <span className="font-mono">{d.location} - Set {d.setNumber} | Backplate: {d.backplateNumber} | Cylinder: {d.cylinderNumber}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="space-y-2 max-h-[500px] overflow-y-auto bg-gray-50 dark:bg-neutral-900 rounded-lg p-2 border border-gray-200 dark:border-neutral-700">
              {validationResults.length === 0 && (
                <div className="text-gray-400 text-sm text-center py-8">No results yet. Paste your BA list and click Validate.</div>
              )}
              {validationResults.map((result, index) => (
                <Card key={index} className={cn(
                  "border shadow-sm transition-all",
                  result.status === 'match' ? "border-green-200 bg-green-50 dark:bg-green-950" :
                  result.status === 'mismatch' ? "border-red-200 bg-red-50 dark:bg-red-950" :
                  "border-yellow-200 bg-yellow-50 dark:bg-yellow-950"
                )}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      {result.status === 'match' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="font-semibold text-sm mb-0.5">{result.location} - Set {result.setNumber}</div>
                        <div className="text-xs text-gray-700 dark:text-gray-300">Backplate: <span className="font-mono">{result.backplateNumber}</span></div>
                        <div className="text-xs text-gray-700 dark:text-gray-300">Cylinder: <span className="font-mono">{result.cylinderNumber}</span></div>
                        {result.details && (
                          <div className="text-xs text-red-600 mt-1">{result.details}</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 