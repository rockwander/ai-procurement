import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('🔑 API Key:', apiKey.substring(0, 10) + '...');
  console.log('📋 Fetching available models...\n');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try to make a simple request to test the API key
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent('Hello');

    console.log('✅ API key is valid!');
    console.log('📝 Test response:', result.response.text().substring(0, 100) + '...');
    console.log('\n💡 Recommended models for your use case:');
    console.log('- gemini-pro (general purpose)');
    console.log('- gemini-pro-vision (multimodal)');
    console.log('- gemini-1.5-pro (latest, more capable)');
    console.log('- gemini-1.5-flash (fast, cost-effective)');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.log('\n🔍 Debug info:');
    console.log('- API Key format:', apiKey.substring(0, 3) + '...');
    console.log('- Error status:', error.status);
    console.log('- Error details:', error.errorDetails);
  }
}

listModels();
