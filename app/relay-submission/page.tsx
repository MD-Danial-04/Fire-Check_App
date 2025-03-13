'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

// Create a client component that uses useSearchParams
function RelaySubmissionClient() {
  const searchParams = useSearchParams()
  const responseId = searchParams.get('responseId')
  const personName = searchParams.get('personName')
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  
  useEffect(() => {
    if (!responseId) {
      setStatus('error')
      setMessage('No response ID provided')
      return
    }
    
    const submitResponse = async () => {
      try {
        const response = await fetch('/api/submit-response', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            responseId,
            personName: personName || 'Unknown',
          }),
        })
        
        const data = await response.json()
        
        if (data.success) {
          setStatus('success')
          setMessage(data.message || 'Response ID submitted successfully')
        } else {
          setStatus('error')
          setMessage(data.message || 'Failed to submit response ID')
        }
      } catch (error) {
        console.error('Error submitting response:', error)
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'An unexpected error occurred')
      }
    }
    
    submitResponse()
  }, [responseId, personName])
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-center">
            {status === 'loading' ? 'Submitting Response ID...' : 
             status === 'success' ? 'Submission Successful' : 'Submission Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center space-y-4">
            {status === 'loading' && (
              <div className="flex flex-col items-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  Submitting response ID for {personName || 'Unknown'}...
                </p>
              </div>
            )}
            
            {status === 'success' && (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                  <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center space-y-2">
                  <p className="font-medium">Response ID submitted successfully!</p>
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm break-all">
                    {responseId}
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    The response ID has been saved for {personName || 'Unknown'}.
                  </p>
                </div>
              </div>
            )}
            
            {status === 'error' && (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full">
                  <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-center space-y-2">
                  <p className="font-medium">Failed to submit response ID</p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{message}</p>
                  {responseId && (
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm break-all">
                      {responseId}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link href="https://fire-check-app.vercel.app/ppe-check" passHref>
            <Button className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Return to PPE Check
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

// Export the page component with Suspense boundary
export default function RelaySubmission() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <RelaySubmissionClient />
    </Suspense>
  );
} 