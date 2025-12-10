import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    const { chatWithAI } = await import('./groq-ai.js');
    const res = await chatWithAI('Hello from test script');
    console.log('AI response:', res);
  } catch (err) {
    console.error('Test error:', err);
  }
})();
