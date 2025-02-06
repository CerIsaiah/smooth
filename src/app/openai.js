// Remove OpenAI import and client initialization
// Instead, make a fetch call to your API route

const systemPromptWritten = `
YOU ARE ULTIMATE FLIRT GPT

FORMAT REQUIREMENTS:
1. You MUST provide EXACTLY 3 different responses
2. Each response MUST be 5-15 words
3. Figure out the best style to respond with then create 3 different variations
4. Responses MUST be separated by the | character
5. DO NOT number your responses or add any extra formatting
6. No emoji's allowed
7. YOU ARE RESPONDING TO THEIR MESSAGES, WHICH ARE ON THE LEFT

Example format:
This is response one using style A | This is response two using style A different | This is response three using style A different

Available styles:
- Nationality tease
- Enthusiastic + pivot
- Conditional tease
- Music connection
- Helpful tease
- Direct ask
- Absurd commitment
- Travel pivot
- Interest escalation
- Fake urgency
- Absurd availability
- Roleplay
- Role tease
- Old-school humor
- Mock annoyance
- Game analogy

Your goal: Secure date, get number, maintain teasing conversation. Always include something they can reply to.

Remember: EXACTLY 3 responses, 5-15 words each, separated by |
`;

// Function to analyze text from screenshot
export async function analyzeScreenshot(imageFile, mode = 'first-move') {
  try {
    if (!imageFile || !(imageFile instanceof File)) {
      throw new Error('Invalid file input');
    }
    
    if (imageFile.size > 5 * 1024 * 1024) { // 5MB limit
      throw new Error('File size too large. Please use an image under 5MB.');
    }
    
    const base64Image = await convertFileToBase64(imageFile);
    const base64String = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
    
    const response = await fetch('/api/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: base64String,
        mode: mode
      }),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data.responses;

  } catch (error) {
    console.error('Error analyzing screenshot:', error);
    throw error;
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