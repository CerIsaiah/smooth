"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from 'next/navigation';
import TinderCard from 'react-tinder-card';
import Script from 'next/script';
import { ANONYMOUS_USAGE_LIMIT, FREE_USER_DAILY_LIMIT } from '../constants';
import { GoogleSignInOverlay } from '../components/GoogleSignInOverlay';
import { UpgradePopup } from '../components/UpgradePopup';
import useResponseStore from '../../store/responseStore';
import { analyzeScreenshot } from '../openai';

/**
 * Responses Page Component
 * 
 * This file handles the main response card swiping interface and user interactions.
 * 
 * Main Features:
 * - Tinder-style card swiping interface
 * - Response regeneration
 * - Usage tracking
 * - Google Sign-In integration
 * - Premium upgrade flow
 * 
 * Dependencies:
 * - react-tinder-card: For swipeable cards
 * - @/utils/dbOperations: For usage tracking
 * - @/store/responseStore: For managing response state
 * 
 * Side Effects:
 * - Updates usage records in database
 * - Saves responses to user account
 * - Manages local storage for anonymous users
 * 
 * Connected Files:
 * - src/app/api/swipes/route.js: Tracks swipe actions
 * - src/app/api/auth/google/route.js: Handles authentication
 * - src/components/GoogleSignInOverlay.js: Sign-in UI
 * - src/components/UpgradePopup.js: Premium upgrade UI
 */

// Loading screen component
function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-pink-500/10 via-black/50 to-gray-900/50 backdrop-blur-sm z-[70] flex items-center justify-center">
      <div className="text-white text-center space-y-4">
        <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"/>
        <p className="text-xl">Generating new responses...</p>
      </div>
    </div>
  );
}

// Update RegeneratePopup to match premium styling
function RegeneratePopup({ onRegenerate, onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[60] p-4">
      <div className="bg-white p-6 rounded-xl w-full max-w-md mx-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl"
        >
          ×
        </button>
        
        <h2 className="text-2xl font-bold mb-4">Generate New Responses</h2>
        <p className="mb-6">
          Would you like to generate new responses?
        </p>
        
        <button
          onClick={onRegenerate}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg hover:opacity-90 transition-opacity"
        >
          Generate New Responses
        </button>
      </div>
    </div>
  );
}

