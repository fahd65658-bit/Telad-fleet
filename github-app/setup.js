'use strict';

const REQUIRED_ENV_VARS = [
  'GITHUB_APP_ENABLED',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_WEBHOOK_SECRET',
];

const OPTIONAL_ENV_VARS = [
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_WEBHOOK_URL',
  'GITHUB_APP_REDIRECT_URL',
];

function getSetupStatus() {
  const required = REQUIRED_ENV_VARS.map((name) => ({
    name,
    configured: Boolean(process.env[name]),
  }));

  const optional = OPTIONAL_ENV_VARS.map((name) => ({
    name,
    configured: Boolean(process.env[name]),
  }));

  return {
    enabled: process.env.GITHUB_APP_ENABLED === 'true',
    required,
    optional,
    ready: required.every((entry) => entry.configured),
  };
}

function printStatus() {
  const status = getSetupStatus();

  console.log('================ GitHub App Setup | إعداد GitHub App ================');
  console.log(`Enabled | التفعيل: ${status.enabled ? 'Yes / نعم' : 'No / لا'}`);

  console.log('\nRequired variables | المتغيرات المطلوبة:');
  status.required.forEach((entry) => {
    console.log(`- ${entry.name}: ${entry.configured ? 'OK ✅' : 'Missing ❌'}`);
  });

  console.log('\nOptional variables | المتغيرات الاختيارية:');
  status.optional.forEach((entry) => {
    console.log(`- ${entry.name}: ${entry.configured ? 'OK ✅' : 'Missing ⚪'}`);
  });

  console.log('\nRegistration steps | خطوات التسجيل:');
  console.log('1) Open GitHub App registration page: https://github.com/settings/apps/new');
  console.log('   افتح صفحة تسجيل GitHub App: https://github.com/settings/apps/new');
  console.log('2) Set Homepage URL to: https://fna.sa');
  console.log('   اضبط رابط الصفحة الرئيسية إلى: https://fna.sa');
  console.log('3) Set Webhook URL to: https://api.fna.sa/api/github/webhook');
  console.log('   اضبط رابط Webhook إلى: https://api.fna.sa/api/github/webhook');
  console.log('4) Copy App ID / Client ID / Private Key to environment variables.');
  console.log('   انسخ App ID و Client ID و Private Key إلى متغيرات البيئة.');
  console.log('5) Restart API service after updating environment.');
  console.log('   أعد تشغيل خدمة API بعد تحديث متغيرات البيئة.');

  console.log(`\nReady | جاهزية التشغيل: ${status.ready ? 'Ready ✅ / جاهز' : 'Not Ready ❌ / غير جاهز'}`);

  return status;
}

if (require.main === module) {
  printStatus();
}

module.exports = {
  getSetupStatus,
  printStatus,
};
