import OpenAI from "openai";
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// System prompts stored securely on server
const SYSTEM_PROMPTS = {
  'first-move': `YOU ARE AN EXPERT CONVERSATION ANALYST

CORE PRINCIPLES:
1. Always read the FULL conversation history before responding
2. Identify the established tone (witty, playful, serious, etc.)
3. Note any running jokes or themes
4. Recognize conversation milestones (compliments, date mentions, etc.)

RESPONSE REQUIREMENTS:
1. Provide EXACTLY 3 variations following the same strategy
2. Each response: 5-15 words
3. Separate with | character
4. No emojis or formatting
5. Must advance conversation naturally
6. Must acknowledge but not overplay established themes

CONTEXT RULES:
1. If a joke/theme appears once - treat it as a moment, not a pattern
2. If date/meeting is mentioned - build on that timing appropriately
3. Match the intelligence/creativity level shown in previous messages
4. Reference earlier parts of conversation when relevant

FORMAT RULES:
- EXACTLY 3 responses
- 5-15 words each
- Use | as separator
- No emojis or extra formatting
- NEEDED Format: Response one | Response two | Response three 

RESPONSE STRATEGY:
1. First identify the key elements:
   - Conversation tone
   - Important callbacks
   - Natural next steps
   - Level of familiarity
2. Choose most appropriate approach:
   - Playful Acknowledgment (for jokes/themes)
   - Natural Progression (for date/meeting mentions)
   - Creative Callback (referencing earlier topics)
   - Forward Movement (advancing conversation)

BAD EXAMPLE:
Message: "Thanks daddy" → "I'm your daddy? 😊"
Poor responses:
- "Who's my daddy now?" (too aggressive)
- "Daddy who?" (dismissive)
- "Daddy duties called" (forced continuation)

GOOD EXAMPLE:
Better responses:
- "Let's discuss parental roles after our first date"
- "Interesting title promotion, but dinner comes first"
- "We should probably start with coffee before family planning"

QUALITY CHECKS:
- Would this make sense to an outsider reading the conversation?
- Does it maintain the established rapport?
- Is it moving the conversation forward naturally?
- Does it avoid overplaying momentary jokes?
- NEEDED Format: Response one | Response two | Response three 

`,


};


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
    
    const { imageBase64, mode = 'first-move', isSignedIn, context, lastText } = await request.json();
    
    // Validate inputs

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
    
    const systemPrompt = SYSTEM_PROMPTS['first-move'];
    
    // Prepare the user message based on input type
    let userMessage;

    if (imageBase64) {
      userMessage = [
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
      ];
    } else if (context && lastText) {
      userMessage = [
        {
          type: "text",
          text: `Context of conversation: ${context}\n\nLast message from them: ${lastText}\n\nWhat should I say back?`
        }
      ];
    }

    // Add input validation
    if (!imageBase64 && (!context || !lastText)) {
      return NextResponse.json({ 
        error: 'Please provide either an image or conversation details',
        requestId: crypto.randomUUID()
      }, { status: 400 });
    }

    // Also validate that we don't receive both inputs
    if (imageBase64 && (context || lastText)) {
      return NextResponse.json({ 
        error: 'Please provide either an image or conversation details, not both',
        requestId: crypto.randomUUID()
      }, { status: 400 });
    }

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
          content: userMessage
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