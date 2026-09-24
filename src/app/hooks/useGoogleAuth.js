"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Moves responses the visitor saved while anonymous into their account, so
// signing in does not lose anything stored in localStorage.
async function migrateAnonymousResponses(userEmail) {
  const savedResponses = JSON.parse(localStorage.getItem('anonymous_saved_responses') || '[]');
  if (savedResponses.length === 0) return;

  await Promise.all(
    savedResponses.map(async (item) => {
      await fetch('/api/saved-responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          response: item.response,
          userEmail,
          context: item.context,
          lastMessage: item.lastMessage,
          created_at: item.created_at,
        }),
      });
    })
  );
  localStorage.removeItem('anonymous_saved_responses');
}

/**
 * Owns Google Identity Services setup and the signed-in user for the home page.
 *
 * The header button and auto-select sign-in flow through handleSignIn (registered
 * as the GIS callback). The shared GoogleSignInOverlay component performs its own
 * credential exchange and writes the user to localStorage first, so it reports
 * back through handleOverlaySignInSuccess instead.
 */
export function useGoogleAuth() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const googleButtonRef = useRef(null);

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

        await migrateAnonymousResponses(data.user.email);
      } else {
        throw new Error(data.error || 'Failed to sign in');
      }
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  // Runs once on mount: restore any stored session, then load the GIS script
  useEffect(() => {
    const storedUser = localStorage.getItem('smoothrizz_user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setIsSignedIn(true);
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        localStorage.removeItem('smoothrizz_user');
      }
    }

    const initializeGoogleSignIn = async () => {
      if (!document.getElementById("google-client-script")) {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.id = "google-client-script";
        script.onload = async () => {
          try {
            const res = await fetch("/api/auth/google-client-id");
            const { clientId } = await res.json();
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
          } catch (err) {
            console.error("Error initializing Google Sign-In:", err);
          }
        };
        document.body.appendChild(script);
      }
    };

    initializeGoogleSignIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design; handleSignIn reads no reactive state
  }, []);

  // Re-initialize sign-in whenever auth state changes
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

  // The shared GoogleSignInOverlay exchanges the credential and stores the user
  // before calling this, so restore the session from localStorage and migrate
  // any responses saved while anonymous.
  const handleOverlaySignInSuccess = useCallback(async () => {
    const storedUser = localStorage.getItem('smoothrizz_user');
    if (!storedUser) return;
    try {
      const userData = JSON.parse(storedUser);
      await migrateAnonymousResponses(userData.email);
      setUser(userData);
      setIsSignedIn(true);
    } catch (error) {
      console.error('Error completing sign-in:', error);
    }
  }, []);

  return { isSignedIn, user, googleLoaded, googleButtonRef, handleOverlaySignInSuccess };
}
