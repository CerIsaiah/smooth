"use client";
import { useEffect } from "react";
import { ANONYMOUS_USAGE_LIMIT } from '../constants';

/**
 * Stripe checkout entry point for the home page (trial banner, upgrade popup)
 * plus the redirect-back handling after Stripe returns to the site.
 */
export function useStripeCheckout({ isSignedIn, user, setUsageCount }) {
  const handleCheckout = async () => {
    try {
      if (!isSignedIn || !user?.email) {
        setUsageCount(ANONYMOUS_USAGE_LIMIT + 1);
        return;
      }

      const response = await fetch('/api/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: user.email.toLowerCase().trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Error starting checkout. Please try again.');
    }
  };

  // Handle redirect back from Stripe
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);

    if (query.get('success')) {
      // Add Google Ads conversion tracking
      if (typeof window !== 'undefined' && window.gtag) {
        gtag('event', 'conversion', {
          'send_to': 'AW-16615505567/rdXeCPDjlqsaEJ_98fI9'
        });
      }
    }
  }, []);

  return { handleCheckout };
}
