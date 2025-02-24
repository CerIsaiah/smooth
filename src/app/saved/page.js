"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const DeleteButton = ({ onDelete, isDeleting }) => (
  <button
    onClick={onDelete}
    disabled={isDeleting}
    className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
    title="Delete response"
  >
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M3 6h18"></path>
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
    </svg>
  </button>
);

export default function SavedResponses() {
  const [activeTab, setActiveTab] = useState('saved');
  const [responses, setResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showConfirmCancelModal, setShowConfirmCancelModal] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const storedUser = localStorage.getItem('smoothrizz_user');
    setUser(storedUser ? JSON.parse(storedUser) : null);
  }, []);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (user?.email) {
        try {
          const response = await fetch(`/api/subscription-status?userEmail=${user.email}`);
          const data = await response.json();
          setSubscriptionStatus(data.status);
          setSubscriptionDetails(data.details);
        } catch (error) {
          console.error('Error fetching subscription status:', error);
        }
      }
      setIsLoading(false);
    };

    fetchSubscriptionStatus();
  }, [user]);

  useEffect(() => {
    const fetchResponses = async () => {
      setIsLoading(true);
      if (user?.email) {
        // Fetch from database for signed-in users
        try {
          const response = await fetch('/api/saved-responses', {
            headers: {
              'x-user-email': user.email,
            },
          });
          const data = await response.json();
          
          if (response.ok) {
            setResponses(data.responses);
          } else {
            throw new Error(data.error);
          }
        } catch (error) {
          console.error('Error fetching saved responses:', error);
        }
      } else {
        // Get from localStorage for anonymous users
        const savedResponses = JSON.parse(localStorage.getItem('anonymous_saved_responses') || '[]');
        setResponses(savedResponses);
      }
      setIsLoading(false);
    };

    fetchResponses();
  }, [user]);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDelete = async (timestamp) => {
    if (!user?.email || deletingIds.has(timestamp)) return;

    try {
      setDeletingIds(prev => new Set([...prev, timestamp]));

      const response = await fetch(
        `/api/saved-responses?email=${encodeURIComponent(user.email)}&timestamp=${encodeURIComponent(timestamp)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete response');
      }

      // Update local state to remove the deleted response
      setResponses(prev => prev.filter(r => r.created_at !== timestamp));
    } catch (error) {
      console.error('Error deleting response:', error);
      alert('Failed to delete response. Please try again.');
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(timestamp);
        return newSet;
      });
    }
  };

  const handleSignOut = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.revoke();
    }
    localStorage.removeItem('smoothrizz_user');
    setUser(null);
    router.push('/');
  };

  const handleCheckout = async () => {
    try {
      if (!user?.id) {
        console.error('No user ID found');
        return;
      }

      const response = await fetch('/api/checkout_sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Error starting checkout. Please try again.');
    }
  };

  const handleCancelSubscription = async () => {
    setShowConfirmCancelModal(true);
  };

  const confirmCancellation = async () => {
    if (!user?.email) return;
    setShowConfirmCancelModal(false);
    
    try {
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userEmail: user.email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      // Refresh subscription status
      const statusResponse = await fetch(`/api/subscription-status?userEmail=${encodeURIComponent(user.email)}`);
      const statusData = await statusResponse.json();
      setSubscriptionStatus(statusData.status);
      setSubscriptionDetails(statusData.details);

      // Show success message in modal
      setShowCancelModal(true);
    } catch (error) {
      console.error('Error canceling subscription:', error);
      setShowCancelModal(true);
    }
  };

  // Helper function to format remaining time
  const formatTimeRemaining = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return days;
  };

  const renderSubscriptionStatus = () => {
    if (!subscriptionDetails) return null;

    const trialDaysLeft = subscriptionDetails.isTrialActive ? 
      formatTimeRemaining(subscriptionDetails.trialEndsAt) : null;
    
    const subscriptionDaysLeft = subscriptionDetails.subscriptionEndsAt ? 
      formatTimeRemaining(subscriptionDetails.subscriptionEndsAt) : null;

    return (
      <div className="bg-gradient-to-r from-gray-50 to-pink-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Subscription Status</h3>
        <div className="flex items-center justify-between">
          <div>
            {subscriptionStatus === 'trial' ? (
              <>
                <p className="flex items-center gap-2 text-pink-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Trial Active
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {trialDaysLeft} days remaining in trial
                </p>
              </>
            ) : subscriptionStatus === 'premium' ? (
              <>
                <p className="flex items-center gap-2 text-pink-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Premium Member
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Enjoying unlimited access!
                </p>
              </>
            ) : subscriptionStatus === 'canceling' ? (
              <>
                <p className="flex items-center gap-2 text-orange-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Premium (Canceling)
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Access until {new Date(subscriptionDetails.subscriptionEndsAt).toLocaleDateString()}
                  {subscriptionDaysLeft && ` (${subscriptionDaysLeft} days remaining)`}
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-600">Free Plan</p>
                <p className="text-sm text-gray-500 mt-1">
                  Upgrade to unlock all premium features
                </p>
              </>
            )}
          </div>
          
          {(subscriptionStatus === 'premium' || subscriptionStatus === 'trial') ? (
            <button
              onClick={handleCancelSubscription}
              className="px-4 py-2 rounded-full text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors shadow-sm hover:shadow flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              Cancel Subscription
            </button>
          ) : subscriptionStatus === 'canceling' ? (
            <div className="text-sm text-gray-500">
              Cancellation pending
            </div>
          ) : (
            <button
              onClick={handleCheckout}
              className="px-4 py-2 rounded-full text-sm font-medium text-white bg-pink-500 hover:bg-pink-600 transition-colors shadow-sm hover:shadow flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Upgrade to Premium
            </button>
          )}
        </div>
      </div>
    );
  };

  const ConfirmCancelModal = ({ isOpen, onClose, onConfirm, isTrialActive, trialEndsAt }) => {
    if (!isOpen) return null;

    const endDate = new Date(trialEndsAt).toLocaleDateString();

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Cancel Subscription?</h3>
            {isTrialActive ? (
              <p className="mt-2 text-sm text-gray-500">
                If you cancel now, you will lose access to premium features on {endDate}.
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-500">
                Are you sure you want to cancel your subscription? You will still have access until the end of your current billing period.
              </p>
            )}
            <div className="mt-4 flex space-x-3">
              <button
                onClick={onConfirm}
                className="flex-1 inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm"
              >
                Yes, Cancel
              </button>
              <button
                onClick={onClose}
                className="flex-1 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:text-sm"
              >
                Keep Subscription
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const CancelModal = ({ isOpen, onClose, success, isTrialActive, trialEndsAt }) => {
    if (!isOpen) return null;

    const endDate = new Date(trialEndsAt).toLocaleDateString();

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            {success ? (
              <>
                <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Subscription Cancelled</h3>
                {isTrialActive ? (
                  <p className="mt-2 text-sm text-gray-500">
                    You will lose access to premium features on {endDate}.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">
                    Your subscription will remain active until the end of the current billing period.
                  </p>
                )}
              </>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Error</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Failed to cancel subscription. Please try again later.
                </p>
              </>
            )}
            <button
              onClick={onClose}
              className="mt-4 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-pink-600 text-base font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link 
              href="/"
              className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-600 bg-clip-text text-transparent"
            >
              SmoothRizz
            </Link>
            <Link
              href="/"
              className="text-gray-600 hover:text-gray-900 text-sm flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Generator
            </Link>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-8 -mb-px">
            <button
              onClick={() => setActiveTab('saved')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'saved'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              Saved Responses
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'profile'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Profile
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {activeTab === 'saved' ? (
          // Saved Responses Tab
          <div className="space-y-4">
            {responses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg mb-4">No saved responses yet!</p>
                <Link
                  href="/"
                  className="px-6 py-3 rounded-full text-white hover:opacity-90 transition inline-block"
                  style={{ backgroundColor: "#FE3C72" }}
                >
                  Generate Some Responses
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {responses.map((item) => (
                  <div 
                    key={item.created_at} 
                    className="bg-white rounded-xl p-6 shadow-sm relative hover:shadow-md transition-shadow"
                  >
                    <DeleteButton 
                      onDelete={() => handleDelete(item.created_at)}
                      isDeleting={deletingIds.has(item.created_at)}
                    />
                    <div className="pr-10">
                      <p className="text-gray-800 text-lg mb-3">{item.response}</p>
                      {(item.context || item.last_message) && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          {item.context && (
                            <p className="text-sm text-gray-500 mb-2">
                              <span className="font-medium">Context:</span> {item.context}
                            </p>
                          )}
                          {item.last_message && (
                            <p className="text-sm text-gray-500">
                              <span className="font-medium">Last message:</span> {item.last_message}
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Saved on {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // Profile Tab
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Profile Header */}
            <div className="bg-gradient-to-r from-pink-500 to-rose-600 px-6 py-8 text-white">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-10 h-10 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{user?.name || 'Anonymous User'}</h2>
                  <p className="text-pink-100">{user?.email || 'Not signed in'}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Subscription Status */}
              {renderSubscriptionStatus()}

              {/* Sign Out Button */}
              <div className="border-t border-gray-100 pt-6">
                <button
                  onClick={handleSignOut}
                  className="w-full sm:w-auto px-6 py-3 rounded-full text-white bg-gray-900 hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmCancelModal 
        isOpen={showConfirmCancelModal}
        onClose={() => setShowConfirmCancelModal(false)}
        onConfirm={confirmCancellation}
        isTrialActive={subscriptionDetails?.isTrialActive}
        trialEndsAt={subscriptionDetails?.trialEndsAt}
      />
      
      <CancelModal 
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        success={true}
        isTrialActive={subscriptionDetails?.isTrialActive}
        trialEndsAt={subscriptionDetails?.trialEndsAt}
      />
    </div>
  );
} 