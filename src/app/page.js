"use client";
import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import { analyzeScreenshot } from "./openai";
import { supabase } from "@/utils/supabase";
import { Upload, ArrowDown } from "lucide-react";
import Script from "next/script";
import { loadStripe } from '@stripe/stripe-js';

// Make sure to call `loadStripe` outside of a component's render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Overlay component for Google Sign-In
function GoogleSignInOverlay({ googleLoaded }) {
  const overlayButtonRef = useRef(null);

  useEffect(() => {
    if (googleLoaded && window.google && overlayButtonRef.current) {
      // Clear previous button
      overlayButtonRef.current.innerHTML = "";
      // Re-render the Google button
      window.google.accounts.id.renderButton(overlayButtonRef.current, {
        theme: "outline",
        size: "large",
      });
    }
  }, [googleLoaded]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-md flex flex-col items-center">
        <div ref={overlayButtonRef}></div>
        <p className="mt-4 text-center">
          Please sign in with Google to continue generating responses.
        </p>
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

  // Fetch current usage count for a given email
  const fetchUsageCount = async (email) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("users")
        .select("usage_count, daily_usage")
        .eq("email", email)
        .single();

      if (error) throw error;

      const dailyCount =
        data.daily_usage?.date === today ? data.daily_usage.count : 0;
      return {
        totalCount: data.usage_count || 0,
        dailyCount: dailyCount,
      };
    } catch (error) {
      console.error("Error fetching usage count:", error);
      return { totalCount: 0, dailyCount: 0 };
    }
  };

  // Add new useEffect to check localStorage on initial load
  useEffect(() => {
    // Check if user was previously signed in
    const storedUser = localStorage.getItem('smoothrizz_user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      setIsSignedIn(true);
    }

    // Check anonymous usage count
    const anonymousCount = parseInt(localStorage.getItem('smoothrizz_anonymous_count') || '0');
    if (!isSignedIn) {
      setUsageCount(anonymousCount);
    }
  }, []);

  // Update handleSignIn to persist user data
  const handleSignIn = async (response) => {
    if (!response.credential) return;
    const token = response.credential;
    const decodedToken = JSON.parse(atob(token.split(".")[1]));

    const userData = {
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      usage_count: 0,
    };

    try {
      const { error } = await supabase
        .from("users")
        .upsert([userData], { onConflict: "email", returning: "minimal" });
      if (error) throw error;

      const currentUsage = await fetchUsageCount(userData.email);
      setUsageCount(currentUsage.totalCount);
      setDailyCount(currentUsage.dailyCount);
      setUser(userData);
      setIsSignedIn(true);
      
      // Store user data in localStorage
      localStorage.setItem('smoothrizz_user', JSON.stringify(userData));
      // Clear anonymous count when user signs in
      localStorage.removeItem('smoothrizz_anonymous_count');
    } catch (error) {
      console.error("Error storing user data:", error);
    }
  };

  // Update handleSignOut to preserve upload functionality
  const handleSignOut = async () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.revoke();
      
      // Re-initialize Google Sign-In with the original configuration
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
    
    // Just restore the previous anonymous count
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
          break;
        }
      }
    }
  };

  // Update handleSubmit to track anonymous usage
  const handleSubmit = async () => {
    if (!selectedFile && (!context || !lastText)) {
      alert("Please either upload a screenshot or provide conversation details");
      return;
    }

    const currentAnonymousCount = parseInt(localStorage.getItem('smoothrizz_anonymous_count') || '0');
    
    // Update usage count and show overlay if needed
    if (!isSignedIn) {
      // If they're already at or over the limit, update state to show overlay
      if (currentAnonymousCount >= 3) {
        setUsageCount(currentAnonymousCount);
        return; // Don't proceed with the API call
      }
    }
    
    if (isSignedIn && dailyCount >= 30) {
      alert("You have reached your daily limit of 30 messages!");
      return;
    }

    try {
      setIsLoading(true);
      const result = await analyzeScreenshot(selectedFile, mode, isSignedIn, context, lastText);

      // Update usage counts
      if (!isSignedIn) {
        const newAnonymousCount = currentAnonymousCount + 1;
        localStorage.setItem('smoothrizz_anonymous_count', newAnonymousCount.toString());
        setUsageCount(newAnonymousCount);
      } else {
        const newTotalCount = usageCount + 1;
        setUsageCount(newTotalCount);

        if (user?.email) {
          const today = new Date().toISOString().split("T")[0];
          const { error } = await supabase
            .from("users")
            .update({
              usage_count: newTotalCount,
              daily_usage: { date: today, count: dailyCount + 1 },
            })
            .eq("email", user.email);
          if (error) console.error("Error updating usage count:", error);
        }
      }

      if (Array.isArray(result) && result.length > 0) {
        const firstResponse = result[0];
        if (typeof firstResponse === "string" && firstResponse.includes("|")) {
          const splitResponses = firstResponse.split("|").map((r) => r.trim());
          setResponses(splitResponses.slice(0, 3));
        } else {
          setResponses(result.slice(0, 3));
        }
      } else if (typeof result === "string") {
        if (result.includes("|")) {
          const splitResponses = result.split("|").map((r) => r.trim());
          setResponses(splitResponses.slice(0, 3));
        } else {
          setResponses([result]);
        }
      }

      document.querySelector("#responses-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      console.error("Error:", error);
      if (error.message === 'Anonymous usage limit reached. Please sign in to continue.') {
        // Update the anonymous count in localStorage to ensure overlay shows
        const newCount = Math.max(currentAnonymousCount, 3);
        localStorage.setItem('smoothrizz_anonymous_count', newCount.toString());
        setUsageCount(newCount);
      } else {
        alert("Error analyzing screenshot. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Update the Google Sign-In initialization effect
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
                auto_select: true,
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
        // If script already exists but needs reinitialization
        fetch("/api/auth/google-client-id")
          .then((res) => res.json())
          .then(({ clientId }) => {
            window.google.accounts.id.initialize({
              client_id: clientId,
              callback: handleSignIn,
              auto_select: !isSignedIn, // Only auto-select when not signed in
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
  }, [isSignedIn]); // Add isSignedIn as a dependency

  useEffect(() => {
    if (isSignedIn && user?.email) {
      fetchUsageCount(user.email).then(({ totalCount, dailyCount }) => {
        setUsageCount(totalCount);
        setDailyCount(dailyCount);
      });
    }
  }, [isSignedIn, user]);

  // Add new function to handle Stripe checkout
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

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong with the checkout process.');
    }
  };

  // Add this useEffect to handle redirect back from Stripe
  useEffect(() => {
    // Check to see if this is a redirect back from Checkout
    const query = new URLSearchParams(window.location.search);
    
    if (query.get('success')) {
      console.log('Order placed! You will receive an email confirmation.');
      // Handle successful payment here
    }

    if (query.get('canceled')) {
      console.log('Order canceled -- continue to shop around and checkout when you\'re ready.');
      // Handle canceled payment here
    }
  }, []);

  // Add this section in the JSX after the file upload section:
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
              onChange={(e) => setContext(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="Describe the conversation so far..."
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
              onChange={(e) => setLastText(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="What was their last message?"
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>SmoothRizz - AI Rizz, AI Rizz App, Rizz Insights</title>
        <meta
          name="description"
          content="SmoothRizz offers the smoothest AI Rizz experience online. Explore the AI Rizz App, learn about AI Rizz, and dive deep into rizz strategies."
        />
        <meta name="keywords" content="ai rizz, ai rizz app, rizz" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.smoothrizz.com" />

        <meta property="og:title" content="SmoothRizz - AI Rizz, AI Rizz App, Rizz Insights" />
        <meta
          property="og:description"
          content="SmoothRizz offers the smoothest AI Rizz experience online. Explore the AI Rizz App, learn about AI Rizz, and dive deep into rizz strategies."
        />
        <meta property="og:url" content="https://www.smoothrizz.com" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.smoothrizz.com/your-image.jpg" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="SmoothRizz - AI Rizz, AI Rizz App, Rizz Insights" />
        <meta
          name="twitter:description"
          content="SmoothRizz offers the smoothest AI Rizz experience online. Explore the AI Rizz App, learn about AI Rizz, and dive deep into rizz strategies."
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
                    "text": "AI Rizz is our innovative artificial intelligence solution that enhances digital conversations."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How does the AI Rizz App work?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "The AI Rizz App uses advanced algorithms to analyze conversations and provide insightful suggestions for smoother communication."
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

        <nav className="flex justify-between items-center p-4 md:p-6 lg:p-8">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#FE3C72" }}>
            SmoothRizz
          </h1>
          <div className="flex gap-3 md:gap-4 items-center">
            <div ref={googleButtonRef}></div>
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

          <section id="upload-section" className="mb-16 md:mb-24">
            <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
              <div className="text-gray-700 text-center mb-3 font-bold">
                Screenshot full conversation + text to respond to! 📱
              </div>
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
              <p className="text-gray-500 text-sm text-center italic mt-2 mb-8">
                Note: Your screenshots and texts are not stored on our servers and are only used for generating responses.
              </p>
              <div className="mt-1">
                <h3 className="text-gray-900 text-lg mb-2 font-medium text-center">
                  Choose where you are in the conversation:
                </h3>
                <div
                  className="grid grid-cols-3 gap-3 md:gap-4 p-4 rounded-2xl shadow-inner"
                  style={{ backgroundColor: "rgba(254, 60, 114, 0.1)" }}
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
                        className={`rounded-xl p-3 md:p-4 text-center cursor-pointer hover:scale-[1.02] transition-all text-white shadow-lg ${isSelected ? "ring-4 ring-pink-400 ring-opacity-50" : ""}`}
                        style={{ backgroundColor: "#121418" }}
                        onClick={() => setMode(phase.name.toLowerCase().replace(" ", "-"))}
                      >
                        <span className="block text-xl mb-1">{phase.emoji}</span>
                        <span className="text-sm font-medium">{phase.name}</span>
                        <span className="block text-xs text-white/60 mt-1">{phase.desc}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || (!selectedFile && (!context || !lastText)) || (isSignedIn && dailyCount >= 30)}
                  className={`w-full text-white rounded-full p-4 font-bold shadow-lg transition-all ${
                    isLoading || (!selectedFile && (!context || !lastText)) || (isSignedIn && dailyCount >= 30)
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:scale-[1.02]"
                  }`}
                  style={{ backgroundColor: "#FE3C72" }}
                >
                  {isLoading
                    ? "Analyzing..."
                    : isSignedIn && dailyCount >= 30
                    ? "Daily limit reached"
                    : "Get response"}
                </button>
              </div>
            </div>
          </section>

          <section id="responses-section" className="mb-16 md:mb-24">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
              <span style={{ color: "#121418" }}>Analyzing texts... </span>
              <span style={{ color: "#FE3C72" }}>Predicting success...</span>
            </h2>
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start justify-center">
              <div className="w-full md:w-1/2 max-w-md">
                <h3 className="text-xl font-semibold mb-4 text-center" style={{ color: "#121418" }}>
                  Your conversation
                </h3>
                <div className="w-full min-h-96 bg-gray-100 rounded-xl p-4">
                  {previewUrl ? (
                    <img 
                      src={previewUrl} 
                      alt="Preview of uploaded conversation" 
                      className="w-full rounded-xl" 
                      loading="lazy" 
                    />
                  ) : context || lastText ? (
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
              </div>
              <div className="w-full md:w-1/2 max-w-md">
                <h3 className="text-xl font-semibold mb-4 text-center" style={{ color: "#121418" }}>
                  SmoothRizz.com suggestions ✨
                </h3>
                <div className="space-y-4">
                  {responses.length > 0
                    ? responses.map((response, index) => (
                        <div
                          key={index}
                          className="rounded-2xl p-4 text-white transform transition-all hover:scale-[1.01] max-w-[85%] relative"
                          style={{ backgroundColor: "#FE3C72" }}
                        >
                          {response}
                          <div className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45" style={{ backgroundColor: "#FE3C72" }}></div>
                        </div>
                      ))
                    : [0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="rounded-2xl p-4 text-white transform transition-all hover:scale-[1.01] max-w-[85%] relative"
                          style={{ backgroundColor: "#FE3C72" }}
                        >
                          Suggestion {index + 1}
                          <div className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45" style={{ backgroundColor: "#FE3C72" }}></div>
                        </div>
                      ))}
                </div>
                <div className="mt-8 space-y-4">
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className={`w-[90%] mx-auto text-gray-900 rounded-full py-3 font-bold transition-all hover:scale-[1.02] border-2 border-gray-200 block ${
                      isLoading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {isLoading ? "Analyzing..." : "Regenerate responses"}
                  </button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">or</span>
                    </div>
                  </div>
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="w-[90%] mx-auto text-gray-900 rounded-full py-3 font-bold transition-all hover:scale-[1.02] border-2 border-gray-200 block"
                  >
                    Try new screenshot
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section id="seo-content" className="mt-16">
            <div className="grid gap-8">
              <section id="ai-rizz-info" className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-2">Learn More About AI Rizz</h2>
                <p className="text-gray-700">
                  Discover the innovative capabilities of <strong>AI Rizz</strong> that are transforming digital communication. Stay updated with trends and insights to maximize your potential.
                </p>
              </section>
              <section id="ai-rizz-app-info" className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-2">Explore the AI Rizz App</h2>
                <p className="text-gray-700">
                  The <strong>AI Rizz App</strong> provides a seamless experience to enhance your conversations. Learn about its features, benefits, and latest updates.
                </p>
              </section>
              <section id="rizz-info" className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-2">All About Rizz</h2>
                <p className="text-gray-700">
                  Delve into the world of <strong>Rizz</strong> with expert insights, community trends, and innovative strategies. Enhance your digital interactions with our curated content.
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
        {!isSignedIn && usageCount >= 3 && (
          <GoogleSignInOverlay 
            googleLoaded={googleLoaded}
          />
        )}

        {/* Add checkout button where needed */}
        <button
          onClick={handleCheckout}
          className="w-full text-white rounded-full p-4 font-bold shadow-lg transition-all hover:scale-[1.02]"
          style={{ backgroundColor: "#FE3C72" }}
        >
          Upgrade to Premium
        </button>
      </div>
    </>
  );
}