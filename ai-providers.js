import { GoogleGenerativeAI } from '@google/generative-ai';
import { CohereClient } from 'cohere-ai';
import Groq from 'groq-sdk';

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

// Provider configurations
const providers = [];

// Initialize Gemini if key exists
if (process.env.GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    providers.push({
      name: 'gemini',
      priority: 1,
      client: genAI,
      limited: false,
      resetTime: null
    });
    console.log('✅ Gemini provider initialized');
  } catch (e) {
    console.error('❌ Failed to initialize Gemini:', e.message);
  }
}

// Initialize Cohere if key exists
if (process.env.COHERE_API_KEY) {
  try {
    const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
    providers.push({
      name: 'cohere',
      priority: 2,
      client: cohere,
      limited: false,
      resetTime: null
    });
    console.log('✅ Cohere provider initialized');
  } catch (e) {
    console.error('❌ Failed to initialize Cohere:', e.message);
  }
}

// Initialize Groq if key exists
if (process.env.GROQ_API_KEY || process.env.GROQ_API_KEYS) {
  try {
    const key = process.env.GROQ_API_KEY || process.env.GROQ_API_KEYS?.split(',')[0];
    if (key) {
      const groq = new Groq({ apiKey: key });
      providers.push({
        name: 'groq',
        priority: 3,
        client: groq,
        limited: false,
        resetTime: null
      });
      console.log('✅ Groq provider initialized');
    }
  } catch (e) {
    console.error('❌ Failed to initialize Groq:', e.message);
  }
}

console.log(`🤖 AI Providers available: ${providers.map(p => p.name).join(', ') || 'NONE'}`);

function markProviderLimited(providerName, seconds = 3600) {
  const provider = providers.find(p => p.name === providerName);
  if (provider) {
    provider.limited = true;
    provider.resetTime = Date.now() + seconds * 1000;
    console.warn(`⚠️ ${providerName} marked limited until ${new Date(provider.resetTime).toISOString()}`);
  }
}

function resetExpiredProviders() {
  const now = Date.now();
  for (const provider of providers) {
    if (provider.limited && provider.resetTime && now > provider.resetTime) {
      provider.limited = false;
      provider.resetTime = null;
      console.log(`✅ ${provider.name} provider reset`);
    }
  }
}

function getAvailableProviders() {
  resetExpiredProviders();
  return providers
    .filter(p => !p.limited)
    .sort((a, b) => a.priority - b.priority);
}

// Gemini chat function
async function chatWithGemini(client, userMessage, conversationHistory = []) {
  // Using flash-lite for lower quota usage
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
  
  // Build prompt with context
  const fullPrompt = conversationHistory.length > 0 
    ? `${SKSU_CONTEXT}\n\nConversation so far:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nUser: ${userMessage}\n\nAssistant:`
    : `${SKSU_CONTEXT}\n\nUser: ${userMessage}\n\nAssistant:`;

  const result = await model.generateContent(fullPrompt);
  return result.response.text();
}

// Cohere chat function
async function chatWithCohere(client, userMessage, conversationHistory = []) {
  const chatHistory = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
    message: msg.content
  }));

  // Using smaller 7B model for lower quota usage
  const response = await client.chat({
    message: userMessage,
    preamble: SKSU_CONTEXT,
    chatHistory: chatHistory,
    model: 'command-r7b-12-2024'
  });

  return response.text;
}

// Groq chat function
async function chatWithGroq(client, userMessage, conversationHistory = []) {
  const messages = [
    { role: 'system', content: SKSU_CONTEXT },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const completion = await client.chat.completions.create({
    messages,
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    temperature: 0.7,
    max_tokens: 1024,
    top_p: 0.9
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * Chat with AI using multiple providers with automatic failover
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context (optional)
 * @returns {Promise<string>} AI response
 */
async function chatWithAI(userMessage, conversationHistory = []) {
  const availableProviders = getAvailableProviders();

  if (availableProviders.length === 0) {
    return 'The AI service is currently unavailable. All providers are rate-limited or not configured. Please try again later or use FAQ mode.';
  }

  for (const provider of availableProviders) {
    try {
      console.log(`🤖 Trying ${provider.name}...`);
      let response;

      switch (provider.name) {
        case 'gemini':
          response = await chatWithGemini(provider.client, userMessage, conversationHistory);
          break;
        case 'cohere':
          response = await chatWithCohere(provider.client, userMessage, conversationHistory);
          break;
        case 'groq':
          response = await chatWithGroq(provider.client, userMessage, conversationHistory);
          break;
        default:
          continue;
      }

      if (response) {
        console.log(`✅ ${provider.name} responded successfully`);
        return response;
      }
    } catch (error) {
      console.error(`❌ ${provider.name} error:`, error.message || error);

      // Check for rate limiting
      if (
        error?.status === 429 ||
        error?.statusCode === 429 ||
        /rate limit|quota|too many requests|resource exhausted/i.test(error?.message || '')
      ) {
        markProviderLimited(provider.name, 3600);
        continue;
      }

      // Check for auth errors - don't retry this provider
      if (
        error?.status === 401 ||
        error?.statusCode === 401 ||
        /invalid.*key|unauthorized|authentication/i.test(error?.message || '')
      ) {
        markProviderLimited(provider.name, 86400); // 24 hours for auth errors
        continue;
      }

      // For other errors, try next provider
      continue;
    }
  }

  return 'I apologize, but all AI services are currently unavailable. Please try again later or use FAQ mode for instant answers.';
}

/**
 * Get information about configured providers
 */
function getProvidersInfo() {
  return providers.map(p => ({
    name: p.name,
    priority: p.priority,
    limited: p.limited,
    resetTime: p.resetTime
  }));
}

export { chatWithAI, getProvidersInfo, SKSU_CONTEXT };
