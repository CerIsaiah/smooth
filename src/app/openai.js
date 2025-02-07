export async function analyzeScreenshot(file, mode, isSignedIn, context = '', lastText = '') {
  let requestBody = {
    mode,
    isSignedIn
  };

  if (file) {
    // Convert file to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    requestBody.imageBase64 = base64;
  } else {
    requestBody.context = context;
    requestBody.lastText = lastText;
  }

  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  
  if (!response.ok) {
    // Throw the exact error message from the backend
    throw new Error(data.error);
  }

  return data.responses;
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