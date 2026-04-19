'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { generateJWT } = require('./auth');

/**
 * Prompts for CLI input.
 * @param {readline.Interface} rl Readline instance.
 * @param {string} question Prompt text.
 * @param {string} [fallback] Default value.
 * @returns {Promise<string>} User response.
 */
function ask(rl, question, fallback = '') {
  return new Promise((resolve) => {
    const suffix = fallback ? ` (${fallback})` : '';
    rl.question(`${question}${suffix}: `, (answer) => resolve(answer || fallback));
  });
}

/**
 * Upserts key/value in .env file content.
 * @param {string} content Existing .env content.
 * @param {string} key Environment key.
 * @param {string} value Environment value.
 * @returns {string} Updated content.
 */
function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

/**
 * Writes generated RSA private key when absent.
 * @param {string} keyPath Target private key path.
 * @returns {string} PEM private key.
 */
function ensurePrivateKey(keyPath) {
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8');
  const generated = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = generated.privateKey.export({ type: 'pkcs1', format: 'pem' });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
  return privateKey;
}

/**
 * Verifies current GitHub App environment.
 * @returns {{ok: boolean, message: string}} Verification result.
 */
function verifySetup() {
  try {
    const appId = process.env.GITHUB_APP_ID;
    const keyPath = path.resolve(process.env.GITHUB_APP_PRIVATE_KEY_PATH || './github-app/private-key.pem');
    if (!appId) return { ok: false, message: 'GITHUB_APP_ID غير مضبوط' };
    if (!fs.existsSync(keyPath)) return { ok: false, message: `ملف المفتاح غير موجود: ${keyPath}` };
    const privateKey = fs.readFileSync(keyPath, 'utf8');
    generateJWT(appId, privateKey);
    if (!process.env.GITHUB_APP_WEBHOOK_SECRET) {
      return { ok: false, message: 'GITHUB_APP_WEBHOOK_SECRET غير مضبوط' };
    }
    return { ok: true, message: 'إعداد GitHub App صالح ✅' };
  } catch (error) {
    return { ok: false, message: `فشل التحقق: ${error.message}` };
  }
}

/**
 * Runs interactive setup for GitHub App values and updates .env.
 * @returns {Promise<void>}
 */
async function runInteractiveSetup() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const appId = await ask(rl, 'GitHub App ID', process.env.GITHUB_APP_ID || '');
  const appName = await ask(rl, 'GitHub App Name', process.env.GITHUB_APP_NAME || 'telad-fleet-manager');
  const installationId = await ask(rl, 'Installation ID', process.env.GITHUB_APP_INSTALLATION_ID || '');
  const webhookSecret = await ask(rl, 'Webhook Secret', process.env.GITHUB_APP_WEBHOOK_SECRET || '');
  const callback = await ask(rl, 'Callback URL', process.env.GITHUB_APP_CALLBACK_URL || 'https://fna.sa/github/callback');
  rl.close();

  const keyPath = path.resolve(__dirname, 'private-key.pem');
  ensurePrivateKey(keyPath);

  let nextEnv = current || '';
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_ID', appId);
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_NAME', appName);
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_PRIVATE_KEY_PATH', './github-app/private-key.pem');
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_WEBHOOK_SECRET', webhookSecret);
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_INSTALLATION_ID', installationId);
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_CALLBACK_URL', callback);
  nextEnv = upsertEnv(nextEnv, 'GITHUB_APP_PUBLIC', 'true');

  fs.writeFileSync(envPath, nextEnv, 'utf8');
  console.log(`✅ تم حفظ إعدادات GitHub App في ${envPath}`);
}

async function main() {
  if (process.argv.includes('--verify')) {
    const result = verifySetup();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }
  await runInteractiveSetup();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ فشل إعداد GitHub App:', error.message);
    process.exit(1);
  });
}

module.exports = {
  verifySetup,
  runInteractiveSetup,
};
