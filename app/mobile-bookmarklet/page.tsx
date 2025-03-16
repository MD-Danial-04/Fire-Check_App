'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Bookmark, Copy, CheckCircle2, ArrowLeft, Share2, ExternalLink, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function MobileBookmarklet() {
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState(1)
  const [isSafari, setIsSafari] = useState(false)

  // Check if we're on Safari or iOS
  useState(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent;
      const isSafariOrIOS = /Safari/.test(ua) && !/Chrome/.test(ua) || /iPhone|iPad|iPod/.test(ua);
      setIsSafari(isSafariOrIOS);
    }
  });

  // The original bookmarklet code
  const originalBookmarkletCode = `javascript:(function(){var t=document.body.innerText,e=t.match(/Response ID:?\\s*([a-zA-Z0-9]+)/i)||t.match(/([a-f0-9]{24,32})/i),n="";try{var r=window.location.href;if(r.includes("form.gov.sg")){var a=new URLSearchParams(window.location.search);if(a.has("6502c44bde2cb10011b4d19e"))n=decodeURIComponent(a.get("6502c44bde2cb10011b4d19e").replace(/\\+/g," "));else{var o=["name","person","personnel"];for(var i=0;i<o.length;i++){var s=o[i];if(a.has(s)){n=decodeURIComponent(a.get(s).replace(/\\+/g," "));break}}}}else n=document.title.split(" - ")[0]||""}catch(t){console.error("Error extracting name:",t)}if(e&&e[1]){var l=e[1],c=document.createElement("div");c.id="form-response-helper";c.style.cssText="position:fixed;top:20px;right:20px;padding:15px;background:#f0f8ff;border:1px solid #007bff;border-radius:5px;z-index:9999;box-shadow:0 4px 8px rgba(0,0,0,0.1);font-family:system-ui,-apple-system,sans-serif;transition:all 0.3s ease;";c.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;color:#007bff;font-size:16px;font-weight:600;">Response ID Captured</h3><div><button id="minimizeHelper" style="background:none;border:none;color:#007bff;cursor:pointer;font-size:16px;margin-right:5px;padding:0;line-height:1;" title="Minimize">_</button><button id="closeHelper" style="background:none;border:none;color:#007bff;cursor:pointer;font-size:16px;padding:0;line-height:1;" title="Close">×</button></div></div><div id="helperContent"><div style="font-family:monospace;font-size:16px;padding:8px;background:#e6f2ff;border-radius:3px;margin-bottom:10px;word-break:break-all;">'+l+'</div><div style="font-size:14px;margin-bottom:8px;color:#555;">Person: '+(n||"Not detected")+'</div><button id="copyId" style="background:#007bff;color:white;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%;margin-bottom:8px;font-family:inherit;">Copy Response ID</button><button id="submitDirectly" style="background:#ff7f00;color:white;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%;margin-bottom:8px;font-family:inherit;">Submit via Relay Page</button><button id="returnToApp" style="background:#28a745;color:white;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%;margin-bottom:8px;font-family:inherit;">Return to App with ID</button><div id="statusMessages"></div></div>';document.body.appendChild(c);document.getElementById("minimizeHelper").onclick=function(){var content=document.getElementById("helperContent");if(content.style.display==="none"){content.style.display="block";this.textContent="_";this.title="Minimize";}else{content.style.display="none";this.textContent="□";this.title="Restore";}};document.getElementById("closeHelper").onclick=function(){document.body.removeChild(document.getElementById("form-response-helper"));};document.getElementById("copyId").onclick=function(){navigator.clipboard.writeText(l).then(function(){document.getElementById("copyId").textContent="Copied!";setTimeout(function(){document.getElementById("copyId").textContent="Copy Response ID"},2e3)})};document.getElementById("submitDirectly").onclick=function(){var targetOrigin="https://fire-check-app.vercel.app";window.open(targetOrigin+"/relay-submission?responseId="+l+"&personName="+encodeURIComponent(n),"_blank")};document.getElementById("returnToApp").onclick=function(){var targetOrigin="https://fire-check-app.vercel.app";window.open(targetOrigin+"/ppe-check?responseId="+l+"&personName="+encodeURIComponent(n),"_blank")}}else alert("No Response ID found on this page. Please make sure you're on a form submission confirmation page.")})();`

  // Safari-compatible bookmarklet code (simplified)
  const safariBookmarkletCode = `javascript:(function(){var t=document.body.innerText;var e=t.match(/Response ID:?\\s*([a-zA-Z0-9]+)/i)||t.match(/([a-f0-9]{24,32})/i);var n="";try{var r=window.location.href;if(r.includes("form.gov.sg")){var a=new URLSearchParams(window.location.search);if(a.has("6502c44bde2cb10011b4d19e")){n=decodeURIComponent(a.get("6502c44bde2cb10011b4d19e").replace(/\\+/g," "));}else{var o=["name","person","personnel"];for(var i=0;i<o.length;i++){var s=o[i];if(a.has(s)){n=decodeURIComponent(a.get(s).replace(/\\+/g," "));break;}}}}else{n=document.title.split(" - ")[0]||"";}}catch(err){console.error("Error extracting name:",err);}if(e&&e[1]){var responseId=e[1];var targetOrigin="https://fire-check-app.vercel.app";var url=targetOrigin+"/relay-submission?responseId="+responseId+"&personName="+encodeURIComponent(n);window.location.href=url;}else{alert("No Response ID found on this page. Please make sure you're on a form submission confirmation page.");}})();`

  // Choose the appropriate bookmarklet code based on browser
  const bookmarkletCode = isSafari ? safariBookmarkletCode : originalBookmarkletCode;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(bookmarkletCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Function to open a test page with a valid response ID
  const openTestPage = () => {
    const testPageHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SGT1 Danial - Form Submission</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; padding: 1rem; max-width: 800px; margin: 0 auto; }
          .container { border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; }
          .success-icon { color: green; font-size: 3rem; text-align: center; margin-bottom: 1rem; }
          .response-id { font-family: monospace; background: #f5f5f5; padding: 0.5rem; border-radius: 4px; margin: 1rem 0; word-break: break-all; }
          h1 { color: #333; font-size: 1.5rem; }
          p { color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✓</div>
          <h1>Thank you for filling out the form.</h1>
          <p>Your submission has been received successfully.</p>
          <p>Response ID: <span class="response-id">65031149356d470012810f7f</span></p>
          <p>Please use the Form Response Helper bookmarklet to capture this ID.</p>
          <p><small>This is a test page to demonstrate the bookmarklet functionality.</small></p>
        </div>
      </body>
      </html>
    `;
    
    const testWindow = window.open('', '_blank');
    if (testWindow) {
      testWindow.document.write(testPageHtml);
      testWindow.document.close();
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Form Response Helper Bookmarklet',
          text: 'Add this bookmarklet to capture form response IDs',
          url: 'javascript:' + bookmarkletCode
        })
      } else {
        handleCopyCode()
      }
    } catch (error) {
      console.error('Error sharing:', error)
      handleCopyCode()
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mb-4">
        <Link href="/ppe-check" passHref>
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to PPE Check
          </Button>
        </Link>
      </div>
      
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-100 dark:border-amber-800/50">
          <div className="flex items-center gap-2">
            <div className="bg-amber-100 dark:bg-amber-800/50 p-1.5 rounded-full">
              <Bookmark className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-lg font-medium text-amber-800 dark:text-amber-300">
              Mobile Bookmarklet Setup
            </CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 pb-4 space-y-6">
          {isSafari && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/30 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-blue-700 dark:text-blue-300">Safari/iOS Detected</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    We've provided a simplified version of the bookmarklet that works better with Safari and iOS devices.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-medium">Step 1: Add to Bookmarks</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isSafari 
                  ? "On Safari, you'll need to manually add this bookmarklet to your bookmarks."
                  : "On mobile Chrome, you'll need to manually add this bookmarklet to your bookmarks."}
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/30 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 dark:bg-blue-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">1</span>
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    Copy the bookmarklet code using the button below
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`w-full text-xs h-10 flex items-center justify-center gap-1.5 ${
                    copied 
                      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50" 
                      : "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-800/50"
                  }`}
                  onClick={handleCopyCode}
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Bookmarklet Code
                    </>
                  )}
                </Button>
                
                {isSafari ? (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 dark:bg-blue-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">2</span>
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        Tap the share icon at the bottom of Safari, then select "Add to Bookmarks"
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 dark:bg-blue-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">3</span>
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        Name it "Form Response Helper", save it, then edit the bookmark and replace the URL with the code you copied
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 dark:bg-blue-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">2</span>
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        Tap the three dots menu in Chrome, then select "Bookmarks" → "Add bookmark"
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 dark:bg-blue-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">3</span>
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        Name it "Form Response Helper" and paste the code you copied in the URL field
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs mb-2">Or click this button to test it directly:</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-10 bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50 dark:hover:bg-green-800/50 flex items-center justify-center gap-2"
                  onClick={() => {
                    // Create a temporary link and click it
                    const tempLink = document.createElement('a');
                    tempLink.href = bookmarkletCode;
                    document.body.appendChild(tempLink);
                    tempLink.click();
                    document.body.removeChild(tempLink);
                  }}
                >
                  Test Bookmarklet Now
                </Button>
                
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-10 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-800/50 flex items-center justify-center gap-2"
                    onClick={openTestPage}
                  >
                    Open Test Page
                  </Button>
                  <p className="text-xs mt-1 text-gray-500 text-center">
                    Opens a sample form confirmation page to test the bookmarklet
                  </p>
                </div>
              </div>
              
              <Button 
                className="w-full mt-4"
                onClick={() => setStep(2)}
              >
                Next: How to Use
              </Button>
            </div>
          )}
          
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-base font-medium">Step 2: Using the Bookmarklet</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                After submitting a form, follow these steps to capture the Response ID:
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-100 dark:bg-amber-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">1</span>
                  </div>
                  <div className="text-sm">
                    When you see the form confirmation page with a Response ID, tap in the address bar
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="bg-amber-100 dark:bg-amber-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">2</span>
                  </div>
                  <div className="text-sm">
                    {isSafari 
                      ? "Start typing 'Form' and select the 'Form Response Helper' bookmark"
                      : "Type the first few letters of 'Form' and select the 'Form Response Helper' bookmark"}
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="bg-amber-100 dark:bg-amber-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">3</span>
                  </div>
                  <div className="text-sm">
                    {isSafari 
                      ? "The bookmarklet will run and automatically redirect you to the relay submission page"
                      : "The bookmarklet will run and capture the Response ID automatically"}
                  </div>
                </div>
                
                {!isSafari && (
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 dark:bg-amber-800/50 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">4</span>
                    </div>
                    <div className="text-sm">
                      Tap "Submit via Relay Page" or "Return to App with ID" to save the Response ID
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mt-4">
                <h4 className="text-sm font-medium mb-2">Alternative Method</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  If you're having trouble with the bookmarklet, you can also:
                </p>
                <ol className="text-xs space-y-2 pl-5 list-decimal">
                  <li>Copy the Response ID manually from the form confirmation page</li>
                  <li>Return to the PPE Check page</li>
                  <li>Tap "Submit ID" for the person</li>
                  <li>Paste the Response ID in the dialog</li>
                </ol>
              </div>
              
              <div className="flex gap-3 mt-4">
                <Button 
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => setStep(3)}
                >
                  Next: Test It
                </Button>
              </div>
            </div>
          )}
          
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-base font-medium">Step 3: Test the Bookmarklet</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You can test your bookmarklet on a sample form confirmation page:
              </p>
              
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-10 bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50 dark:hover:bg-green-800/50 flex items-center justify-center gap-2"
                  onClick={() => {
                    // Create a temporary link and click it
                    const tempLink = document.createElement('a');
                    tempLink.href = bookmarkletCode;
                    document.body.appendChild(tempLink);
                    tempLink.click();
                    document.body.removeChild(tempLink);
                  }}
                >
                  Test Bookmarklet Now
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-10 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-800/50 flex items-center justify-center gap-2"
                  onClick={openTestPage}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Test Page
                </Button>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                The test page contains a sample Response ID (65031149356d470012810f7f) that you can capture with your bookmarklet.
              </p>
              
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800/30 mt-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  Need to share this bookmarklet with others?
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-10 bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50 dark:hover:bg-amber-800/50 flex items-center justify-center gap-2"
                  onClick={handleShare}
                >
                  <Share2 className="h-4 w-4" />
                  Share This Setup Guide
                </Button>
              </div>
              
              <div className="flex gap-3 mt-4">
                <Button 
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(2)}
                >
                  Back
                </Button>
                <Button 
                  className="flex-1"
                  asChild
                >
                  <Link href="/ppe-check">
                    Finish
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 