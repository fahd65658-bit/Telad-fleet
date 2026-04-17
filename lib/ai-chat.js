'use strict';

const { generateText } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const openai = OPENAI_API_KEY ? createOpenAI({ apiKey: OPENAI_API_KEY }) : null;

function trimText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function serializeSnapshot(snapshot) {
  return trimText(JSON.stringify(snapshot), 6000);
}

async function generateFleetAnswer({ question, snapshot, fallbackResult }) {
  if (!openai || !question) {
    return { ...fallbackResult, source: 'rules' };
  }

  try {
    const { text } = await generateText({
      model: openai(OPENAI_MODEL),
      temperature: 0.2,
      maxOutputTokens: 280,
      system: [
        'أنت مساعد عربي مختصر لإدارة الأسطول.',
        'اعتمد فقط على البيانات المقدمة لك.',
        'إذا لم تجد الإجابة في البيانات فاذكر ذلك بوضوح دون تخمين.',
        'أجب في 2-4 جمل كحد أقصى وبالعربية.',
      ].join(' '),
      prompt: [
        `سؤال المستخدم: ${trimText(question, 500)}`,
        'بيانات الأسطول المتاحة:',
        serializeSnapshot(snapshot),
      ].join('\n\n'),
    });

    const answer = trimText(text, 1200);
    if (!answer) {
      return { ...fallbackResult, source: 'rules' };
    }

    return {
      ...fallbackResult,
      answer,
      source: 'ai-sdk',
      model: OPENAI_MODEL,
    };
  } catch (error) {
    console.error('[AI SDK] Fleet answer generation failed:', error.message);
    return { ...fallbackResult, source: 'rules' };
  }
}

module.exports = {
  generateFleetAnswer,
};
