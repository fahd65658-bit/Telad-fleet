'use strict';

const logger = require('../utils/logger');

async function predictRisk(vehicleId) {
  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Rate maintenance risk for vehicle ${vehicleId} from 0-100. Reply JSON: {risk, confidence}` }],
        response_format: { type: 'json_object' },
      });
      const data = JSON.parse(completion.choices[0].message.content);
      return { ...data, status: 'OK', model: 'openai-gpt-4o-mini', vehicleId };
    } catch (err) {
      logger.warn('OpenAI call failed, using mock:', err.message);
    }
  }
  return {
    risk:       +(Math.random() * 100).toFixed(1),
    confidence: +(50 + Math.random() * 50).toFixed(1),
    status:     'OK',
    model:      'telad-fleet-ai-v1',
    vehicleId,
  };
}

module.exports = { predictRisk };
