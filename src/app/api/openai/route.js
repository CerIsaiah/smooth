import OpenAI from "openai";
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(request) {
  try {
    const { imageBase64, systemPrompt } = await request.json();
    
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
    return NextResponse.json({ responses: [result] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 