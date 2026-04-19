'use strict';

require('dotenv').config();

const { getInstallationToken } = require('./auth');

const required = [
  'GITHUB_APP_ID',
  'GITHUB_APP_WEBHOOK_SECRET',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_ENABLED',
];

const privateKeyConfigured = Boolean(process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_PATH);

function printStatus() {
  console.log('GitHub App Environment Check');
  console.log('============================');

  required.forEach((key) => {
    const ok = Boolean(process.env[key]);
    console.log(`${ok ? '✅' : '❌'} ${key}`);
  });

  console.log(`${privateKeyConfigured ? '✅' : '❌'} GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH`);
}

async function verifyConnection() {
  try {
    const token = await getInstallationToken(process.env.GITHUB_APP_INSTALLATION_ID);
    console.log(`✅ GitHub API connection verified (token length: ${token.length})`);
  } catch (error) {
    console.log(`❌ GitHub API verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

function printNextSteps() {
  console.log('\nالخطوات التالية (Arabic):');
  console.log('1) سجّل GitHub App باستخدام ملف github-app/app-manifest.json');
  console.log('2) اضبط متغيرات البيئة على الخادم (PM2 + nginx).');
  console.log('3) اختبر endpoint الويب هوك: https://api.fna.sa/api/github/webhook');

  console.log('\nNext steps (English):');
  console.log('1) Register the GitHub App using github-app/app-manifest.json.');
  console.log('2) Configure env vars on the VPS (PM2 + nginx).');
  console.log('3) Test webhook delivery at https://api.fna.sa/api/github/webhook.');
}

async function main() {
  printStatus();

  if (process.argv.includes('--verify')) {
    await verifyConnection();
  }

  printNextSteps();
}

main();
