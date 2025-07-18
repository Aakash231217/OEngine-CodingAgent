const { anthropic } = require('@ai-sdk/anthropic');
const { generateText } = require('ai');
require('dotenv').config();

// Test Claude integration
async function testClaude() {
  try {
    console.log('🧪 Testing Claude Sonnet 3.5 integration...');
    
    const claudeModel = anthropic('claude-3-5-sonnet-20241022');
    
    const testPrompt = `You are a helpful assistant. Respond with a valid JSON object only:

{
  "status": "working",
  "message": "Claude integration is successful"
}

CRITICAL: Respond with ONLY valid JSON, no markdown or extra text.`;

    const response = await generateText({
      model: claudeModel,
      prompt: testPrompt,
      temperature: 0.1,
      maxTokens: 200
    });

    console.log('📄 Claude Response:', response.text);
    
    // Test JSON parsing
    const jsonMatch = response.text.trim().match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✅ Successfully parsed JSON:', parsed);
    } else {
      console.log('❌ No JSON found in response');
    }
    
  } catch (error) {
    // @ts-ignore
    console.error('💥 Claude test failed:', error.message);
  }
}

testClaude();
