import Groq from 'groq-sdk';

// Build API keys list from environment variables
const keys = [];
if (process.env.GROQ_API_KEYS) {
  // comma separated
  keys.push(...process.env.GROQ_API_KEYS.split(',').map(k => k.trim()).filter(Boolean));
}

// Allow legacy single key names
if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);

// Deduplicate while preserving order
const uniqueKeys = [...new Set(keys)];

console.log('DEBUG: Loading Groq Keys...');
console.log('DEBUG: GROQ_API_KEYS present:', !!process.env.GROQ_API_KEYS);
console.log('DEBUG: GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);
console.log('DEBUG: Found keys count:', uniqueKeys.length);
if (uniqueKeys.length > 0) {
    console.log('DEBUG: First key starts with:', uniqueKeys[0].substring(0, 10) + '...');
}

if (uniqueKeys.length === 0) {
  console.warn('⚠️ No Groq API keys found in environment (GROQ_API_KEYS/GROQ_API_KEY_1/GROQ_API_KEY). AI mode will be disabled.');
}

const clients = uniqueKeys.map(k => new Groq({ apiKey: k }));

// key status tracking
const keyStatus = uniqueKeys.map(() => ({ limited: false, resetTime: null }));
let currentIndex = 0;

function _resetIfExpired(index) {
  const status = keyStatus[index];
  if (status.limited && status.resetTime && Date.now() > status.resetTime) {
    status.limited = false;
    status.resetTime = null;
  }
}

function getAvailableClient() {
  if (clients.length === 0) return null;

  // Check and reset expired statuses
  for (let i = 0; i < keyStatus.length; i++) {
    _resetIfExpired(i);
  }

  // Try starting from currentIndex
  for (let i = 0; i < clients.length; i++) {
    const idx = (currentIndex + i) % clients.length;
    if (!keyStatus[idx].limited) {
      currentIndex = idx; // rotate
      return { client: clients[idx], keyIndex: idx };
    }
  }

  return null; // no available key
}

function markKeyLimited(index, seconds = 3600) {
  if (typeof index !== 'number' || index < 0 || index >= keyStatus.length) return;
  keyStatus[index].limited = true;
  keyStatus[index].resetTime = Date.now() + seconds * 1000;
  console.warn(`⚠️ Groq API key #${index + 1} marked limited until ${new Date(keyStatus[index].resetTime).toISOString()}`);
}

function getKeysInfo() {
  return uniqueKeys.map((k, i) => ({ index: i, limited: keyStatus[i].limited, resetTime: keyStatus[i].resetTime }));
}

export { getAvailableClient, markKeyLimited, getKeysInfo };
