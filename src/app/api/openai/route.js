import OpenAI from "openai";
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// System prompts stored securely on server
const SYSTEM_PROMPTS = {
  'first-move': `YOU ARE ULTIMATE FLIRT GPT

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

Remember: EXACTLY 3 responses, 5-15 words each, separated by |`,
};

// Add input validation
function validateInput(imageBase64, mode) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('Invalid image data');
  }
  if (!mode || !SYSTEM_PROMPTS[mode]) {
    throw new Error('Invalid mode');
  }
}

export async function POST(request) {
  try {
    const requestIP = request.headers.get('x-forwarded-for') || 'unknown';
    
    const { imageBase64, mode = 'first-move' } = await request.json();
    
    // Validate inputs
    validateInput(imageBase64, mode);
    
    const systemPrompt = SYSTEM_PROMPTS[mode];
    
    const response = await openai.chat.completions.create({
      model: "ft:gpt-4o-2024-08-06:personal:usepickup-3:Ax5yhop9",
      temperature: 1.0,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `What should I say back?`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ]
    });
    
    const result = response.choices[0].message.content.trim();
    return NextResponse.json({ 
      responses: [result],
      requestId: crypto.randomUUID()
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ 
      error: error.message,
      requestId: crypto.randomUUID()
    }, { status: 500 });
  }
} 