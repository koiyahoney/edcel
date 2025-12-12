import Groq from 'groq-sdk';
import { getAvailableClient, markKeyLimited } from './groq-client.js';

const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// System context about SKSU
const SKSU_CONTEXT = `You are an AI assistant for Sultan Kudarat State University (SKSU) Student Body Organization.

SKSU Information:
- Vision: "A premier state university in Southeast Asia"
- Mission: Providing quality education, research, and community service
- Location: Tacurong City, Sultan Kudarat, Philippines
- Founded: 1983

You help students with:
- Academic policies and procedures
- Student services and welfare
- University rules and regulations
- Campus life and activities
- General inquiries about SKSU

Guidelines:
- Be helpful, friendly, and professional
- Provide accurate information about SKSU
- If you don't know something, admit it and suggest contacting the appropriate office
- Keep responses concise and clear
- Use a conversational but respectful tone`;

/**
 * Chat with AI using Groq
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context (optional)
 * @returns {Promise<string>} AI response
 */
async function chatWithAI(userMessage, conversationHistory = []) {
  try {
    // Prepare messages
    const messages = [
      { role: 'system', content: SKSU_CONTEXT },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    // Attempt using available keys with simple failover
    const maxAttempts = Math.max(1, (process.env.GROQ_MAX_ATTEMPTS ? parseInt(process.env.GROQ_MAX_ATTEMPTS) : 3));
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const available = getAvailableClient();
      if (!available) {
        const debugInfo = `(Env vars: GROQ_API_KEYS=${!!process.env.GROQ_API_KEYS}, GROQ_API_KEY=${!!process.env.GROQ_API_KEY})`;
        return `The AI service is currently unavailable (no API keys). ${debugInfo} Please try again later or use FAQ mode.`;
      }

      const { client, keyIndex } = available;

      try {
        const completion = await client.chat.completions.create({
          messages,
          model: process.env.GROQ_MODEL || DEFAULT_MODEL,
          temperature: 0.7,
          max_tokens: parseInt(process.env.GROQ_MAX_TOKENS || '1024'),
          top_p: 0.9,
          stream: false
        });

        return completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
      } catch (error) {
        lastError = error;
        console.error('❌ Groq AI Error (attempt', attempt + 1, '):', error.message || error);

        // Rate limited or quota errors -> mark key limited and retry
        if (error?.status === 429 || /rate limit|quota|too many requests/i.test(error?.message || '')) {
          try {
            markKeyLimited(keyIndex, parseInt(process.env.GROQ_KEY_COOLDOWN_SECONDS || '3600'));
          } catch (e) {
            console.warn('Failed to mark key limited:', e.message || e);
          }
          // continue to next available key
          continue;
        }

        // Authentication issues
        if (error?.status === 401 || /invalid api key|unauthorized/i.test(error?.message || '')) {
          return 'AI service authentication error. Please check the API key configuration.';
        }

        // Other errors: break and return friendly message
        return 'An error occurred while contacting the AI service. Please try again later or use FAQ mode.';
      }
    }

    console.error('❌ Groq AI All attempts failed:', lastError);
    return 'The AI service is currently unavailable due to rate limits or errors. Please try again later.';
  } catch (error) {
    console.error('❌ Groq AI Error:', error.message);
    
    if (error.status === 429) {
      return 'I apologize, but the AI service is currently experiencing high demand. Please try again in a moment or switch to FAQ mode for instant answers.';
    }
    
    if (error.status === 401) {
      return 'AI service configuration error. Please contact the administrator.';
    }
    
    throw error;
  }
}

/**
 * Get a streaming response from AI (for future implementation)
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<AsyncIterable>} Stream of AI response chunks
 */
async function streamChatWithAI(userMessage, conversationHistory = []) {
  const messages = [
    {
      role: 'system',
      content: SKSU_CONTEXT
    },
    ...conversationHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];
  // Attempt to open a streaming completion with failover
  const available = getAvailableClient();
  if (!available) {
    throw new Error('No available AI API keys for streaming');
  }

  const { client, keyIndex } = available;

  try {
    const stream = await client.chat.completions.create({
      messages,
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      temperature: 0.7,
      max_tokens: parseInt(process.env.GROQ_MAX_TOKENS || '1024'),
      top_p: 0.9,
      stream: true
    });

    return stream;
  } catch (err) {
    // Mark key limited on rate limit and rethrow for caller to handle
    if (err?.status === 429) {
      markKeyLimited(keyIndex, parseInt(process.env.GROQ_KEY_COOLDOWN_SECONDS || '3600'));
    }
    throw err;
  }
}

export { chatWithAI, streamChatWithAI };
