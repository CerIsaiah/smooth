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
import Link from 'next/link';
import Image from 'next/image';

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
    <div className="fixed inset-0 bg-gradient-to-br from-pink-500/10 via-black/50 to-gray-900/50 backdrop-blur-sm z-50 flex flex-col">
      {/* Simplified Header */}
      <div className="bg-white/95 backdrop-blur-sm p-3 flex items-center border-b border-pink-100">
        <div className="text-base font-bold mx-auto" style={{ color: "#FE3C72" }}>
          Your Suggestions ✨
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors absolute right-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Compact Saved Responses Button */}
      <div className="bg-white px-3 py-2 border-b border-pink-100">
        <button
          onClick={handleSavedResponsesClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-white font-medium shadow-sm transition-all"
          style={{ backgroundColor: "#FE3C72" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          View Saved
        </button>
      </div>

      {/* Simplified Swipe Instructions */}
      <div className="bg-white px-3 py-2 border-b border-pink-100">
        <div className="flex items-center justify-between text-xs">
          <div className="text-red-500">← Swipe Left to Delete</div>
          <div className="text-green-500">Swipe Right to Save →</div>
        </div>
      </div>

      {/* Cards Container - Optimized for Mobile */}
      <div className="flex-1 w-full overflow-hidden flex items-center justify-center bg-gray-50/50">
        <div className="cardContainer w-[95vw] sm:w-[85vw] md:w-[75vw] lg:w-[500px] relative h-[60vh] sm:h-[65vh]">
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
                <div className='card rounded-lg shadow-md w-full h-full p-4 flex flex-col justify-center items-center bg-white border border-gray-100'>
                  <div className='card-content text-base font-medium text-gray-800 text-center w-full max-w-[90%] mx-auto'>
                    {response}
                  </div>
                  
                  {/* Minimal Swipe Hint */}
                  <div className="absolute bottom-3 left-0 right-0 text-center">
                    <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-50 text-xs text-gray-400">
                      ← Delete • Save →
                    </div>
                  </div>
                </div>
              </TinderCard>
            )
          )).filter(Boolean)}
        </div>

        {/* Simplified Need More Responses Popup */}
        {responses.length <= 1 && !isGenerating && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-4 w-full max-w-xs text-center">
              <h3 className="text-lg font-bold mb-2">Need more options?</h3>
              <button
                onClick={onGenerateMore}
                disabled={isGenerating}
                className="w-full px-4 py-2 rounded-full text-white font-medium shadow-sm transition-all disabled:opacity-50"
                style={{ backgroundColor: "#FE3C72" }}
              >
                {isGenerating ? "Generating..." : "Generate More ✨"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simplified Footer */}
      <div className="bg-white/95 backdrop-blur-sm p-3 border-t border-pink-100">
        <button
          onClick={() => {
            onClose();
            document.querySelector("#upload-section")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="w-full px-4 py-2 rounded-full font-medium border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
        >
          Upload Another Screenshot
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState([]);
  const [mode, setMode] = useState(null);
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
  const [isOnPreview, setIsOnPreview] = useState(false);
  const router = useRouter();

  // Add this state for tracking steps
  const [completedSteps, setCompletedSteps] = useState({
    upload: false,
    stage: false,
    preview: false
  });

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
      } else {
        throw new Error(data.error || 'Failed to sign in');
      }
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  // Update the handleSignOut function
  const handleSignOut = async () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.revoke();
    }
    
    setUser(null);
    setIsSignedIn(false);
    setResponses([]);
    
    const currentAnonymousCount = parseInt(localStorage.getItem('smoothrizz_anonymous_count') || '0');
    setUsageCount(currentAnonymousCount);
    setDailyCount(0);
    
    localStorage.removeItem('smoothrizz_user');

    // Re-initialize Google Sign-In button
    if (googleButtonRef.current) {
      fetch("/api/auth/google-client-id")
        .then((res) => res.json())
        .then(({ clientId }) => {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleSignIn,
            auto_select: false,
          });
          googleButtonRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
          });
        })
        .catch((err) => console.error("Error reinitializing Google Sign-In:", err));
    }
  };

  // Add this function to handle file upload with feedback
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setInputMode('screenshot');
      setContext('');
      setLastText('');
      setCompletedSteps(prev => ({ ...prev, upload: true }));
    }
  };

  // Update handlePaste similarly
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
          setCompletedSteps(prev => ({ ...prev, upload: true }));
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
      // Set upload step as completed if either context or lastText has content
      setCompletedSteps(prev => ({
        ...prev,
        upload: !!(type === 'context' ? value || lastText : value || context)
      }));
    } else {
      // If both inputs are empty, mark upload as incomplete
      const otherFieldEmpty = type === 'context' ? !lastText : !context;
      if (otherFieldEmpty) {
        setCompletedSteps(prev => ({
          ...prev,
          upload: false
        }));
      }
    }
  };

  // Update handleSubmit to reset responses
  const handleSubmit = async () => {
    if (!selectedFile && (!context || !lastText)) {
      alert("Please either upload a screenshot or provide conversation details");
      return;
    }

    if (!mode) {
      alert("Please select a conversation stage");
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
        <span>{showTextInput ? "Hide" : "Use"} text input option</span>
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

  // Update mode selection to track completion
  const handleModeSelection = (selectedMode) => {
    setMode(selectedMode);
    setCompletedSteps(prev => ({ ...prev, stage: true }));
  };

  // Update preview completion
  useEffect(() => {
    if (selectedFile || (context && lastText)) {
      setCompletedSteps(prev => ({ ...prev, preview: true }));
    }
  }, [selectedFile, context, lastText]);

  // Add this helper function to check if a step is accessible
  const canAccessStep = (stepNumber) => {
    switch (stepNumber) {
      case 1: // Upload
        return true; // Always accessible
      case 2: // Stage
        return completedSteps.upload;
      case 3: // Preview
        return completedSteps.upload && completedSteps.stage;
      default:
        return false;
    }
  };

  // Update the DynamicFooterButton component
  const DynamicFooterButton = () => {
    const scrollToSection = (id) => {
      const element = document.querySelector(id);
      if (element) {
        const offset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
        
        if (id === "#step-3") {
          setIsOnPreview(true);
        }
      }
    };

    // Show generate responses button when on preview section
    if (completedSteps.upload && completedSteps.stage && completedSteps.preview && isOnPreview) {
      return (
        <button
          onClick={handleSubmit}
          disabled={isLoading || (!selectedFile && (!context || !lastText))}
          className="w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-r from-pink-500 to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Generating..." : "Generate Responses ✨"}
        </button>
      );
    }

    // All steps completed but not on preview, show preview button
    if (completedSteps.upload && completedSteps.stage && completedSteps.preview) {
      return (
        <button
          onClick={() => scrollToSection("#step-3")}
          className="w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-r from-pink-500 to-rose-500"
        >
          See Preview →
        </button>
      );
    }

    if (!completedSteps.upload) {
      const textInputActive = showTextInput && (context || lastText);
      return (
        <button
          onClick={() => scrollToSection("#step-1")}
          className="w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-r from-pink-500 to-rose-500"
        >
          {textInputActive ? "Add More Context →" : "Upload Your Screenshot →"}
        </button>
      );
    }
    
    if (!completedSteps.stage) {
      return (
        <button
          onClick={() => scrollToSection("#step-2")}
          disabled={!canAccessStep(2)}
          className={`w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] 
            ${canAccessStep(2) 
              ? "bg-gradient-to-r from-pink-500 to-rose-500" 
              : "bg-gradient-to-r from-gray-400 to-gray-500 opacity-50 cursor-not-allowed hover:scale-100"}`}
        >
          Choose Your Context →
        </button>
      );
    }
    
    if (!completedSteps.preview) {
      return (
        <button
          onClick={() => scrollToSection("#step-3")}
          disabled={!canAccessStep(3)}
          className={`w-full px-6 py-3.5 rounded-full text-white font-medium shadow-lg transition-all hover:scale-[1.02] 
            ${canAccessStep(3)
              ? "bg-gradient-to-r from-pink-500 to-rose-500"
              : "bg-gradient-to-r from-gray-400 to-gray-500 opacity-50 cursor-not-allowed hover:scale-100"}`}
        >
          Preview Your Message →
        </button>
      );
    }
  };

  // Add this useEffect to detect when user scrolls to preview section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsOnPreview(true);
          }
        });
      },
      {
        threshold: 0.3, // Trigger when 30% of the element is visible
        rootMargin: '-100px', // Adjust based on your header height
      }
    );

    const previewSection = document.querySelector('#step-3');
    if (previewSection) {
      observer.observe(previewSection);
    }

    return () => {
      if (previewSection) {
        observer.unobserve(previewSection);
      }
    };
  }, []);

  // Add this useEffect near the other useEffects
  useEffect(() => {
    const updateOnlineUsers = () => {
      const randomUsers = Math.floor(Math.random() * (32 - 14 + 1)) + 14;
      const element = document.getElementById('online-users');
      if (element) {
        element.textContent = `${randomUsers} users swiping`;
      }
    };

    // Update initially
    updateOnlineUsers();

    // Update every 20-39 seconds
    const interval = setInterval(() => {
      const randomDelay = Math.floor(Math.random() * (39000 - 20000 + 1)) + 20000;
      setTimeout(updateOnlineUsers, randomDelay);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

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
        <title>SmoothRizz - AI Dating Response Generator | Get More Matches</title>
        <meta
          name="description"
          content="Generate witty, personalized dating app responses with SmoothRizz AI. Improve your match rate and stand out from the crowd with smart conversation starters."
        />
        <meta name="keywords" content="ai rizz, dating app responses, AI dating assistant, conversation starter, digital dating help, dating message generator, smooth talker ai" />
        <meta name="robots" content="index, follow" />
        <link 
          rel="canonical" 
          href={`https://smoothrizz.com${router.asPath}`} 
        />

        <meta property="og:title" content="SmoothRizz - AI-Powered Dating Response Generator | Master Digital Charisma" />
        <meta
          property="og:description"
          content="Transform your dating game with SmoothRizz's AI-powered response generator. Get personalized, witty responses for dating apps and boost your success rate. Try it now!"
        />
        <meta property="og:url" content="https://www.smoothrizz.com" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.smoothrizz.com/og-image.jpg" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="SmoothRizz - AI-Powered Dating Response Generator | Master Digital Charisma" />
        <meta
          name="twitter:description"
          content="Transform your dating game with SmoothRizz's AI-powered response generator. Get personalized, witty responses for dating apps and boost your success rate. Try it now!"
        />
        <meta name="twitter:image" content="https://www.smoothrizz.com/og-image.jpg" />

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

        {/* Header - Professional & Responsive */}
        <div className="flex justify-between items-center p-3 sm:p-4 bg-white/95 backdrop-blur-sm border-b border-pink-100">
          <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-pink-500 to-rose-600 bg-clip-text text-transparent">
            SmoothRizz
          </div>
          <div className="scale-78 origin-right sm:scale-100">
            {!isSignedIn && <div ref={googleButtonRef} className="!min-w-[120px]"></div>}
            {isSignedIn && (
              <button
                onClick={handleSignOut}
                className="px-4 py-2 rounded-full text-white text-sm font-medium bg-gray-900 hover:bg-gray-800 transition-colors shadow-sm"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        <main className="px-4 md:px-6 lg:px-8 max-w-7xl mx-auto pb-24">
          {/* Hero Section - Enhanced */}
          <section className="text-center mb-12 sm:mb-16 px-4 sm:px-0 pt-8 sm:pt-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 sm:mb-6">
              Be the <span className="bg-gradient-to-r from-pink-500 to-rose-600 bg-clip-text text-transparent">Smooth</span> Talker
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-8 sm:mb-10 max-w-2xl mx-auto">
              Get Smooth Inspiration For Witty Responses
            </p>
            <div className="relative max-w-[95%] sm:max-w-xl mx-auto">
              <img
                src="/mainpic.png"
                alt="App demonstration"
                className="w-full rounded-2xl"
                loading="lazy"
              />
              <div className="w-full h-px bg-gradient-to-r from-transparent via-pink-200 to-transparent my-8 sm:my-10" />
              <img
                src="/creds.png"
                alt="Trust indicators and credentials"
                className="w-full max-w-[95%] mx-auto"
                loading="lazy"
              />
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/90 text-white/90 text-sm shadow-lg">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span id="online-users">12 users online</span>
              </div>
            </div>
          </section>

          {/* Steps Section - Professional Cards */}
          <section className="space-y-12 sm:space-y-16 px-4 sm:px-0 max-w-3xl mx-auto">
            {/* Step 1 - Upload */}
            <div id="step-1" className="bg-white rounded-xl shadow-lg border border-gray-100 transform transition-all hover:scale-[1.01] hover:shadow-xl">
              <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                    <span className="text-xl font-semibold text-pink-500">1</span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Share Your Conversation</h2>
                </div>
              </div>
              
              <div className="p-4 sm:p-6">
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 bg-gray-50/50 relative hover:border-pink-200 transition-colors">
                  {completedSteps.upload ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="bg-green-50 p-2 rounded-full">
                        <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-green-600 font-medium">Upload Complete!</p>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-3 cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                      <Upload className="text-pink-500" size={28} />
                      <div className="text-center">
                        <p className="text-gray-700 font-medium mb-1">
                          Upload Conversation Screenshot!
                        </p>
                        <p className="text-gray-500 text-sm">
                          Press This or Ctrl+V to paste
                        </p>
                      </div>
                    </label>
                  )}
                </div>
                {textInputSection}
              </div>
            </div>

            {/* Step 2 - Stage Selection */}
            <div id="step-2" className="bg-white rounded-xl shadow-lg border border-gray-100 transform transition-all hover:scale-[1.01] hover:shadow-xl">
              <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                    <span className="text-xl font-semibold text-pink-500">2</span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Choose Your Context</h2>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { name: "First Move", desc: "Nail that opener", emoji: "👋" },
                    { name: "Mid-Game", desc: "Keep it flowing", emoji: "💭" },
                    { name: "End Game", desc: "Bring it home", emoji: "🎯" },
                  ].map((phase) => {
                    const isSelected = mode === phase.name.toLowerCase().replace(" ", "-");
                    return (
                      <button
                        key={phase.name}
                        className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                          isSelected 
                            ? "bg-pink-50 border-2 border-pink-200" 
                            : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                        }`}
                        onClick={() => handleModeSelection(phase.name.toLowerCase().replace(" ", "-"))}
                      >
                        <span className="text-2xl">{phase.emoji}</span>
                        <div className="text-left">
                          <div className="font-medium">{phase.name}</div>
                          <div className="text-sm text-gray-500">{phase.desc}</div>
                        </div>
                        {isSelected && (
                          <div className="ml-auto">
                            <svg className="w-6 h-6 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 3 - Preview */}
            <div id="step-3" className="bg-white rounded-xl shadow-lg border border-gray-100 transform transition-all hover:scale-[1.01] hover:shadow-xl">
              <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                    <span className="text-xl font-semibold text-pink-500">3</span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Preview</h2>
                </div>
              </div>

              <div className="p-4">
                {conversationPreview}
              </div>
            </div>
          </section>
          
          <div className="border-t border-gray-200 my-16"></div>

          {/* SEO Section - Updated with Blog Links */}
          <section className="mt-16 sm:mt-24 px-4 sm:px-0 mb-24 sm:mb-16">
            <div className="max-w-4xl mx-auto">
              <div className="bg-gradient-to-br from-pink-50/80 via-white to-rose-50/80 rounded-xl shadow-sm overflow-hidden border border-pink-100">
                <div className="p-6 sm:p-8">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                    Learn From Our Experts
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-8">
                    <Link 
                      href="/blog/how-to-rizz-techniques-that-actually-work"
                      className="group block overflow-hidden rounded-xl hover:shadow-lg transition-shadow bg-white"
                    >
                      <div className="relative w-full h-48">
                        <Image
                          src="/pics/thumbs-up.png"
                          alt="Modern messaging techniques guide"
                          fill
                          className="object-cover transform group-hover:scale-105 transition-transform duration-300"
                          priority
                        />
                      </div>
                      <div className="p-4 bg-gradient-to-r from-pink-50/50 to-rose-50/50">
                        <h3 className="font-semibold text-lg group-hover:text-pink-500 transition-colors">
                          How to Rizz: Techniques That You Can Use in 2025
                        </h3>
                        <p className="text-gray-600 mt-2 text-sm">
                          Learn proven techniques to improve your messaging game and build better connections.
                        </p>
                      </div>
                    </Link>

                    <Link 
                      href="/blog/best-rizz-lines-100-plus-examples-that-actually-work"
                      className="group block overflow-hidden rounded-xl hover:shadow-lg transition-shadow bg-white"
                    >
                      <div className="relative w-full h-48">
                        <Image
                          src="/pics/percent100.png"
                          alt="Best rizz lines guide"
                          fill
                          className="object-cover transform group-hover:scale-105 transition-transform duration-300"
                          priority
                        />
                      </div>
                      <div className="p-4 bg-gradient-to-r from-pink-50/50 to-rose-50/50">
                        <h3 className="font-semibold text-lg group-hover:text-pink-500 transition-colors">
                          Best Rizz Lines: 100+ Examples That Work
                        </h3>
                        <p className="text-gray-600 mt-2 text-sm">
                          Rizz Pick up Lines That Work in 2025
                        </p>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Clear Section Divider */}
          <div className="relative my-24">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <div className="bg-white px-4 text-sm text-gray-500">Why SmoothRizz</div>
            </div>
          </div>

          {/* Why Choose SmoothRizz Section - Updated with distinct styling */}
          <section className="px-4 sm:px-0 mb-24">
            <div className="max-w-4xl mx-auto">
              <div className="bg-gradient-to-br from-gray-50 via-white to-pink-50 rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                {/* Header with updated styling */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 sm:p-8 border-b border-gray-100">
                  <h2 className="text-xl sm:text-2xl font-semibold text-white text-center">
                    Why Choose SmoothRizz?
                  </h2>
                  <p className="mt-4 text-gray-300 text-sm sm:text-base text-center max-w-2xl mx-auto leading-relaxed">
                    SmoothRizz uses advanced AI technology to help you create genuine, engaging conversations that lead to meaningful connections.
                  </p>
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8 space-y-6">
                  {/* Key Features */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <span className="text-gray-400">✨</span> Key Features
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        {
                          icon: "🎯",
                          title: "Personalized Suggestions",
                          desc: "Response suggestions based on conversation context"
                        },
                        {
                          icon: "🧠",
                          title: "Smart Analysis",
                          desc: "Intelligent analysis of conversation tone and style"
                        },
                        {
                          icon: "🔄",
                          title: "Multiple Options",
                          desc: "Various suggestions for every situation"
                        },
                        {
                          icon: "🔒",
                          title: "Privacy Focused",
                          desc: "Secure design that protects your data"
                        }
                      ].map((feature, index) => (
                        <div 
                          key={index}
                          className="p-4 rounded-xl bg-gray-50 hover:bg-pink-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{feature.icon}</span>
                            <div>
                              <h4 className="font-medium text-gray-900">{feature.title}</h4>
                              <p className="text-sm text-gray-600 mt-1">{feature.desc}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* How It Works */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <span className="text-gray-400">⚡️</span> How It Works
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                        <div className="w-16 h-16 flex-shrink-0 bg-white rounded-full flex items-center justify-center shadow-sm">
                          <svg className="w-8 h-8 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        <p className="text-gray-700 text-center sm:text-left">
                          Simply share your conversation screenshot or type your context, and our AI will analyze the conversation's tone, context, and style. Within seconds, you'll receive multiple personalized response suggestions that maintain your authentic voice while enhancing your communication.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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

        {/* Dynamic Footer */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-pink-100 p-4 z-40">
          <div className="max-w-3xl mx-auto">
            <DynamicFooterButton />
          </div>
        </div>

        {/* Google Sign-In Overlay */}
        {!isSignedIn && usageCount >= ANONYMOUS_USAGE_LIMIT && (
          <GoogleSignInOverlay googleLoaded={googleLoaded} />
        )}

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
