# TELAD FLEET – Operations Runbook

## Auto-sync (مزامنة Git تلقائية)

يثبّت `deployment/deploy.sh` مهمة cron تسحب التحديثات من GitHub كل 5 دقائق تلقائيًا وتُعيد تحميل PM2 في حال وجود تعديلات جديدة (zero-downtime reload):

```
*/5 * * * * root /bin/bash /var/www/telad-fleet/deployment/auto-sync.sh
```

سجل المزامنة:

```bash
tail -f /var/log/telad-fleet-sync.log
```

لتشغيل المزامنة يدويًا:

```bash
sudo bash /var/www/telad-fleet/deployment/auto-sync.sh
```

لإيقاف المزامنة التلقائية مؤقتًا:

```bash
sudo rm /etc/cron.d/telad-fleet-sync
```

## Production mode

- Use the root `server.js` as the only write-capable backend.
- Store persistent JSON data outside the repo checkout with `DATA_DIR`.
- Do not send production write traffic to `api/index.js` on Vercel.

## Required production paths

- App: `/var/www/telad-fleet`
- Data: `/var/www/telad-fleet/data`
- Backups: `/var/backups/telad-fleet`

## Deploy

```bash
cd /var/www/telad-fleet
cp .env.example .env
nano .env
sudo bash deployment/deploy.sh
```

## Health checks

```bash
curl http://127.0.0.1:5000/api/health
pm2 status
pm2 logs telad-fleet --lines 100
```

The health payload reports:

- active persistence mode
- `DATA_DIR`
- last successful flush time
- pending write state
- last persistence error

## Backups

Daily backups are installed by `deployment/deploy.sh` through cron.

Manual backup:

```bash
DATA_DIR=/var/www/telad-fleet/data BACKUP_DIR=/var/backups/telad-fleet \
bash /var/www/telad-fleet/deployment/backup.sh
```

Manual restore:

```bash
pm2 stop telad-fleet
ls -lh /var/backups/telad-fleet/
DATA_DIR=/var/www/telad-fleet/data \
bash /var/www/telad-fleet/deployment/restore.sh /var/backups/telad-fleet/telad-fleet-data-YYYYMMDDTHHMMSSZ.tar.gz
pm2 start telad-fleet
```

استبدل `YYYYMMDDTHHMMSSZ` باسم الملف الحقيقي من مجلد النسخ الاحتياطية.
`restore.sh` keeps a snapshot of the previous data directory before replacing it.

## Post-restore verification

```bash
curl http://127.0.0.1:5000/api/health
pm2 logs telad-fleet --lines 50
```

Verify that:

- the API returns `status: ok`
- `persistence.lastFlushError` is `null`
- core entities are present in the dashboard

## Security checklist

- Set strong `JWT_SECRET`
- Set a non-default `ADMIN_PASSWORD`
- Restrict `CORS_ORIGIN` to the real frontend domain
- Keep `.env` only on the server
- Test backup restore before going live
