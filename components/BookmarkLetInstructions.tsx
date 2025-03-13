// components/BookmarkletInstructions.tsx
import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bookmark, ChevronDown, ChevronUp, Copy, X, Info, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import Link from 'next/link';

export default function BookmarkletInstructions() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  // Check if we're on mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    // Initial check
    checkIfMobile();
    
    // Add event listener
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const bookmarkletCode = `javascript:(function(){var t=document.body.innerText,e=t.match(/Response ID:?\\s*([a-zA-Z0-9]+)/i)||t.match(/([a-f0-9]{24,32})/i),n="";try{var r=window.location.href;if(r.includes("form.gov.sg")){var a=new URLSearchParams(window.location.search);if(a.has("6502c44bde2cb10011b4d19e"))n=decodeURIComponent(a.get("6502c44bde2cb10011b4d19e").replace(/\\+/g," "));else{var o=["name","person","personnel"];for(var i=0;i<o.length;i++){var s=o[i];if(a.has(s)){n=decodeURIComponent(a.get(s).replace(/\\+/g," "));break}}}}else n=document.title.split(" - ")[0]||""}catch(t){console.error("Error extracting name:",t)}if(e&&e[1]){var l=e[1],c=document.createElement("div");c.id="form-response-helper";c.style.cssText="position:fixed;top:20px;right:20px;padding:15px;background:#f0f8ff;border:1px solid #007bff;border-radius:5px;z-index:9999;box-shadow:0 4px 8px rgba(0,0,0,0.1);font-family:system-ui,-apple-system,sans-serif;transition:all 0.3s ease;";c.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;color:#007bff;font-size:16px;font-weight:600;">Response ID Captured</h3><div><button id="minimizeHelper" style="background:none;border:none;color:#007bff;cursor:pointer;font-size:16px;margin-right:5px;padding:0;line-height:1;" title="Minimize">_</button><button id="closeHelper" style="background:none;border:none;color:#007bff;cursor:pointer;font-size:16px;padding:0;line-height:1;" title="Close">×</button></div></div><div id="helperContent"><div style="font-family:monospace;font-size:16px;padding:8px;background:#e6f2ff;border-radius:3px;margin-bottom:10px;word-break:break-all;">'+l+'</div><div style="font-size:14px;margin-bottom:8px;color:#555;">Person: '+(n||"Not detected")+'</div><button id="copyId" style="background:#007bff;color:white;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%;margin-bottom:8px;font-family:inherit;">Copy Response ID</button><button id="submitDirectly" style="background:#ff7f00;color:white;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%;margin-bottom:8px;font-family:inherit;">Submit via Relay Page</button><button id="returnToApp" style="background:#28a745;color:white;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%;margin-bottom:8px;font-family:inherit;">Return to App with ID</button><div id="statusMessages"></div></div>';document.body.appendChild(c);document.getElementById("minimizeHelper").onclick=function(){var content=document.getElementById("helperContent");if(content.style.display==="none"){content.style.display="block";this.textContent="_";this.title="Minimize";}else{content.style.display="none";this.textContent="□";this.title="Restore";}};document.getElementById("closeHelper").onclick=function(){document.body.removeChild(document.getElementById("form-response-helper"));};document.getElementById("copyId").onclick=function(){navigator.clipboard.writeText(l).then(function(){document.getElementById("copyId").textContent="Copied!";setTimeout(function(){document.getElementById("copyId").textContent="Copy Response ID"},2e3)})};document.getElementById("submitDirectly").onclick=function(){var targetOrigin="https://fire-check-app.vercel.app";window.open(targetOrigin+"/relay-submission?responseId="+l+"&personName="+encodeURIComponent(n),"_blank")};document.getElementById("returnToApp").onclick=function(){var targetOrigin="https://fire-check-app.vercel.app";window.open(targetOrigin+"/ppe-check?responseId="+l+"&personName="+encodeURIComponent(n),"_blank")}}else alert("No Response ID found on this page. Please make sure you're on a form submission confirmation page.")})();`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Firefox drag events
  const handleDragStart = (e: React.DragEvent<HTMLAnchorElement>) => {
    // Set the drag data for Firefox
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/uri-list', bookmarkletCode);
      e.dataTransfer.setData('text/plain', bookmarkletCode);
      e.dataTransfer.effectAllowed = 'copy';
    }
  };

  // Function to open a test page
  const openTestPage = () => {
    const testPageHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SGT1 Danial - Form Submission</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; padding: 2rem; max-width: 800px; margin: 0 auto; }
          .container { border: 1px solid #ddd; border-radius: 8px; padding: 2rem; }
          .success-icon { color: green; font-size: 3rem; text-align: center; margin-bottom: 1rem; }
          .response-id { font-family: monospace; background: #f5f5f5; padding: 0.5rem; border-radius: 4px; margin: 1rem 0; }
          h1 { color: #333; }
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

  if (!isVisible) {
    return (
      <Button 
        variant="outline" 
        className="fixed bottom-4 right-4 z-50 shadow-md bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => setIsVisible(true)}
      >
        <Bookmark className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
        Form Helper
      </Button>
    );
  }

  // If on mobile, show a simplified card with a link to the mobile setup page
  if (isMobile) {
    return (
      <Card className="relative border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-800/50 shadow-sm">
        <div className="absolute right-2 top-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-100/70 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-full"
            onClick={() => setIsVisible(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-amber-100 dark:bg-amber-800/50 p-1.5 rounded-full">
              <Bookmark className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-medium text-amber-800 dark:text-amber-300">Form Response Helper</h3>
          </div>
          
          <div className="bg-amber-100/70 dark:bg-amber-900/30 rounded-lg p-3 border border-amber-200 dark:border-amber-800/50 mb-4">
            <div className="flex gap-2">
              <Smartphone className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-amber-800 dark:text-amber-300">Mobile Device Detected</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  We've created a special guide for mobile users
                </p>
              </div>
            </div>
          </div>
          
          <Link href="/mobile-bookmarklet" passHref>
            <Button className="w-full">
              Open Mobile Setup Guide
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Detect if browser is Firefox
  const isFirefox = typeof window !== 'undefined' && navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

  return (
    <Card className="relative border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-800/50 shadow-sm">
      <div className="absolute right-2 top-2 flex gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-100/70 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-full"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-100/70 dark:text-amber-400 dark:hover:bg-amber-900/50 rounded-full"
          onClick={() => setIsVisible(false)}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-amber-100 dark:bg-amber-800/50 p-1.5 rounded-full">
            <Bookmark className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="font-medium text-amber-800 dark:text-amber-300">Form Response Helper</h3>
        </div>
        
        {!isExpanded ? (
          <div className="flex items-center gap-2 mt-2 text-sm text-amber-700 dark:text-amber-300">
            <Info className="h-4 w-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
            <p>Click to expand instructions for capturing form response IDs</p>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="bg-amber-100/70 dark:bg-amber-900/30 rounded-lg p-3 border border-amber-200 dark:border-amber-800/50">
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-amber-800 dark:text-amber-300">One-time setup required</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Add this bookmarklet to your browser to easily capture response IDs
                  </p>
                </div>
              </div>
            </div>
            
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <ol className="list-decimal pl-5 space-y-4">
                <li>
                  <p className="font-medium mb-1.5">Add the Form Helper to your bookmarks</p>
                  <div className="bg-white/80 dark:bg-gray-800/50 rounded-md p-3 border border-amber-200/70 dark:border-amber-800/30">
                    {isFirefox ? (
                      <>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-100 dark:border-blue-800/30 mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-blue-700 dark:text-blue-300">
                              <p className="font-medium">Firefox users:</p>
                              <ol className="list-decimal pl-4 mt-1 space-y-1">
                                <li>Copy the bookmarklet code using the button below</li>
                                <li>Right-click on your bookmarks toolbar</li>
                                <li>Select "New Bookmark"</li>
                                <li>Name it "Form Response Helper"</li>
                                <li>Paste the code in the "Location" field</li>
                                <li>Click "Add"</li>
                              </ol>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className={`text-xs h-8 w-full flex items-center justify-center gap-1.5 mb-2 ${
                            copied 
                              ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50" 
                              : "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-800/50"
                          }`}
                          onClick={handleCopyCode}
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Copied to Clipboard!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy Bookmarklet Code
                            </>
                          )}
                        </Button>
                        
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs mb-2">Or click this button to test it directly:</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-8 bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50 dark:hover:bg-green-800/50"
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
                              className="w-full text-xs h-8 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-800/50"
                              onClick={openTestPage}
                            >
                              Open Test Page
                            </Button>
                            <p className="text-xs mt-1 text-gray-500">
                              Opens a sample form confirmation page to test the bookmarklet
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs mb-2">Drag this button to your bookmarks bar:</p>
                        <div className="flex items-center gap-2 mb-2">
                          <a 
                            ref={bookmarkRef}
                            href={bookmarkletCode}
                            className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                            draggable="true"
                            onDragStart={handleDragStart}
                            onClick={(e) => e.preventDefault()}
                          >
                            <Bookmark className="h-3.5 w-3.5 mr-1.5" />
                            Form Response Helper
                          </a>
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            ← Drag to your bookmarks bar
                          </span>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs mb-2">Or click this button to test it directly:</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-8 bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50 dark:hover:bg-green-800/50"
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
                              className="w-full text-xs h-8 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-800/50"
                              onClick={openTestPage}
                            >
                              Open Test Page
                            </Button>
                            <p className="text-xs mt-1 text-gray-500">
                              Opens a sample form confirmation page to test the bookmarklet
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      If you can't see your bookmarks bar, press {isFirefox ? "Ctrl+Shift+B" : "Ctrl+Shift+B (Windows/Chrome) or Cmd+Shift+B (Mac)"}
                    </p>
                  </div>
                </li>
                
                <li>
                  <p className="font-medium mb-1.5">Using the Form Helper</p>
                  <div className="bg-white/80 dark:bg-gray-800/50 rounded-md p-3 border border-amber-200/70 dark:border-amber-800/30">
                    <ol className="list-decimal pl-4 space-y-2">
                      <li className="text-xs flex items-start gap-2">
                        <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                        <span>After submitting the form, you'll see the confirmation page with a Response ID</span>
                      </li>
                      <li className="text-xs flex items-start gap-2">
                        <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                        <span>Click the "Form Response Helper" bookmark in your bookmarks bar</span>
                      </li>
                      <li className="text-xs flex items-start gap-2">
                        <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                        <span>A blue box will appear with the Response ID and three buttons</span>
                      </li>
                      <li className="text-xs flex items-start gap-2">
                        <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                        <span>Click "Submit via Relay Page" to save the ID through a secure relay page, or "Return to App with ID" to go back to the app</span>
                      </li>
                    </ol>
                  </div>
                </li>
                
                <li>
                  <p className="font-medium mb-1.5">Alternative: Manual Entry</p>
                  <p className="text-xs ml-1">
                    If the bookmarklet doesn't work, you can always copy the Response ID manually and click the "Submit ID" button for the person
                  </p>
                </li>
              </ol>
            </div>
            
            {!isFirefox && (
              <Button 
                variant="outline" 
                size="sm" 
                className={`text-xs h-8 flex items-center gap-1.5 ${
                  copied 
                    ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50" 
                    : "bg-amber-100/70 text-amber-700 border-amber-300 hover:bg-amber-200/70 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50 dark:hover:bg-amber-800/50"
                }`}
                onClick={handleCopyCode}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Bookmarklet Code
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}