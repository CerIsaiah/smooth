"use client";
import React, { useState, useEffect } from 'react';
import { getFormattedTimeUntilReset } from '@/utils/usageTracking';

export function UpgradePopup({ onClose, handleCheckout }) {
  const [timeUntilReset, setTimeUntilReset] = useState('');

  useEffect(() => {
    const updateTimeUntilReset = () => {
      setTimeUntilReset(getFormattedTimeUntilReset());
    };

    updateTimeUntilReset();
    const interval = setInterval(updateTimeUntilReset, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  const handleFreePlan = () => {
    onClose();
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[60] p-4">
      <div className="bg-white p-6 rounded-xl w-full max-w-md mx-auto relative">
        <h2 className="text-2xl font-bold mb-4">Upgrade to Premium</h2>
        
        {/* Benefits section */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Unlimited responses daily</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Learns from right swipes</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Priority support</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={handleCheckout}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Free 3 Day Trial - then $4.99/month
          </button>
          
          <button
            onClick={handleFreePlan}
            className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Continue with Free Plan
            <div className="text-sm text-gray-500 mt-1">
              Next reset in {timeUntilReset}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
} 