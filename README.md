# Telad Fleet

لوحة تحكم عربية لإدارة الأسطول بواجهة ثابتة وواجهة API عبر Node.js.

## المعمارية المعتمدة للإنتاج

- **الواجهة:** `frontend/`
- **الخادم المعتمد للإنتاج:** `server.js`
- **التخزين الحالي المعتمد:** ملف JSON دائم داخل `DATA_DIR`
- **النشر المعتمد:** VPS + PM2 + nginx أو `deployment/docker-compose.yml`
- **Vercel:** لم يعد مسار نشر إنتاجي للكتابة لأن `api/index.js` يعمل بذاكرة مؤقتة

## هيكل المشروع المهم

```text
telad-fleet/
├── server.js
├── lib/db.js
├── frontend/
├── deployment/
│   ├── deploy.sh
│   ├── pm2.config.js
│   ├── docker-compose.yml
│   ├── backup.sh
│   └── restore.sh
├── docs/OPERATIONS.md
├── database/schema.sql
└── api/index.js   ← legacy / غير معتمد للإنتاج الدائم
```

## التخزين الدائم الحالي

الخادم يقرأ ويكتب البيانات في:

- `DATA_DIR/fleet.json`

الخصائص الحالية:

- حفظ دائم على القرص
- كتابة ذرية عبر ملف مؤقت ثم `rename`
- Flush عند الإغلاق
- Health endpoint يوضح حالة التخزين وآخر حفظ

> في الإنتاج يجب أن يكون `DATA_DIR` خارج مسار إعادة النشر، مثل:
> `/var/www/telad-fleet/data`

## التشغيل المحلي

```bash
cd /home/runner/work/Telad-fleet/Telad-fleet
npm install
cp .env.example .env
npm start
```

ثم افتح:

- `http://localhost:5000` إذا ضبطت `PORT=5000`
- أو `http://localhost:3000` إذا استخدمت الإعداد الافتراضي

## أوامر التحقق

```bash
cd /home/runner/work/Telad-fleet/Telad-fleet
npm run lint
npm run build
npm test
```

## النشر على VPS

```bash
ssh root@YOUR_VPS_IP
git clone https://github.com/fahd65658-bit/Telad-fleet /var/www/telad-fleet
cd /var/www/telad-fleet
cp .env.example .env
nano .env
sudo bash deployment/deploy.sh
```

يجب ضبط هذه القيم قبل الإطلاق:

- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `CORS_ORIGIN`
- `DATA_DIR`
- `BACKUP_DIR`

## Docker

```bash
cd /home/runner/work/Telad-fleet/Telad-fleet
cp .env.example .env
docker compose -f deployment/docker-compose.yml up -d
```

## النسخ الاحتياطي والاسترجاع

نسخة احتياطية يدوية:

```bash
DATA_DIR=/var/www/telad-fleet/data BACKUP_DIR=/var/backups/telad-fleet \
bash /var/www/telad-fleet/deployment/backup.sh
```

استرجاع:

```bash
pm2 stop telad-fleet
DATA_DIR=/var/www/telad-fleet/data \
bash /var/www/telad-fleet/deployment/restore.sh /var/backups/telad-fleet/telad-fleet-data-YYYYMMDDTHHMMSSZ.tar.gz
pm2 start telad-fleet
```

تفاصيل التشغيل موجودة في:

- `docs/OPERATIONS.md`

## Health Check

- `/healthz`
- `/api/health`
- `/api/version`

`/api/health` يعرض الآن:

- وضع التخزين الحالي
- `DATA_DIR`
- آخر وقت حفظ ناجح
- حالة pending writes
- آخر خطأ حفظ إن وجد

## PostgreSQL

يوجد ملف `database/schema.sql` كتحضير للهجرة المستقبلية، لكن **الخادم الحالي لا يستخدم PostgreSQL فعليًا بعد**.
الحل الإنتاجي الحالي المعتمد هو:

- `server.js`
- `lib/db.js`
- `DATA_DIR` دائم
- نسخ احتياطية مجدولة

## ملاحظة مهمة

إذا كنت تريد “مدى الحياة” بشكل أقوى من ملفات JSON، فالخطوة التالية بعد هذا التحديث هي:

1. نقل `lib/db.js` إلى PostgreSQL فعليًا
2. تنفيذ migration للبيانات الحالية
3. إضافة مراقبة وتنبيهات خارجية

