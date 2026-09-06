import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testAnthropic() {
  console.log('🧪 Testing Anthropic API...\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
    console.log('💡 Add it to your .env.local file');
    process.exit(1);
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Say "Hello from RFQ System!" and confirm you are working.',
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const response = textBlock && 'text' in textBlock ? textBlock.text : '';

    console.log('✅ Anthropic API call succeeded!');
    console.log('📝 Response:', response);
    console.log('🎯 Model:', message.model);
    console.log('🔢 Tokens used:', message.usage.input_tokens + message.usage.output_tokens);
    console.log('\n✅ All AI agents are ready to use!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Anthropic API test failed:', error);
    process.exit(1);
  }
}

testAnthropic();
