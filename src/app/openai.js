/**
 * OpenAI Client Utilities
 * 
 * This file provides client-side utilities for interacting with OpenAI services.
 * 
 * Main Features:
 * - Image to base64 conversion
 * - API request handling
 * - Error handling and formatting
 * - Response processing
 * 
 * Dependencies:
 * - None (uses built-in fetch API)
 * 
 * Side Effects:
 * - Converts files to base64
 * - Makes API calls to /api/openai endpoint
 * 
 * Connected Files:
 * - src/app/api/openai/route.js: Server endpoint
 * - src/app/responses/page.js: Uses these utilities
 * - src/app/page.js: Uses for initial response generation
 */

export async function analyzeScreenshot(file, mode, isSignedIn, context = '', lastText = '') {
  let requestBody = {
    mode,
    isSignedIn
  };

  // Get user email from localStorage
  const storedUser = localStorage.getItem('smoothrizz_user');
  const userEmail = storedUser ? JSON.parse(storedUser).email : null;

  if (file) {
    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      requestBody.imageBase64 = base64;
    } catch (error) {
      throw new Error('Error processing image. Please try again.');
    }
  } else if (context || lastText) {
    requestBody.context = context;
    requestBody.lastText = lastText;
  } else {
    throw new Error('No input provided. Please provide an image or text.');
  }

  try {
    const response = await fetch('/api/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userEmail && { 'x-user-email': userEmail }),
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific error cases
      switch (response.status) {
        case 403:
          throw new Error(data.error || 'Usage limit reached. Please try again later.');
        case 429:
          throw new Error('Rate limit exceeded. Please try again later.');
        case 413:
          throw new Error('Image file too large. Please use a smaller image.');
        default:
          throw new Error(data.error || 'An error occurred. Please try again.');
      }
    }

    // The response is now guaranteed to be an array of exactly 10 strings
    return data.responses;
  } catch (error) {
    // Re-throw with more specific error message if possible
    throw new Error(error.message || 'Failed to analyze input. Please try again.');
  }
}

// Helper function to convert File to base64
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}