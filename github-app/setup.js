'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { generateJWT, getGitHubAppConfig, readPrivateKey } = require('./auth');

const requiredVars = [
  'GITHUB_APP_ID',
  'GITHUB_APP_WEBHOOK_SECRET',
  'GITHUB_APP_INSTALLATION_ID',
];

function validateEnv() {
  const missing = [];
  for (const key of requiredVars) {
    if (!process.env[key]) missing.push(key);
  }

  const hasInlineKey = Boolean(process.env.GITHUB_APP_PRIVATE_KEY);
  const hasPathKey = Boolean(process.env.GITHUB_APP_PRIVATE_KEY_PATH);
  if (!hasInlineKey && !hasPathKey) {
    missing.push('GITHUB_APP_PRIVATE_KEY_OR_PATH');
  }

  return {
    missing,
    hasInlineKey,
    hasPathKey,
  };
}

function ensureWebhookSecret() {
  if (process.env.GITHUB_APP_WEBHOOK_SECRET) {
    return { generated: false, value: process.env.GITHUB_APP_WEBHOOK_SECRET };
  }

  const value = crypto.randomBytes(32).toString('hex');
  return { generated: true, value };
}

async function testGitHubConnectivity() {
  const cfg = getGitHubAppConfig();
  if (!cfg.ready) {
    return { ok: false, reason: 'config-not-ready' };
  }

  try {
    const jwt = generateJWT(cfg.appId, cfg.privateKey);
    const response = await fetch('https://api.github.com/app', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'TELAD-FLEET-GitHub-App-Setup',
      },
    });

    return {
      ok: response.ok,
      status: response.status,
      details: response.ok ? 'GitHub API reachable' : await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }
}

function printGuide() {
  console.log('\n📘 GitHub App Registration Guide | دليل التسجيل');
  console.log('1) Open: https://github.com/settings/apps/new');
  console.log('2) Use manifest file: github-app/app-manifest.json');
  console.log('3) Set Webhook URL: https://api.fna.sa/api/github/webhook');
  console.log('4) Generate private key and save to github-app/private-key.pem');
  console.log('5) Install the app on the target repository.');
  console.log('6) Set env vars on VPS and restart PM2.\n');
}

function printHealthReport({ envState, secretState, connectivity }) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏥 GitHub App Health Report | تقرير صحة GitHub App');
  console.log('═══════════════════════════════════════════════════════════════');

  console.log(`Environment check | فحص البيئة: ${envState.missing.length === 0 ? '✅ OK' : '⚠️ Missing vars'}`);
  if (envState.missing.length > 0) {
    console.log(`Missing | مفقود: ${envState.missing.join(', ')}`);
  }

  if (secretState.generated) {
    console.log('⚠️ GITHUB_APP_WEBHOOK_SECRET missing. Generate a secure secret before enabling production webhooks.');
  } else {
    console.log('✅ Webhook secret موجود');
  }

  if (connectivity.ok) {
    console.log(`✅ GitHub API connectivity OK (HTTP ${connectivity.status})`);
  } else {
    console.log(`❌ GitHub API connectivity failed: ${connectivity.reason || connectivity.details || 'unknown'}`);
  }

  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (keyPath) {
    const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
    console.log(`Private key path: ${resolved} (${fs.existsSync(resolved) ? 'found' : 'not found'})`);
  } else if (process.env.GITHUB_APP_PRIVATE_KEY || readPrivateKey()) {
    console.log('Private key source: inline env ✅');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

async function run() {
  const verifyMode = process.argv.includes('--verify');

  const envState = validateEnv();
  const secretState = ensureWebhookSecret();
  const connectivity = await testGitHubConnectivity();

  printHealthReport({ envState, secretState, connectivity });
  printGuide();

  if (verifyMode) {
    const pass = envState.missing.length === 0 && connectivity.ok;
    process.exit(pass ? 0 : 1);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('هل تريد المتابعة بإعداد GitHub App؟ (y/N): ', (answer) => {
    if (String(answer).trim().toLowerCase() === 'y') {
      console.log('✅ ممتاز. أكمل التسجيل من الدليل أعلاه ثم أعد تشغيل هذا السكربت باستخدام --verify.');
    } else {
      console.log('ℹ️ تم الإنهاء بدون تغييرات.');
    }
    rl.close();
  });
}

run().catch((error) => {
  console.error('❌ فشل سكربت الإعداد:', error.message);
  process.exit(1);
});
