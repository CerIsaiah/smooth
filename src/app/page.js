"use client";
import { useState, useEffect, useRef } from "react";
import { analyzeScreenshot } from "./openai";
import { supabase } from "@/utils/supabase";
import { Upload, ArrowDown } from "lucide-react";
import Script from "next/script";

// Overlay component that covers the screen and displays only the Google sign in button.
function GoogleSignInOverlay({ googleLoaded }) {
  const overlayButtonRef = useRef(null);

  useEffect(() => {
    if (googleLoaded && window.google && overlayButtonRef.current) {
      // Clear any previous content before rendering.
      overlayButtonRef.current.innerHTML = "";
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
  const [googleLoaded, setGoogleLoaded] = useState(false);
  // Ref for rendering the Google button in the nav (if needed)
  const googleButtonRef = useRef(null);

  // Fetch the current usage count for a given email.
  const fetchUsageCount = async (email) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("usage_count")
        .eq("email", email)
        .single();
      if (error) throw error;
      return data.usage_count || 0;
    } catch (error) {
      console.error("Error fetching usage count:", error);
      return 0;
    }
  };

  // Called when Google returns a credential.
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
      setUsageCount(currentUsage);
      setUser(userData);
      setIsSignedIn(true);
    } catch (error) {
      console.error("Error storing user data:", error);
      // Even if an error occurs, we mark the user as signed in.
      setUser(userData);
      setIsSignedIn(true);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setIsSignedIn(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setResponses([]);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
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

  const handleSubmit = async () => {
    if (!selectedFile) {
      alert("Please select a screenshot first");
      return;
    }

    // If the user isn't signed in and they've generated 5+ responses, do not proceed.
    if (!isSignedIn && usageCount >= 5) {
      // The overlay is rendered below to force sign in.
      return;
    }

    if (isSignedIn && usageCount >= 30) {
      alert("You have reached your daily limit of 30 messages!");
      return;
    }

    try {
      setIsLoading(true);
      const result = await analyzeScreenshot(selectedFile, mode);
      const newUsageCount = usageCount + 1;
      setUsageCount(newUsageCount);

      if (isSignedIn && user?.email) {
        const { error } = await supabase
          .from("users")
          .update({ usage_count: newUsageCount })
          .eq("email", user.email);
        if (error) console.error("Error updating usage count:", error);
      }

      if (Array.isArray(result) && result.length > 0) {
        const firstResponse = result[0];
        if (
          typeof firstResponse === "string" &&
          firstResponse.includes("|")
        ) {
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
      alert("Error analyzing screenshot. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Load the Google Identity Services script and initialize it.
  useEffect(() => {
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
              auto_select: false,
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
    } else {
      setGoogleLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn && user?.email) {
      fetchUsageCount(user.email).then((count) => setUsageCount(count));
    }
  }, [isSignedIn, user]);

  return (
    <>
      {/* Google Tag Manager */}
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
      {/* Google Analytics */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-FD93L95WFQ"
        strategy="afterInteractive"
      />
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
        {/* Top navigation */}
        <nav className="flex justify-between items-center p-4 md:p-6 lg:p-8">
          <h1
            className="text-2xl md:text-3xl font-bold"
            style={{ color: "#FE3C72" }}
          >
            SmoothRizz
          </h1>
          <div className="flex gap-3 md:gap-4 items-center">
            {/* Render the Google button in the nav if not signed in.
                (The overlay will appear later if usageCount >= 5.) */}
            {!isSignedIn ? (
              <div ref={googleButtonRef} />
            ) : (
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

        {/* Main content */}
        <main className="px-4 md:px-6 lg:px-8 max-w-7xl mx-auto">
          {/* Hero Section with Main Image */}
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
            <img src="/mainpic.png" alt="App demonstration" className="max-w-4xl w-full mx-auto" />
            <button
              onClick={() => document.querySelector('#upload-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-8 px-8 py-4 rounded-full text-white font-bold shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: "#FE3C72" }}
            >
              Get Started <ArrowDown className="inline ml-2" size={20} />
            </button>
          </section>

          {/* Upload Section */}
          <section id="upload-section" className="mb-16 md:mb-24">
            <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
              <div className="text-gray-700 text-center mb-3 font-bold">
                Screenshot full conversation + text to respond to! 📱
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-white relative hover:border-pink-300 transition-colors">
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
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
                    {
                      name: "First Move",
                      desc: "Nail that opener",
                      emoji: "👋",
                    },
                    {
                      name: "Mid-Game",
                      desc: "Keep it flowing",
                      emoji: "💭",
                    },
                    {
                      name: "End Game",
                      desc: "Bring it home",
                      emoji: "🎯",
                    },
                  ].map((phase) => {
                    const isSelected =
                      mode === phase.name.toLowerCase().replace(" ", "-");
                    return (
                      <div
                        key={phase.name}
                        className={`rounded-xl p-3 md:p-4 text-center cursor-pointer hover:scale-[1.02] transition-all text-white shadow-lg ${
                          isSelected
                            ? "ring-4 ring-pink-400 ring-opacity-50"
                            : ""
                        }`}
                        style={{ backgroundColor: "#121418" }}
                        onClick={() =>
                          setMode(phase.name.toLowerCase().replace(" ", "-"))
                        }
                      >
                        <span className="block text-xl mb-1">
                          {phase.emoji}
                        </span>
                        <span className="text-sm font-medium">
                          {phase.name}
                        </span>
                        <span className="block text-xs text-white/60 mt-1">
                          {phase.desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <button
                  onClick={handleSubmit}
                  disabled={
                    isLoading ||
                    !selectedFile ||
                    (isSignedIn && usageCount >= 30)
                  }
                  className={`w-full text-white rounded-full p-4 font-bold shadow-lg transition-all ${
                    isLoading ||
                    !selectedFile ||
                    (isSignedIn && usageCount >= 30)
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:scale-[1.02]"
                  }`}
                  style={{ backgroundColor: "#FE3C72" }}
                >
                  {isLoading
                    ? "Analyzing..."
                    : isSignedIn && usageCount >= 30
                    ? "Daily limit reached"
                    : "Get response"}
                </button>
                
              </div>
            </div>
          </section>

          {/* Responses section */}
          <section id="responses-section" className="mb-16 md:mb-24">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
              <span style={{ color: "#121418" }}>Analyzing texts... </span>
              <span style={{ color: "#FE3C72" }}>Predicting success...</span>
            </h2>
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start justify-center">
              <div className="w-full md:w-1/2 max-w-md">
                <h3
                  className="text-xl font-semibold mb-4 text-center"
                  style={{ color: "#121418" }}
                >
                  Your conversation
                </h3>
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded conversation"
                    className="w-full rounded-xl"
                  />
                ) : (
                  <div className="w-full h-96 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                    Your conversation will appear here
                  </div>
                )}
              </div>
              <div className="w-full md:w-1/2 max-w-md">
                <h3
                  className="text-xl font-semibold mb-4 text-center"
                  style={{ color: "#121418" }}
                >
                  SmoothRizz suggestions ✨
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
                          <div
                            className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45"
                            style={{ backgroundColor: "#FE3C72" }}
                          ></div>
                        </div>
                      ))
                    : [0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="rounded-2xl p-4 text-white transform transition-all hover:scale-[1.01] max-w-[85%] relative"
                          style={{ backgroundColor: "#FE3C72" }}
                        >
                          Suggestion {index + 1}
                          <div
                            className="absolute -left-2 bottom-[45%] w-4 h-4 transform rotate-45"
                            style={{ backgroundColor: "#FE3C72" }}
                          ></div>
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
                    onClick={() =>
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }
                    className="w-[90%] mx-auto text-gray-900 rounded-full py-3 font-bold transition-all hover:scale-[1.02] border-2 border-gray-200 block"
                  >
                    Try new screenshot
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="text-center pb-8">
          <div className="max-w-4xl mx-auto px-4">
            <a
              href="/privacy-policy"
              className="px-4 py-2 rounded-full text-gray-600 hover:text-gray-900 transition text-sm md:text-base"
            >
              Privacy Policy
            </a>
            <p className="text-gray-500 text-sm">
              © 2025 Smooth Rizz. All rights reserved.
            </p>
          </div>
        </footer>

        {/* If the user isn't signed in and has generated 5+ responses, show the overlay */}
        {!isSignedIn && usageCount >= 5 && (
          <GoogleSignInOverlay googleLoaded={googleLoaded} />
        )}
      </div>
    </>
  );
}
