"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import { analyzeScreenshot } from "./openai";
import { supabase } from "@/utils/supabase";
import { Upload, ArrowDown } from "lucide-react";
import Script from "next/script";
import { loadStripe } from '@stripe/stripe-js';
import TinderCard from 'react-tinder-card';
import { ANONYMOUS_USAGE_LIMIT } from './constants';
import { useRouter } from 'next/navigation';

// Make sure to call `loadStripe` outside of a component's render
const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY);

// Overlay component for Google Sign-In (unchanged)
function GoogleSignInOverlay({ googleLoaded }) {
  const overlayButtonRef = useRef(null);

  useEffect(() => {
    if (googleLoaded && window.google && overlayButtonRef.current) {
      overlayButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(overlayButtonRef.current, {
        theme: "outline",
        size: "large",
      });
    }
  }, [googleLoaded]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white p-4 sm:p-8 rounded-xl w-full max-w-sm mx-auto flex flex-col items-center">
        <div ref={overlayButtonRef}></div>
        <p className="mt-4 text-center text-sm sm:text-base">
          Please sign in with Google to view your saved responses/generate more.
        </p>
      </div>
    </div>
  );
}

// Add this new component near the top of the file, after other component definitions
function ResponseOverlay({ responses, onClose, childRefs, currentIndex, swiped, outOfFrame, onGenerateMore, isGenerating, isSignedIn, router, setUsageCount }) {
  const handleSavedResponsesClick = () => {
    if (isSignedIn) {
      router.push('/saved');
    } else {
      // Close the response overlay and show the sign-in overlay
      onClose();
      // This will trigger the sign-in overlay since we're setting count above limit
      setUsageCount(ANONYMOUS_USAGE_LIMIT + 1);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!responses.length) return;
      
      if (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd') {
        e.preventDefault();
        
        const direction = e.key.toLowerCase() === 'a' ? 'left' : 'right';
        if (childRefs[currentIndex]?.current) {
          childRefs[currentIndex].current.swipe(direction);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [responses, currentIndex, childRefs]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-pink-500/10 via-black/50 to-gray-900/50 backdrop-blur-sm z-50 flex flex-col items-center">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-sm p-3 sm:p-4 flex justify-between items-center w-full border-b border-pink-100">
        <div className="text-base sm:text-lg font-bold mx-auto" style={{ color: "#FE3C72" }}>
          Your Suggestions ✨
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-3 sm:right-4"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Instructions with Saved Responses Button */}
      <div className="bg-white px-3 sm:px-4 pb-3 sm:pb-4 text-center w-full">
        <div className="flex flex-col items-center space-y-2 sm:space-y-3">
          <div className="inline-block bg-gray-100 rounded-full px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm shadow-sm">
            <span className="mr-2 sm:mr-3">👆 Swipe</span>
            <kbd className="mx-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-white rounded shadow text-xs">←</kbd> 
            <span className="mx-1 sm:mx-2 text-gray-500">Skip</span>
            <kbd className="mx-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-white rounded shadow text-xs">→</kbd> 
            <span className="mx-1 sm:mx-2 text-gray-500">Copy</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs sm:text-sm text-gray-500">
              {responses.length} suggested responses
            </div>
            <button
              onClick={handleSavedResponsesClick}
              className="text-xs sm:text-sm px-3 py-1 rounded-full text-white hover:opacity-90 transition"
              style={{ backgroundColor: "#FE3C72" }}
            >
              View Saved Responses
            </button>
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 w-full overflow-hidden flex items-center justify-center">
        <div className="cardContainer w-full max-w-[90vw] sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-xl mx-auto relative px-2 sm:px-4 h-[50vh] sm:h-[60vh] md:h-[65vh]">
          {responses.map((response, index) => (
            response && (
              <TinderCard
                className='swipe absolute w-full h-full'
                key={`${response}-${index}`}
                onSwipe={(dir) => swiped(dir, response)}
                onCardLeftScreen={() => outOfFrame(response)}
                preventSwipe={["up", "down"]}
                ref={childRefs[index]}
              >
                <div className='card rounded-xl sm:rounded-2xl shadow-lg w-full h-full p-3 sm:p-4 md:p-6 flex flex-col justify-center items-center' style={{ backgroundColor: "#FE3C72" }}>
                  <div className='card-content bg-white/90 text-base sm:text-lg md:text-xl text-center font-medium text-gray-800 w-full max-w-[95%] mx-auto rounded-lg sm:rounded-xl shadow-sm p-4 sm:p-6'>
                    {response}
                  </div>
                  <div className="absolute bottom-2 left-0 right-0 text-center text-white text-xs sm:text-sm opacity-75">
                    Swipe ← to Skip • Swipe → to Copy
                  </div>
                </div>
              </TinderCard>
            )
          )).filter(Boolean)}
        </div>

        {/* Need More Responses Popup - Only show when no cards are left */}
        {responses.length <= 1 && !isGenerating && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 m-4 max-w-sm w-full text-center">
              <h3 className="text-xl font-bold mb-4">Need more options?</h3>
              <p className="text-gray-600 mb-6">
                Generate 10 new responses to find the perfect reply!
              </p>
              <button
                onClick={onGenerateMore}
                disabled={isGenerating}
                className="w-full px-6 py-3 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#FE3C72" }}
              >
                {isGenerating ? (
                  <div className="flex items-center justify-center gap-2">
                    <span>Generating</span>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0s" }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                    </div>
                  </div>
                ) : (
                  "Generate More Responses ✨"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="bg-white/95 backdrop-blur-sm p-3 sm:p-4 w-full border-t border-pink-100">
        <div className="max-w-[85vw] sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-2xl mx-auto">
          <button
            onClick={() => {
              onClose();
              document.querySelector("#upload-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="w-full px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-medium border border-gray-200 hover:bg-gray-50 transition-colors text-sm sm:text-base"
          >
            Upload Another Screenshot
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState([]);
  const [mode, setMode] = useState("first-move");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [usageCount, setUsageCount] = useState(0);
  const [dailyCount, setDailyCount] = useState(0);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const googleButtonRef = useRef(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [context, setContext] = useState('');
  const [lastText, setLastText] = useState('');
  const [inputMode, setInputMode] = useState('screenshot');
  const [currentIndex, setCurrentIndex] = useState(responses.length - 1);
  const [lastDirection, setLastDirection] = useState();
  const currentIndexRef = useRef(currentIndex);
  const [showRegeneratePopup, setShowRegeneratePopup] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResponseOverlay, setShowResponseOverlay] = useState(false);
  const router = useRouter();

  const childRefs = useMemo(
    () =>
      Array(responses.length)
        .fill(0)
        .map(() => React.createRef()),
    [responses.length]
  );

  const updateCurrentIndex = (val) => {
    setCurrentIndex(val);
    currentIndexRef.current = val;
  };

  const canGoBack = currentIndex < responses.length - 1;
  const canSwipe = currentIndex >= 0;

  const swiped = async (direction, responseToDelete) => {
    try {
      if (!direction) {
        return;
      }

      // Save right swipes (copies) but don't navigate
      if (direction === 'right') {
        if (isSignedIn && user?.email) {
          // Save to database for signed in users
          await fetch('/api/saved-responses', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              response: responseToDelete,
              userEmail: user.email,
              context: context || null,
              lastMessage: lastText || null,
            }),
          });
        } else {
          // Save to localStorage for anonymous users
          const savedResponses = JSON.parse(localStorage.getItem('anonymous_saved_responses') || '[]');
          savedResponses.push({
            response: responseToDelete,
            context: context || null,
            lastMessage: lastText || null,
            created_at: new Date().toISOString(),
          });
          localStorage.setItem('anonymous_saved_responses', JSON.stringify(savedResponses));
        }
      }

      const response = await fetch('/api/swipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          direction,
          userEmail: isSignedIn ? user?.email : null 
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      
      setUsageCount(data.swipeCount);
      
      if (!isSignedIn && data.limitReached) {
        setTimeout(() => {
          setShowResponseOverlay(false);
        }, 500);
      }

      setResponses(prev => prev.filter(response => response !== responseToDelete));
      
    } catch (error) {
      console.error('Error in swiped function:', error);
    }
  };

  const outOfFrame = (response) => {
    setResponses(prev => prev.filter(r => r !== response));
    
    if (responses.length === 2 && !isGenerating) {
      setShowRegeneratePopup(true);
    }
  };

  const swipe = async (dir) => {
    if (canSwipe && currentIndex < responses.length) {
      await childRefs[currentIndex].current.swipe(dir);
    }
  };

  const goBack = async () => {
    if (!canGoBack) return;
    const newIndex = currentIndex + 1;
    updateCurrentIndex(newIndex);
    await childRefs[newIndex].current.restoreCard();
  };

  // Fetch usage count (DB code unchanged)
  const fetchUsageCount = async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (isSignedIn && user?.email) {
        headers['x-user-email'] = user.email;
      }
      
      const response = await fetch('/api/swipes', { headers });
      const data = await response.json();
      
      if (response.ok) {
        setUsageCount(data.swipeCount);
        return data;
      }
      
      throw new Error('Failed to fetch usage count');
    } catch (error) {
      console.error('Error fetching usage count:', error);
      return { swipeCount: 0, limitReached: false };
    }
  };

  // Check localStorage on initial load (unchanged)
  useEffect(() => {
    const storedUser = localStorage.getItem('smoothrizz_user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      setIsSignedIn(true);
    }
    const anonymousCount = parseInt(localStorage.getItem('smoothrizz_anonymous_count') || '0');
    if (!isSignedIn) {
      setUsageCount(anonymousCount);
    }
  }, []);

  // Update the handleSignIn function
  const handleSignIn = async (response) => {
    try {
      const { credential } = response;
      
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();
      
      if (res.ok) {
        setUser(data.user);
        setIsSignedIn(true);
        localStorage.setItem('smoothrizz_user', JSON.stringify(data.user));

        // Migrate anonymous saved responses to database
        const savedResponses = JSON.parse(localStorage.getItem('anonymous_saved_responses') || '[]');
        if (savedResponses.length > 0) {
          await Promise.all(
            savedResponses.map(async (item) => {
              await fetch('/api/saved-responses', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  response: item.response,
                  userEmail: data.user.email,
                  context: item.context,
                  lastMessage: item.lastMessage,
                  created_at: item.created_at,
                }),
              });
            })
          );
          // Clear localStorage after successful migration
          localStorage.removeItem('anonymous_saved_responses');
        }

        // Redirect to saved responses page after successful sign in
        router.push('/saved');
      } else {
        throw new Error(data.error || 'Failed to sign in');
      }
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  // Handle sign out (unchanged)
  const handleSignOut = async () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.revoke();
      
      fetch("/api/auth/google-client-id")
        .then((res) => res.json())
        .then(({ clientId }) => {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleSignIn,
            auto_select: false,
          });
          if (googleButtonRef.current) {
            googleButtonRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(googleButtonRef.current, {
              theme: "outline",
              size: "large",
            });
          }
        })
        .catch((err) => console.error("Error reinitializing Google Sign-In:", err));
    }
    
    setUser(null);
    setIsSignedIn(false);
    setResponses([]);
    
    const currentAnonymousCount = parseInt(localStorage.getItem('smoothrizz_anonymous_count') || '0');
    setUsageCount(currentAnonymousCount);
    setDailyCount(0);
    
    localStorage.removeItem('smoothrizz_user');
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setInputMode('screenshot');
      setContext('');
      setLastText('');
    }
  };

  const handlePaste = (event) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          setSelectedFile(file);
          setPreviewUrl(URL.createObjectURL(file));
          setInputMode('screenshot');
          setContext('');
          setLastText('');
          break;
        }
      }
    }
  };

  const handleTextInputChange = (type, value) => {
    if (type === 'context') {
      setContext(value);
    } else {
      setLastText(value);
    }
    
    if (value) {
      setInputMode('text');
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  // Update handleSubmit to reset responses
  const handleSubmit = async () => {
    if (!selectedFile && (!context || !lastText)) {
      alert("Please either upload a screenshot or provide conversation details");
      return;
    }

    try {
      setIsLoading(true);
      setShowRegeneratePopup(false);
      
      setResponses([]);
      
      const result = await analyzeScreenshot(selectedFile, mode, isSignedIn, context, lastText);

      setResponses(result);
      setCurrentIndex(result.length - 1);
      setShowResponseOverlay(true);

    } catch (error) {
      if (error.message.includes('usage limit')) {
        alert("You've reached the anonymous usage limit. Please sign in to continue.");
      } else {
        alert("Error analyzing input. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Update generateMoreResponses
  const generateMoreResponses = async () => {
    if (isGenerating) return;
    
    try {
      setIsGenerating(true);
      setShowRegeneratePopup(false);
      
      setResponses([]);
      
      const result = await analyzeScreenshot(selectedFile, mode, isSignedIn, context, lastText);
      
      setResponses(result);
      setCurrentIndex(result.length - 1);
      
    } catch (error) {
      if (error.message.includes('usage limit')) {
        setShowResponseOverlay(false);
      } else {
        alert("Error generating new responses. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Update the Google Sign-In initialization useEffect
  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (!document.getElementById("google-client-script")) {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.id = "google-client-script";
        script.onload = () => {
          fetch("/api/auth/google-client-id")
            .then((res) => res.json())
            .then(({ clientId }) => {
              window.google.accounts.id.initialize({
                client_id: clientId,
                callback: handleSignIn,
                auto_select: !isSignedIn,
              });
              if (googleButtonRef.current) {
                window.google.accounts.id.renderButton(googleButtonRef.current, {
                  theme: "outline",
                  size: "large",
                });
              }
              setGoogleLoaded(true);
            })
            .catch((err) =>
              console.error("Error fetching Google client ID:", err)
            );
        };
        document.body.appendChild(script);
      } else if (window.google) {
        fetch("/api/auth/google-client-id")
          .then((res) => res.json())
          .then(({ clientId }) => {
            window.google.accounts.id.initialize({
              client_id: clientId,
              callback: handleSignIn,
              auto_select: !isSignedIn,
            });
            if (googleButtonRef.current) {
              window.google.accounts.id.renderButton(googleButtonRef.current, {
                theme: "outline",
                size: "large",
              });
            }
            setGoogleLoaded(true);
          })
          .catch((err) =>
            console.error("Error reinitializing Google Sign-In:", err)
          );
      }
    };

    initializeGoogleSignIn();
  }, [isSignedIn]);

  useEffect(() => {
    if (isSignedIn && user?.email) {
      fetchUsageCount(user.email).then(({ totalCount, dailyCount }) => {
        setUsageCount(totalCount);
        setDailyCount(dailyCount);
      });
    }
  }, [isSignedIn, user]);

  // Handle Stripe checkout (unchanged)
  const handleCheckout = async () => {
    try {
      const response = await fetch('/api/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.error) {
        alert('Error creating checkout session');
        return;
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong with the checkout process.');
    }
  };

  // Handle redirect back from Stripe (unchanged)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    
    if (query.get('success')) {
      console.log('Order placed! You will receive an email confirmation.');
    }

    if (query.get('canceled')) {
      console.log('Order canceled -- continue to shop around and checkout when you\'re ready.');
    }
  }, []);

  // Conversation preview section (unchanged)
  const conversationPreview = (
    <div className="w-full max-w-lg mx-auto min-h-[200px] sm:min-h-[300px] bg-gray-100 rounded-xl p-4">
      {inputMode === 'screenshot' && previewUrl ? (
        <img 
          src={previewUrl} 
          alt="Preview of uploaded conversation" 
          className="w-full max-h-[400px] object-contain rounded-xl" 
          loading="lazy" 
        />
      ) : inputMode === 'text' && (context || lastText) ? (
        <div className="space-y-4">
          {context && (
            <div className="text-sm text-gray-500 italic mb-4">
              Context: {context}
            </div>
          )}
          {lastText && (
            <div className="flex justify-start">
              <div 
                className="bg-gray-200 rounded-2xl p-4 text-gray-800 max-w-[85%] relative"
              >
                {lastText}
                <div 
                  className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45 bg-gray-200"
                ></div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-gray-400">
          Your conversation will appear here
        </div>
      )}
    </div>
  );

  // Text input section (unchanged)
  const textInputSection = (
    <div className="mt-4 transition-all duration-300">
      <button
        onClick={() => setShowTextInput(!showTextInput)}
        className="w-full text-gray-600 py-2 flex items-center justify-center gap-2 hover:text-gray-900"
      >
        <span>{showTextInput ? "Hide" : "Show"} text input option</span>
        <svg
          className={`w-4 h-4 transform transition-transform ${showTextInput ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {showTextInput && (
        <div className="space-y-4 mt-4 p-4 border-2 border-dashed border-gray-300 rounded-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conversation Context
            </label>
            <textarea
              value={context}
              onChange={(e) => handleTextInputChange('context', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="Describe things to help context. Inside jokes, where you met, things they like etc..."
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Their Last Message 
            </label>
            <input
              type="text"
              value={lastText}
              onChange={(e) => handleTextInputChange('lastText', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="What was their last message?"
            />
          </div>
        </div>
      )}
    </div>
  );

  // Update the styles for cleaner cards
  const styles = `
    .swipe {
      position: absolute;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card {
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      transition: transform 0.2s ease;
      cursor: grab;
    }

    .card:active {
      cursor: grabbing;
    }

    .card-content {
      font-size: 1rem;
      line-height: 1.5;
      text-align: center;
      font-weight: 500;
      color: #1a1a1a;
      padding: 1rem 1.25rem;
      margin: 0 auto;
      width: 90%;
    }

    @media (min-width: 640px) {
      .card-content {
        font-size: 1.125rem;
        padding: 1.25rem 1.5rem;
      }
    }

    @media (min-width: 768px) {
      .card-content {
        font-size: 1.25rem;
        padding: 1.5rem 1.75rem;
      }
    }

    .swipe-indicator {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      padding: 0.5rem;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 0.75rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    .swipe-indicator.left {
      left: 0.75rem;
    }

    .swipe-indicator.right {
      right: 0.75rem;
    }

    .swipe-indicator .icon {
      font-size: 1rem;
      margin-bottom: 0.25rem;
    }

    .swipe-indicator .text {
      font-size: 0.75rem;
      font-weight: 500;
      color: #666;
    }

    .card:hover .swipe-indicator {
      opacity: 0.9;
    }

    .card-number {
      position: absolute;
      bottom: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      color: #666;
    }
  `;

  // Add this useEffect for cleanup
  useEffect(() => {
    const cleanup = () => {
      // Reset any stuck cards
      responses.forEach((_, index) => {
        if (childRefs[index].current) {
          childRefs[index].current.restoreCard();
        }
      });
    };

    // Cleanup on unmount or when responses change
    return cleanup;
  }, [responses]);

  // Update the handleMouseUp function to be more robust
  const handleMouseUp = (event) => {
    // Prevent any default browser behavior
    event.preventDefault();
    
    // Restore all cards that might be stuck
    responses.forEach((_, index) => {
      if (childRefs[index].current) {
        childRefs[index].current.restoreCard();
      }
    });
  };

  // Add these new event handlers
  const handleTouchStart = (event) => {
    // Prevent scrolling while swiping
    event.preventDefault();
  };

  const handleDragEnd = (event) => {
    // Prevent any default drag behavior
    event.preventDefault();
    handleMouseUp(event);
  };

  // Add the regenerate popup component
  const RegeneratePopup = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full mx-4">
        <h3 className="text-xl font-bold mb-4 text-center">Need more options?</h3>
        <p className="text-gray-600 mb-6 text-center">
          Generate 10 new responses to find the perfect reply!
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => setShowRegeneratePopup(false)}
            className="flex-1 px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={generateMoreResponses}
            disabled={isGenerating}
            className="flex-1 px-4 py-2 rounded-full text-white hover:opacity-90 transition"
            style={{ backgroundColor: "#FE3C72" }}
          >
            {isGenerating ? "Generating..." : "Generate More"}
          </button>
        </div>
      </div>
    </div>
  );

  // Add this to your useEffect for scrolling
  useEffect(() => {
    if (responses.length > 0) {
      document.querySelector("#responses-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [responses]);

  // Add this useEffect to fetch initial swipe count
  useEffect(() => {
    const fetchInitialCount = async () => {
      if (!isSignedIn) {
        try {
          const response = await fetch('/api/swipes');
          const data = await response.json();
          
          if (response.ok && !data.error) {
            setUsageCount(data.swipeCount);
          }
        } catch (error) {
          console.error('Error fetching initial swipe count:', error);
        }
      }
    };

    // Only fetch once on component mount
    fetchInitialCount();
  }, [isSignedIn]);

  return (
    <>
      <style jsx global>{styles}</style>

      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://accounts.google.com" />
        {/* Alternate/Hreflang */}
        <link rel="alternate" hrefLang="en" href="https://www.smoothrizz.com" />
        {/* Apple Touch Icon */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Updated SEO Meta Tags */}
        <title>SmoothRizz: Master Digital Charisma with AI Rizz App & Rizz Insights</title>
        <meta
          name="description"
          content="SmoothRizz is your ultimate destination to master AI-driven rizz techniques with the innovative AI Rizz App. Boost your digital charisma, improve conversation skills, and discover expert insights on Rizz App strategies."
        />
        <meta name="keywords" content="ai rizz, AI Rizz App, Rizz App, rizz, digital charisma, smooth talker, AI communication" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.smoothrizz.com" />

        <meta property="og:title" content="SmoothRizz: Master Digital Charisma with AI Rizz App & Rizz Insights" />
        <meta
          property="og:description"
          content="SmoothRizz is your ultimate destination to master AI-driven rizz techniques with our innovative AI Rizz App. Enhance your digital conversations and discover proven strategies for Rizz App success."
        />
        <meta property="og:url" content="https://www.smoothrizz.com" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.smoothrizz.com/your-image.jpg" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="SmoothRizz: Master Digital Charisma with AI Rizz App & Rizz Insights" />
        <meta
          name="twitter:description"
          content="SmoothRizz is your ultimate destination to master AI-driven rizz techniques with our innovative AI Rizz App. Boost your digital charisma and learn proven Rizz App strategies."
        />
        <meta name="twitter:image" content="https://www.smoothrizz.com/your-image.jpg" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "SmoothRizz",
              "url": "https://www.smoothrizz.com",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://www.smoothrizz.com/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "What is AI Rizz?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "AI Rizz is our innovative artificial intelligence solution designed to enhance digital communication by providing smart suggestions and insights."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How does the AI Rizz App work?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "The AI Rizz App uses advanced algorithms to analyze conversations and provide tailored suggestions that help improve your interaction style."
                  }
                }
              ]
            }),
          }}
        />
      </Head>

      <Script
        id="google-tag-manager"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-KMCKVJ4H');
          `,
        }}
      />

      <Script src="https://www.googletagmanager.com/gtag/js?id=G-FD93L95WFQ" strategy="afterInteractive" />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-FD93L95WFQ');
          `,
        }}
      />

      <div className="min-h-screen bg-white">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KMCKVJ4H"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>

        {/* Responsive Navigation */}
        <nav className="flex flex-col md:flex-row justify-between items-center p-4 md:p-6 lg:p-8">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#FE3C72" }}>
            SmoothRizz – Master Digital Charisma
          </h1>
          <div className="flex flex-col md:flex-row items-center gap-3 mt-4 md:mt-0">
            {!isSignedIn && <div ref={googleButtonRef} className="flex justify-center"></div>}
            {isSignedIn && (
              <button
                onClick={() => router.push('/saved')}
                className="px-4 py-2 rounded-full text-white hover:opacity-90 transition text-sm md:text-base font-medium"
                style={{ backgroundColor: "#FE3C72" }}
              >
                Saved Responses
              </button>
            )}
            {isSignedIn && (
              <button
                onClick={handleSignOut}
                className="px-4 py-2 rounded-full text-white hover:opacity-90 transition text-sm md:text-base font-medium"
                style={{ backgroundColor: "#121418" }}
              >
                Sign Out
              </button>
            )}
          </div>
        </nav>

        <main className="px-4 md:px-6 lg:px-8 max-w-7xl mx-auto">
          {/* Hero Section */}
          <section className="text-center mb-16 md:mb-24 relative">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight" style={{ color: "#121418" }}>
              It's Your Turn to be the<br />
              <span style={{ color: "#FE3C72" }} className="drop-shadow-sm">
                <i>Smooth</i> Talker
              </span>
            </h2>
            <p className="text-gray-600 text-lg md:text-xl mb-12 md:mb-16 max-w-2xl mx-auto">
              With The Smoothest AI Rizz on the Internet
            </p>
            <img
              src="/mainpic.png"
              alt="App demonstration of SmoothRizz"
              className="max-w-4xl w-full mx-auto"
              loading="lazy"
            />
            <button
              onClick={() => document.querySelector("#upload-section")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-8 px-8 py-4 rounded-full text-white font-bold shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: "#FE3C72" }}
            >
              Get Started <ArrowDown className="inline ml-2" size={20} />
            </button>
          </section>

          {/* Step Dividers and Input Sections */}
          <section className="space-y-16">
            {/* Step 1 */}
            <div className="relative">
              <div className="flex items-center mb-8">
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center">
                  <span className="text-2xl" style={{ color: "#FE3C72" }}>1</span>
                </div>
                <div className="ml-4">
                  <h2 className="text-2xl font-bold" style={{ color: "#121418" }}>
                    Share Your Conversation
                  </h2>
                  <p className="text-gray-600">Upload a screenshot or type out the conversation</p>
                </div>
              </div>
              
              <div id="upload-section" className="bg-gray-50 rounded-2xl p-8">
                <div className="max-w-md mx-auto">
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-white relative hover:border-pink-300 transition-colors">
                    <label className="flex flex-col items-center justify-center gap-2 cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                      <Upload className="text-gray-400" size={24} />
                      <span className="text-gray-600 text-center">
                        Upload or paste conversation Screenshot!
                      </span>
                      <span className="text-gray-400 text-sm">
                        Click to upload or Ctrl+V to paste
                      </span>
                    </label>
                    {selectedFile && (
                      <div
                        className="absolute top-2 right-2 px-3 py-1 rounded-full text-xs text-white"
                        style={{ backgroundColor: "#FE3C72" }}
                      >
                        File uploaded ✨
                      </div>
                    )}
                  </div>
                  {textInputSection}
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="flex items-center mb-8">
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center">
                  <span className="text-2xl" style={{ color: "#FE3C72" }}>2</span>
                </div>
                <div className="ml-4">
                  <h2 className="text-2xl font-bold" style={{ color: "#121418" }}>
                    Choose Your Stage
                  </h2>
                  <p className="text-gray-600">Select where you are in the conversation</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-8">
                <div className="max-w-md mx-auto">
                  <div
                    className="grid grid-cols-3 gap-4 p-4 rounded-2xl shadow-lg"
                    style={{ backgroundColor: "white" }}
                  >
                    {[
                      { name: "First Move", desc: "Nail that opener", emoji: "👋" },
                      { name: "Mid-Game", desc: "Keep it flowing", emoji: "💭" },
                      { name: "End Game", desc: "Bring it home", emoji: "🎯" },
                    ].map((phase) => {
                      const isSelected = mode === phase.name.toLowerCase().replace(" ", "-");
                      return (
                        <div
                          key={phase.name}
                          className={`rounded-xl p-4 text-center cursor-pointer hover:scale-[1.02] transition-all ${
                            isSelected 
                              ? "ring-4 ring-pink-400 ring-opacity-50 shadow-lg" 
                              : "hover:shadow-md"
                          }`}
                          style={{ 
                            backgroundColor: isSelected ? "#FE3C72" : "#f8f9fa",
                            color: isSelected ? "white" : "#121418"
                          }}
                          onClick={() => setMode(phase.name.toLowerCase().replace(" ", "-"))}
                        >
                          <span className="block text-2xl mb-2">{phase.emoji}</span>
                          <span className="block font-medium">{phase.name}</span>
                          <span className="block text-xs mt-1 opacity-75">{phase.desc}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 - Preview */}
            <div className="relative">
              <div className="flex items-center mb-8">
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center">
                  <span className="text-2xl" style={{ color: "#FE3C72" }}>3</span>
                </div>
                <div className="ml-4">
                  <h2 className="text-2xl font-bold" style={{ color: "#121418" }}>
                    Preview
                  </h2>
                  <p className="text-gray-600">Review your conversation</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-8">
                <div className="max-w-2xl mx-auto">
                  {conversationPreview}
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <div className="max-w-md mx-auto">
              <button
                onClick={handleSubmit}
                disabled={isLoading || isGenerating || (!selectedFile && (!context || !lastText))}
                className="w-full px-6 py-3 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#FE3C72" }}
              >
                {isLoading || isGenerating ? (
                  <div className="flex items-center justify-center gap-2">
                    <span>Generating</span>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0s" }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                    </div>
                  </div>
                ) : (
                  "Generate Responses ✨"
                )}
              </button>
            </div>
          </section>

          {/* Bottom SEO Section with refined styling */}
          <section id="seo-content" className="mt-16">
            <div className="grid gap-8 md:grid-cols-3">
              <section id="ai-rizz-info" className="bg-gray-50 p-6 rounded-md border border-gray-200">
                <h2 className="text-xl font-bold mb-2">Learn More About AI Rizz</h2>
                <p className="text-gray-700">
                  Discover how <strong>AI Rizz</strong> enhances digital communication with smart insights. Learn tips and strategies to boost your online charisma.
                </p>
              </section>
              <section id="ai-rizz-app-info" className="bg-gray-50 p-6 rounded-md border border-gray-200">
                <h2 className="text-xl font-bold mb-2">Explore the AI Rizz App</h2>
                <p className="text-gray-700">
                  The <strong>AI Rizz App</strong> and <strong>Rizz App</strong> deliver an innovative experience to improve your conversation skills. Explore its features and benefits.
                </p>
              </section>
              <section id="rizz-info" className="bg-gray-50 p-6 rounded-md border border-gray-200">
                <h2 className="text-xl font-bold mb-2">All About Rizz</h2>
                <p className="text-gray-700">
                  Dive into the world of <strong>Rizz</strong> with expert insights and community trends. Discover proven strategies for mastering digital interactions.
                </p>
              </section>
            </div>
            <nav className="mt-8 text-center">
              <ul className="flex justify-center gap-6">
                <li><a href="#ai-rizz-info" className="text-blue-600 hover:underline">AI Rizz</a></li>
                <li><a href="#ai-rizz-app-info" className="text-blue-600 hover:underline">AI Rizz App</a></li>
                <li><a href="#rizz-info" className="text-blue-600 hover:underline">Rizz</a></li>
              </ul>
            </nav>
          </section>

          <section id="faq" className="mt-16">
            <h2 className="text-3xl font-bold mb-4 text-center">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold">What is AI Rizz?</h3>
                <p className="text-gray-700">
                  AI Rizz is our innovative artificial intelligence solution designed to enhance digital communication by providing smart suggestions and insights.
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-semibold">How does the AI Rizz App work?</h3>
                <p className="text-gray-700">
                  The AI Rizz App uses advanced algorithms to analyze conversations and provide tailored suggestions that help improve your interaction style.
                </p>
              </div>
            </div>
            <nav className="mt-8 text-center">
              <a href="#seo-content" className="text-blue-600 hover:underline">
                Back to SEO sections
              </a>
            </nav>
          </section>
        </main>

        <footer className="text-center pb-8">
          <div className="max-w-4xl mx-auto px-4">
            <a href="/privacy-policy" className="px-4 py-2 rounded-full text-gray-600 hover:text-gray-900 transition text-sm md:text-base">
              Privacy Policy
            </a>
            <p className="text-gray-500 text-sm">
              © 2025 Smooth Rizz. All rights reserved.
            </p>
          </div>
        </footer>

        {/* Google Sign-In Overlay */}
        {!isSignedIn && usageCount >= ANONYMOUS_USAGE_LIMIT && (
          <GoogleSignInOverlay googleLoaded={googleLoaded} />
        )}

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          className="w-full text-white rounded-full p-4 font-bold shadow-lg transition-all hover:scale-[1.02]"
          style={{ backgroundColor: "#FE3C72" }}
        >
          Upgrade to Premium
        </button>

        {/* Add the popup */}
        {showRegeneratePopup && <RegeneratePopup />}

        {/* Response Overlay */}
        {showResponseOverlay && responses.length > 0 && (
          <ResponseOverlay
            responses={responses}
            onClose={() => setShowResponseOverlay(false)}
            childRefs={childRefs}
            currentIndex={currentIndex}
            swiped={swiped}
            outOfFrame={outOfFrame}
            onGenerateMore={generateMoreResponses}
            isGenerating={isGenerating}
            isSignedIn={isSignedIn}
            router={router}
            setUsageCount={setUsageCount}
          />
        )}
      </div>
    </>
  );
}
