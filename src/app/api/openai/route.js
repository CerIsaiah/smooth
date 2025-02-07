import OpenAI from "openai";
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
7. YOU ARE RESPONDING TO THEIR MESSAGES, WHICH ARE ON THE LEFT. Consider the entire conversation history before responding.
8. Make sure the responses are revelant and make sense

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
  'mid-game': `YOU ARE ULTIMATE FLIRT GPT

FORMAT REQUIREMENTS:
1. You MUST provide EXACTLY 3 different responses
2. Each response MUST be 5-15 words
3. Figure out the best style to respond with then create 3 different variations
4. Responses MUST be separated by the | character
5. DO NOT number your responses or add any extra formatting
6. No emoji's allowed
7. YOU ARE RESPONDING TO THEIR MESSAGES, WHICH ARE ON THE LEFT. Consider the entire conversation history before responding.
8. Make sure the responses are revelant and make sense

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

Your goal: Secure date, get number, maintain teasing conversation. Always include something they can reply to.`,
  'end-game': `YOU ARE ULTIMATE FLIRT GPT

FORMAT REQUIREMENTS:
1. You MUST provide EXACTLY 3 different responses
2. Each response MUST be 5-15 words
3. Figure out the best style to respond with then create 3 different variations
4. Responses MUST be separated by the | character
5. DO NOT number your responses or add any extra formatting
6. No emoji's allowed
7. YOU ARE RESPONDING TO THEIR MESSAGES, WHICH ARE ON THE LEFT. Consider the entire conversation history before responding.
8. Make sure the responses are revelant and make sense

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

Your goal: Secure date, get number, maintain teasing conversation. Always include something they can reply to.`,
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

// Add new function to check IP usage
async function checkIPUsage(ip, supabase) {
  const { data, error } = await supabase
    .from('ip_usage')
    .select('usage_count')
    .eq('ip_address', ip)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
    throw error;
  }

  return data?.usage_count || 0;
}

// Add new function to update IP usage
async function updateIPUsage(ip, currentCount, supabase) {
  const { error } = await supabase
    .from('ip_usage')
    .upsert({
      ip_address: ip,
      usage_count: currentCount + 1,
      last_used: new Date().toISOString()
    }, {
      onConflict: 'ip_address'
    });

  if (error) throw error;
}

export async function POST(request) {
  try {
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    const { imageBase64, mode = 'first-move', isSignedIn } = await request.json();
    
    // Validate inputs
    validateInput(imageBase64, mode);

    // Only check IP usage for non-signed-in users
    if (!isSignedIn) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const currentUsage = await checkIPUsage(requestIP, supabase);
      
      if (currentUsage >= 3) {
        return NextResponse.json({ 
          error: 'Anonymous usage limit reached. Please sign in to continue.',
          requestId: crypto.randomUUID()
        }, { status: 403 });
      }

      // Update IP usage count
      await updateIPUsage(requestIP, currentUsage, supabase);
    }
    
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