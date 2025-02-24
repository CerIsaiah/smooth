import OpenAI from "openai";
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ANONYMOUS_USAGE_LIMIT, SIGNED_IN_USAGE_LIMIT, RESPONSES_PER_GENERATION } from '@/app/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// System prompts stored securely on server
const SYSTEM_PROMPTS = {
  'first-move': `"""
Returnn EXACTLY 10 responses of the following styles and format for flirty but not too forward conversation continuation following these requirements:
INSTRUCTIONS###
1. ANALYZE CONTEXT:
   - IMPORTANT! You are responding as the person on the right side of the conversation
   - Read FULL conversation history
   - Identify consistent tone between the you as the responder and the person on the left (playful/serious/flirty)
   - Note SINGLE-USE references (treat single mentions as moments, not patterns)
   - Track relationship milestones (dates/complaints/intimacy levels)

2. AVAILABLE STYLES:
    - Enthusiastic + pivot
    - Conditional tease
    - Helpful tease
    - Direct ask
    - Absurd commitment
    - Travel pivot
    - Interest escalation
    - Fake urgency
    - Absurd availability
    - Roleplay
    - Role tease
    - Mock annoyance

3. RESPONSE CRITERIA:
   - 5-15 words per response
   - Maintain natural progression
   - Acknowledge context without over-repetition
   - Match established familiarity level
   - Prioritize: Playful > Creative > Forward > Neutral

2. FORMAT REQUIREMENTS:
   - EXACTLY 10 responses 
   - No emojis
   - 5 different styles 2 of each
   - Return as array of strings
   - No emojis
   - [[...], [...],  [...],  [...],  [...],  [...],  [...],  [...],[...],[...] ]
   - Avoid: forced continuations, aggression, dismissiveness

STRATEGY EXAMPLES###
My input: "Thanks daddy" → Their input: "I'm your daddy?"
Acceptable Responses:
["Ig we'll see after the dinner", "Or I can take on the role, if you want", [...],  [...],  [...],  [...],  [...],  [...],  [...], "Hmm, you'll have to earn that title", ]


OUTPUT TEMPLATE###
Return exactly 10 responses in an array format suitable for JSON parsing.
Return exactly 10 responses in an array format suitable for JSON parsing.
Return exactly 10 responses in an array format suitable for JSON parsing.

""" 
`}

async function checkAndUpdateSwipeCount(ip, supabase) {
  try {
    console.log('Debug - Checking Swipe Count:', ip);
    
    const { data, error } = await supabase
      .from('ip_usage')
      .select('*')
      .eq('ip_address', ip)
      .single();

    console.log('Debug - Swipe Count Result:', {
      data,
      error,
      timestamp: new Date().toISOString()
    });

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const swipeCount = data?.usage_count || 0;

    // Check if swipe limit reached
    if (swipeCount >= ANONYMOUS_USAGE_LIMIT) {
      return { limitReached: true, swipeCount };
    }

    // Update the swipe count
    const { error: updateError } = await supabase
      .from('ip_usage')
      .upsert({
        ip_address: ip,
        usage_count: swipeCount + 1,
        last_used: new Date().toISOString()
      }, {
        onConflict: 'ip_address'
      });

    console.log('Debug - Swipe Count Update:', {
      success: !updateError,
      newCount: swipeCount + 1,
      error: updateError,
      timestamp: new Date().toISOString()
    });

    if (updateError) throw updateError;

    return { limitReached: false, swipeCount: swipeCount + 1 };
  } catch (error) {
    console.error('Error in checkAndUpdateSwipeCount:', error);
    throw error;
  }
}

export async function POST(request) {
  try {
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const { imageBase64, mode = 'first-move', isSignedIn, context, lastText } = await request.json();
    
    console.log('Debug - OpenAI Request:', {
      ip: requestIP,
      isSignedIn,
      timestamp: new Date().toISOString()
    });

    // Check anonymous usage limit if not signed in
    if (!isSignedIn) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Initialize usage record if it doesn't exist
      const { data: existingData } = await supabase
        .from('ip_usage')
        .select('usage_count')
        .eq('ip_address', requestIP)
        .single();

      if (!existingData) {
        await supabase
          .from('ip_usage')
          .insert([
            {
              ip_address: requestIP,
              usage_count: 0,
              last_used: new Date().toISOString()
            }
          ]);
      }

      const { limitReached, swipeCount } = await checkAndUpdateSwipeCount(requestIP, supabase);
      
      console.log('Debug - Swipe Check Result:', {
        ip: requestIP,
        swipeCount,
        limitReached,
        ANONYMOUS_USAGE_LIMIT,
        timestamp: new Date().toISOString()
      });

      if (limitReached) {
        return NextResponse.json({ 
          error: 'Anonymous usage limit reached. Please sign in to continue.',
          requestId: crypto.randomUUID()
        }, { status: 403 });
      }
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
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "responses_format",
          schema: {
            type: "object",
            properties: {
              responses: {
                type: "array",
                items: {
                  type: "string"
                },
              }
            },
            required: ["responses"],
            additionalProperties: false
          },
          strict: true
        }
      }
    });

    const message = response.choices[0].message;

    // Check for refusal
    if (message.refusal) {
      throw new Error(`Model refused to generate response: ${message.refusal}`);
    }

    // Parse and validate responses
    const parsedResponses = JSON.parse(message.content).responses;
    
    if (!Array.isArray(parsedResponses) || parsedResponses.length !== 10) {
      throw new Error(`Invalid number of responses: Expected 10, got ${parsedResponses.length}`);
    }

    return NextResponse.json({
      responses: parsedResponses,
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