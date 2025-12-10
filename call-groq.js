import dotenv from 'dotenv';
dotenv.config();
import Groq from 'groq-sdk';

(async () => {
  try {
    const key1 = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY;
    const key2 = process.env.GROQ_API_KEY_2;
    console.log('Keys present:', !!key1, !!key2);
    const client = new Groq({ apiKey: key1 });

    console.log('Calling Groq chat...');
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in a friendly way.' }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 64
    });

    console.log('Got response:', completion);
  } catch (err) {
    console.error('Error calling Groq:', err);
  }
})();
