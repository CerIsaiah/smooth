"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Usage state for the home page: daily swipe count, premium/trial status, and
 * the upgrade popup. Consolidates the /api/usage poll and the subscription
 * status check that previously lived as separate effects in page.js.
 */
export function useUsage(isSignedIn, user) {
  const [usageCount, setUsageCount] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const fetchingRef = useRef(false);

  // Consolidate fetch operations into a single memoized function
  const fetchUserData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const response = await fetch('/api/usage', {
        headers: {
          'Content-Type': 'application/json',
          ...(isSignedIn && user?.email && { 'x-user-email': user.email })
        }
      });

      const data = await response.json();
      if (response.ok) {
        setUsageCount(data.dailySwipes || 0);
        setIsPremium(data.isPremium || data.isTrial);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      fetchingRef.current = false;
    }
  }, [isSignedIn, user]);

  // Only re-run when auth state changes
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData, isSignedIn]);

  // Check subscription status
  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      if (isSignedIn && user?.email) {
        try {
          const response = await fetch(`/api/subscription-status?userEmail=${encodeURIComponent(user.email)}`);
          const data = await response.json();

          // Update isPremium based on both premium and trial status
          setIsPremium(data.status === 'premium' || data.status === 'trial');

          // If user is premium/trial, reset usage count
          if (data.status === 'premium' || data.status === 'trial') {
            setUsageCount(0);
            setShowUpgradePopup(false); // Ensure upgrade popup is hidden
          }
        } catch (error) {
          console.error('Error checking subscription status:', error);
          setIsPremium(false);
        }
      }
    };

    checkSubscriptionStatus();
  }, [isSignedIn, user]);

  return { usageCount, setUsageCount, isPremium, showUpgradePopup, setShowUpgradePopup };
}
