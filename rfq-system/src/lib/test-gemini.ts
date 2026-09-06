import { GoogleGenerativeAI } from '@google/generative-ai';

// Test script to verify Gemini API key works
async function testGeminiAPI() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable not set');
    console.log('Add it to your .env.local file');
    process.exit(1);
  }

  console.log('🔑 API Key found:', apiKey.substring(0, 10) + '...');
  console.log('🧪 Testing Gemini API connection...\n');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are a helpful assistant.',
      generationConfig: {
        temperature: 0.7,
      },
    });

    const prompt = 'Say "Hello from Gemini!" if you can hear me.';
    console.log('📤 Sending test prompt:', prompt);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log('\n✅ Success! Gemini API is working!\n');
    console.log('📥 Response:', text);
    console.log('\n📊 Stats:');
    console.log('- Prompt length:', prompt.length, 'chars');
    console.log('- Response length:', text.length, 'chars');
    console.log('- Estimated tokens:', Math.ceil((prompt.length + text.length) / 4));

    console.log('\n🎉 Your Gemini API key is configured correctly!');
    console.log('🚀 You can now use the RFQ system with Gemini AI.');
  } catch (error) {
    console.error('\n❌ Gemini API test failed:');
    console.error(error);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Verify your API key at: https://aistudio.google.com/apikey');
    console.log('2. Check your GEMINI_API_KEY in .env.local');
    console.log('3. Ensure the API key has proper permissions');
    process.exit(1);
  }
}

testGeminiAPI();