export default function ResponsesPage() {
  const { responses, setResponses, lastFile, lastMode, lastContext, lastText } = useResponseStore();
  const [currentIndex, setCurrentIndex] = useState(responses.length - 1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [usageCount, setUsageCount] = useState(0);
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [showRegeneratePopup, setShowRegeneratePopup] = useState(false);
  const [lastDirection, setLastDirection] = useState();
  const currentIndexRef = useRef(currentIndex);
  const router = useRouter();
  const [totalSwipes, setTotalSwipes] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showResponseOverlay, setShowResponseOverlay] = useState(false);
  const [showSignInOverlay, setShowSignInOverlay] = useState(false);
  const [hasPreviewContent, setHasPreviewContent] = useState(false);
  const [key, setKey] = useState(0);

  const childRefs = useRef(
    Array(responses.length)
      .fill(0)
      .map(() => React.createRef())
  );

  // Add safety check for responses
  useEffect(() => {
    if (!Array.isArray(responses)) {
      setResponses([]);
    }
  }, [responses, setResponses]);

  // Add effect to check auth status and redirect if needed
  useEffect(() => {
    // Only check auth status
    const checkAuth = async () => {
      const savedUser = localStorage.getItem('smoothrizz_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setIsSignedIn(true);
        
        // If user just signed in (check for flag in localStorage)
        const justSignedIn = localStorage.getItem('just_signed_in');
        if (justSignedIn) {
          localStorage.removeItem('just_signed_in'); // Clear the flag
          router.push('/'); // Redirect to homepage
        }
      }
    };
    checkAuth();
  }, []); 

  useEffect(() => {
    const checkInitialUsage = async () => {
      try {
        // Get user from localStorage
        const savedUser = localStorage.getItem('smoothrizz_user');
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setIsSignedIn(true);
        }

        // Make API call with proper headers
        const headers = {
          'Content-Type': 'application/json'
        };
        
        // Add user email header if we have a user
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          headers['x-user-email'] = parsedUser.email;
        }

        const response = await fetch('/api/usage', { headers });
        const data = await response.json();
        
        setUsageCount(data.dailySwipes || 0);
        setIsPremium(data.isPremium || data.isTrial);
        
        localStorage.setItem('smoothrizz_usage', JSON.stringify({
          dailySwipes: data.dailySwipes,
          isPremium: data.isPremium || data.isTrial
        }));
      } catch (error) {
        console.error('Error checking initial usage:', error);
      }
    };

    checkInitialUsage();
  }, []); // Only run once on mount

  // Add effect to load stored responses on mount
  useEffect(() => {
    const storedData = localStorage.getItem('smoothrizz_responses');
    if (storedData) {
      const { responses: savedResponses, currentIndex: savedIndex } = JSON.parse(storedData);
      if (Array.isArray(savedResponses) && savedResponses.length > 0) {
        setResponses(savedResponses);
        setCurrentIndex(savedIndex);
        currentIndexRef.current = savedIndex;
      }
    }
  }, []);

  // Update localStorage whenever responses or currentIndex changes
  useEffect(() => {
    if (Array.isArray(responses)) {
      localStorage.setItem('smoothrizz_responses', JSON.stringify({
        responses,
        currentIndex
      }));
    }
  }, [responses, currentIndex]);

  // Update the effect that handles preview URL
  useEffect(() => {
    const loadPreview = async () => {
      if (lastFile) {
        // For new file uploads
        const url = URL.createObjectURL(lastFile);
        setPreviewUrl(url);
        setHasPreviewContent(true);
        
        // Store in localStorage as base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result;
          localStorage.setItem('smoothrizz_preview', base64String);
          // Update previewUrl to use base64 string directly
          setPreviewUrl(base64String);
        };
        reader.readAsDataURL(lastFile);
        
        return () => URL.revokeObjectURL(url);
      } else {
        // Try to load from localStorage
        const storedPreview = localStorage.getItem('smoothrizz_preview');
        if (storedPreview) {
          setPreviewUrl(storedPreview);
          setHasPreviewContent(true);
        }
      }
    };
    
    loadPreview();
  }, [lastFile]);

  // Add Google Sign-In initialization
  useEffect(() => {
    if (window.google) {
      setGoogleLoaded(true);
    }
  }, []);

  // Update handleRegenerate to maintain usage count
  const handleRegenerate = async () => {
    if (isGenerating) return;
    
    // Get the stored values directly from the store
    const store = useResponseStore.getState();
    console.log('Store state:', store); // Debug log
    
    try {
      // Check if we have any input to regenerate from
      if (!store.lastFile && !store.lastContext && !store.lastText) {
        console.log('Missing input data:', { 
          lastFile: store.lastFile,
          lastContext: store.lastContext,
          lastText: store.lastText
        });
        alert("No input available for regeneration. Please return to home and try again.");
        router.push('/');
        return;
      }

      // Get current usage status before regenerating
      const headers = {
        'Content-Type': 'application/json',
        ...(isSignedIn && user?.email && { 'x-user-email': user.email })
      };
      
      const statusResponse = await fetch('/api/usage', { headers });
      const statusData = await statusResponse.json();
      const currentUsage = statusData.dailySwipes ;
      
      setIsGenerating(true);
      setShowRegeneratePopup(false);
      
      // Generate new responses using stored context
      const result = await analyzeScreenshot(
        store.lastFile,
        store.lastMode,
        isSignedIn,
        store.lastContext,
        store.lastText
      );
      
      if (Array.isArray(result) && result.length > 0) {
        // Set the new responses
        setResponses(result);
        
        // Reset card-related state but maintain usage count
        childRefs.current = new Array(result.length).fill(0).map(() => React.createRef());
        setLastDirection(undefined);
        setCurrentIndex(result.length - 1);
        currentIndexRef.current = result.length - 1;
        
        // Maintain the usage count
        setUsageCount(currentUsage);
        
        // Force a re-render
        setKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error in handleRegenerate:', error);
      if (error.message === 'No input provided. Please provide an image or text.') {
        alert("No input available for regeneration. Please return to home and try again.");
        router.push('/');
      } else {
        alert("Error generating new responses. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Add this effect to update childRefs when responses change
  useEffect(() => {
    if (responses.length > 0) {
      // Reset refs when responses change
      const newRefs = Array(responses.length)
        .fill(0)
        .map(() => React.createRef());
      childRefs.current = newRefs;
    }
  }, [responses]);

  // Update swiped function to properly track usage
  const swiped = async (direction, responseToDelete) => {
    try {
      if (!direction) return;

      setLastDirection(direction);
      updateCurrentIndex(currentIndex - 1);
      
      // Only increment total swipes for new swipes (not regenerated cards)
      if (currentIndex === responses.length - 1 - totalSwipes) {
        setTotalSwipes(prev => prev + 1);
      }

      // Always make API call to track swipes, regardless of direction
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Add user email header if signed in
      if (isSignedIn && user?.email) {
        headers['x-user-email'] = user.email;
      }

      // Save response if swiped right
      if (direction === 'right') {
        await saveResponse(responseToDelete);
      }

      const response = await fetch('/api/swipes', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          direction,
          response: direction === 'right' ? responseToDelete : undefined
        })
      });

      const data = await response.json();
      
      if (response.ok && !isPremium) {
        setUsageCount(data.dailySwipes || 0);
        
        // For anonymous users at limit, show sign in overlay and set flag
        if (!isSignedIn && data.dailySwipes >= ANONYMOUS_USAGE_LIMIT) {
          localStorage.setItem('just_signed_in', 'true');
          setShowSignInOverlay(true);
          return;
        }
        
        // For signed-in users at limit, show upgrade popup
        if (isSignedIn && data.dailySwipes >= FREE_USER_DAILY_LIMIT) {
          setShowUpgradePopup(true);
          return;
        }
      }
      
      // Only show regenerate popup when all responses are gone
      if (currentIndex === 0) {
        setShowRegeneratePopup(true);
      }
      
    } catch (error) {
      console.error('Error in swiped function:', error);
    }
  };

  // Update saveResponse function to handle errors
  const saveResponse = async (response) => {
    try {
      if (isSignedIn && user?.email) {
        const result = await fetch('/api/saved-responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            response,
            userEmail: user.email,
          }),
        });
        
        if (!result.ok) {
          console.error('Failed to save response:', await result.text());
        }
      } else {
        // Save for anonymous users
        const savedResponses = JSON.parse(localStorage.getItem('anonymous_saved_responses') || '[]');
        savedResponses.push({
          response,
          created_at: new Date().toISOString(),
        });
        localStorage.setItem('anonymous_saved_responses', JSON.stringify(savedResponses));
      }
    } catch (error) {
      console.error('Error saving response:', error);
    }
  };

  // Remove the outOfFrame handler as we don't need to modify the responses array
  const outOfFrame = () => {
    // Only show regenerate popup when all responses are gone
    if (currentIndex === 0) {
      setShowRegeneratePopup(true);
    }
  };



  // Update the swipe function to prevent swiping after going back
  const swipe = async (dir) => {
    if (canSwipe && currentIndex >= 0 && currentIndex < responses.length) {
      // Only allow swiping if we're at the highest index we've reached
      if (currentIndex === responses.length - 1 - totalSwipes) {
        try {
          const currentRef = childRefs.current[currentIndex];
          if (currentRef && currentRef.current) {
            await currentRef.current.swipe(dir);
            setTotalSwipes(prev => prev + 1);
          }
        } catch (error) {
          swiped(dir, responses[currentIndex], currentIndex);
        }
      }
    }
  };

  // Update keyboard handler to prevent rapid firing
  useEffect(() => {
    let isProcessing = false;
    
    const handleKeyPress = async (event) => {
      if (isProcessing) return;
      
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        isProcessing = true;
        const direction = event.key === 'ArrowLeft' ? 'left' : 'right';
        await swipe(direction);
        setTimeout(() => {
          isProcessing = false;
        }, 300); // Debounce time
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex]);

  const handleClose = () => {
    router.push('/');
  };

  const handleCheckout = async () => {
    try {
      const response = await fetch('/api/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: user?.email,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    }
  };

  // Add preview toggle handler
  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  // Add updateCurrentIndex function
  const updateCurrentIndex = useCallback((index) => {
    setCurrentIndex(index);
    currentIndexRef.current = index;
  }, []);

  // Add computed properties for swipe controls
  const canSwipe = currentIndex >= 0;
  const canGoBack = currentIndex < responses.length - 1;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onLoad={() => setGoogleLoaded(true)}
      />

      <div className="min-h-screen bg-[#fbfbfb]">
        <div className="fixed inset-0 bg-gradient-to-br from-pink-500/10 via-black/50 to-gray-900/50 backdrop-blur-sm z-50 flex flex-col">
          <div className="relative flex-1 flex flex-col items-center justify-center p-4">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-white hover:text-gray-200 z-50 text-2xl"
            >
              ×
            </button>

            {/* Preview toggle button */}
            {hasPreviewContent && (
              <button
                onClick={togglePreview}
                className="absolute top-4 text-white hover:text-gray-200 z-50 px-6 py-2 rounded-full bg-black/20 backdrop-blur-sm text-sm mx-auto left-1/2 transform -translate-x-1/2"
              >
                Review Photo
              </button>
            )}


            {/* Preview overlay */}
            {showPreview && previewUrl && (
              <div 
                className="fixed inset-0 bg-black/80 z-[55] flex items-center justify-center p-4"
                onClick={togglePreview}
              >
                <div className="relative max-w-[100%] sm:max-w-lg md:max-w-md mx-auto">
                  <img
                    src={previewUrl}
                    alt="Screenshot preview"
                    className="w-full rounded-2xl"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {/* Response cards */}
            <div className="w-full max-w-md mx-auto h-[60vh] relative mt-14" key={key}>
              {responses && responses.map((response, index) => (
                <TinderCard
                  ref={childRefs.current[index]}
                  key={index}
                  onSwipe={(dir) => swiped(dir, response, index)}
                  onCardLeftScreen={() => outOfFrame()}
                  preventSwipe={['up', 'down']}
                  className="absolute w-full h-full cursor-grab active:cursor-grabbing"
                >
                  <div 
                    className={`bg-white rounded-2xl p-8 w-full h-full flex flex-col transform transition-all duration-200 
                      hover:scale-[1.02] relative border-2 border-black`}
                  >
                    {/* Swipe Indicators - Made Larger and More Visible */}
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-red-500 transform scale-0 transition-transform duration-300 group-hover:scale-100">
                      <div className="flex flex-col items-center space-y-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-sm font-semibold">Discard</span>
                      </div>
                    </div>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-green-500 transform scale-0 transition-transform duration-300 group-hover:scale-100">
                      <div className="flex flex-col items-center space-y-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm font-semibold">Save</span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 flex items-center justify-center">
                      <div className="prose prose-lg max-w-full text-center px-8">
                        <p className="text-gray-800 whitespace-pre-wrap text-xl leading-relaxed font-medium">
                          {response}
                        </p>
                      </div>
                    </div>

                    {/* Swipe Hint at Bottom */}
                    <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center text-sm">
                      <div className="flex items-center text-red-500 space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>Swipe Left to Discard</span>
                      </div>
                      <div className="flex items-center text-green-500 space-x-2">
                        <span>Swipe Right to Save</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </TinderCard>
              ))}
            </div>

            {/* Enhanced Swipes Counter - Moved down */}
            <div className="text-white text-center mt-6 mb-2">
              {isPremium ? (
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-2 rounded-full inline-flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  <span className="text-sm font-medium">Unlimited Swipes Available</span>
                </div>
              ) : (
                <div className="bg-white/10 backdrop-blur-sm px-6 py-2 rounded-full inline-flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">
                    {isSignedIn 
                      ? `${FREE_USER_DAILY_LIMIT - usageCount} of ${FREE_USER_DAILY_LIMIT} Free Swipes Left`
                      : `${ANONYMOUS_USAGE_LIMIT - usageCount} of ${ANONYMOUS_USAGE_LIMIT} Free Swipes Left`
                    }
                  </span>
                </div>
              )}
            </div>

            {/* New Screenshot Button + Instructions */}
            <div className="text-white text-center mt-6 space-y-4">
              <button
                onClick={() => router.push('/')}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-sm px-6 py-2.5 rounded-full inline-flex items-center space-x-2 transition-all duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Add New Screenshot</span>
              </button>
              <p className="text-xs text-gray-300 opacity-75">Use arrow keys or swipe on mobile</p>
            </div>
          </div>
        </div>

        {/* Overlays */}
        {isGenerating && <LoadingScreen />}
        
        {showSignInOverlay && !isSignedIn && (
          <GoogleSignInOverlay 
            googleLoaded={googleLoaded}
            onClose={() => {
              setShowSignInOverlay(false);
              router.push('/'); // Redirect to home after closing sign-in overlay
            }}
          />
        )}

        {/* Only show upgrade popup for signed-in users */}
        {showUpgradePopup && isSignedIn && !isPremium && (
          <UpgradePopup 
            onClose={() => setShowUpgradePopup(false)} 
            handleCheckout={handleCheckout}
          />
        )}

        {showRegeneratePopup && (
          <RegeneratePopup 
            onRegenerate={handleRegenerate}
            onClose={() => router.push('/')}
          />
        )}
      </div>
    </>
  );
} 