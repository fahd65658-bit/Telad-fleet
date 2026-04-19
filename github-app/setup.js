'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { generateJWT, getPrivateKey } = require('./auth');

const REQUIRED_VARS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_WEBHOOK_SECRET',
  'GITHUB_APP_INSTALLATION_ID',
];

function ensureWebhookSecret() {
  if (process.env.GITHUB_APP_WEBHOOK_SECRET) return process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('لا يمكن توليد GITHUB_APP_WEBHOOK_SECRET تلقائياً في بيئة الإنتاج.');
  }

  const generated = crypto.randomBytes(32).toString('hex');
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    fs.appendFileSync(envPath, '\n# Auto-generated for local development only; regenerate securely for production\n', 'utf8');
    fs.appendFileSync(envPath, `GITHUB_APP_WEBHOOK_SECRET=${generated}\n`, 'utf8');
  }

  return generated;
}

async function testGitHubConnection(appJwt) {
  const response = await fetch('https://api.github.com/app', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${appJwt}`,
      'User-Agent': process.env.GITHUB_APP_NAME || 'telad-fleet-manager',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? await response.json() : await response.text(),
  };
}

async function run() {
  const verifyOnly = process.argv.includes('--verify');
  const report = [];

  for (const key of REQUIRED_VARS) {
    if (process.env[key]) {
      report.push({ key, status: 'ok' });
    } else {
      report.push({ key, status: 'missing' });
    }
  }

  let webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!verifyOnly && !webhookSecret) {
    try {
      webhookSecret = ensureWebhookSecret();
      report.push({ key: 'GITHUB_APP_WEBHOOK_SECRET', status: 'generated' });
    } catch (error) {
      report.push({ key: 'GITHUB_APP_WEBHOOK_SECRET', status: `error: ${error.message}` });
    }
  }

  let githubCheck = { ok: false, status: 'skipped' };
  try {
    if (process.env.GITHUB_APP_ID) {
      const privateKey = getPrivateKey();
      const appJwt = generateJWT(process.env.GITHUB_APP_ID, privateKey);
      githubCheck = await testGitHubConnection(appJwt);
    }
  } catch (error) {
    githubCheck = { ok: false, status: 'error', error: error.message };
  }

  console.log('══════════════════════════════════════════');
  console.log('TELAD Fleet GitHub App Setup Report');
  console.log('══════════════════════════════════════════');
  for (const item of report) {
    console.log(`- ${item.key}: ${item.status}`);
  }
  console.log(`- GitHub API check: ${githubCheck.ok ? 'ok' : 'failed'}${githubCheck.status ? ` (${githubCheck.status})` : ''}`);

  if (githubCheck.ok) {
    console.log(`- App slug: ${githubCheck.body.slug}`);
  }

  console.log('\nخطوات التسجيل / Registration Guide:');
  console.log('1) افتح: https://github.com/settings/apps/new');
  console.log('2) استخدم الملف: github-app/app-manifest.json');
  console.log('3) حمّل private key واحفظه في github-app/private-key.pem');
  console.log('4) اضبط متغيرات البيئة في الخادم ثم شغّل github-app:verify');
}

run().catch((error) => {
  console.error('GitHub App setup failed:', error.message);
  process.exit(1);
});
