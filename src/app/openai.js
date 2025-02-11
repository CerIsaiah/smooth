export async function analyzeScreenshot(file, mode, isSignedIn, context = '', lastText = '') {
  let requestBody = {
    mode,
    isSignedIn
  };

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
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific error cases
      switch (response.status) {
        case 403:
          throw new Error('Anonymous usage limit reached. Please sign in to continue.');
        case 429:
          throw new Error('Rate limit exceeded. Please try again later.');
        case 413:
          throw new Error('Image file too large. Please use a smaller image.');
        default:
          throw new Error(data.error || 'An error occurred. Please try again.');
      }
    }

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