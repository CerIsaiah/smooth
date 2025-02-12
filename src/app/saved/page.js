"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  const [responses, setResponses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is logged in
    const storedUser = localStorage.getItem('smoothrizz_user');
    setUser(storedUser ? JSON.parse(storedUser) : null);
    setIsLoading(false);
  }, []);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#FE3C72" }}>
            {user ? 'Your Saved Responses' : 'Temporary Saved Responses'}
          </h1>
          <div className="flex gap-4">
            {!user && (
              <p className="text-sm text-gray-500 max-w-xs">
                Sign in to permanently save your responses
              </p>
            )}
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 rounded-full text-white hover:opacity-90 transition"
              style={{ backgroundColor: "#FE3C72" }}
            >
              Back to Generator
            </button>
          </div>
        </div>

        {responses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">No saved responses yet!</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 rounded-full text-white hover:opacity-90 transition"
              style={{ backgroundColor: "#FE3C72" }}
            >
              Generate Some Responses
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {responses.map((item, index) => (
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
    </div>
  );
} 