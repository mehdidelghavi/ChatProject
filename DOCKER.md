# داکر — ساختار و راهنما

این پروژه با همان الگویی داکرایز شده که در `finoroyal-backend` استفاده می‌شود: چند فایل Compose مستقل که روی یک شبکه‌ی مشترک و از قبل ساخته‌شده به هم می‌رسند.

## فایل‌ها

| فایل | نقش |
|---|---|
| `Dockerfile` | ساخت ایمیج اپلیکیشن، دو مرحله‌ای |
| `docker-compose.yml` | سرویس `app` |
| `docker-compose.db.yml` | سرویس `db` (MariaDB) |
| `docker-compose.nginx.yml` | سرویس‌های `nginx`، `certbot-init` و `certbot` |
| `docker-compose.tools.yml` | سرویس `phpmyadmin`، اختیاری |
| `docker/nginx/` | تنظیمات nginx و اسکریپت بازخوانی گواهی |
| `docker/certbot/` | اسکریپت‌های صدور و تمدید گواهی |
| `.dockerignore` | چیزهایی که نباید داخل ایمیج بروند |
| `.env` | تنظیمات، در git نیست |
| `.env.example` | الگوی `.env` |
| `logs/` | مسیر لاگ، به `/var/log/app` داخل کانتینر mount می‌شود |

## چرا چند فایل Compose جداست

هر فایل یک **پروژه‌ی مستقل** Compose است؛ کلید `name` در بالای هر فایل همین کار را می‌کند. نتیجه:

- دیتابیس را می‌شود بالا نگه داشت و اپلیکیشن را ده بار rebuild کرد.
- `docker compose down` روی اپلیکیشن، به دیتابیس دست نمی‌زند.
- phpMyAdmin فقط وقتی لازم دارید بالا می‌آید.

اگر `name` را برندارید، همه‌ی فایل‌ها نام پوشه را به‌عنوان نام پروژه برمی‌دارند و Compose سرویس‌های فایل‌های دیگر را «orphan» می‌بیند و پیشنهاد حذفشان را می‌دهد.

چیزی که این‌ها را به هم وصل می‌کند شبکه‌ی `chat_network` است که با `external: true` علامت خورده، یعنی Compose آن را نمی‌سازد و انتظار دارد از قبل وجود داشته باشد. داخل این شبکه، هر کانتینر با **نام سرویسش** قابل صدا زدن است. برای همین `DB_HOST=db` کار می‌کند و phpMyAdmin هم با `PMA_HOST=db` دیتابیس را پیدا می‌کند.

## راه‌اندازی از صفر

```bash
cp .env.example .env
```

داخل `.env` مقدار `JWT_SECRET` را عوض کنید:

```bash
openssl rand -hex 32
```

شبکه‌ی مشترک را یک‌بار بسازید:

```bash
docker network create chat_network
```

اول دیتابیس، چون اپلیکیشن به آن نیاز دارد:

```bash
docker compose -f docker-compose.db.yml up -d
```

منتظر بمانید تا وضعیتش `healthy` شود:

```bash
docker compose -f docker-compose.db.yml ps
```

بعد اپلیکیشن:

```bash
docker compose up -d --build
```

و در آخر nginx:

```bash
docker compose -f docker-compose.nginx.yml up -d
```

آدرس: `https://localhost`

بار اول گواهی self-signed است، پس مرورگر هشدار می‌دهد. برای گواهی معتبر بخش «SSL خودکار» را ببینید.

بار اول، فایل `chat.sql` خودکار اجرا می‌شود و جدول‌ها، اتاق عمومی `Main` و کاربر `informant` با نقش Admin ساخته می‌شوند. صفحه‌ی ورود، ثبت‌نام هم هست؛ نام کاربری جدید بدهید، ساخته می‌شود.

## ترتیب استارت

این دو سرویس در دو پروژه‌ی جدا هستند، پس `depends_on` بینشان کار نمی‌کند. اما اپلیکیشن به خاطر lazy بودن connection pool در `mysql2` حتی با دیتابیس خاموش هم بالا می‌آید و فقط درخواست‌هایی که به دیتابیس می‌خورند خطا می‌دهند. به‌علاوه `restart: unless-stopped` دارد.

اگر ترتیب تضمین‌شده می‌خواهید، هر دو فایل را با هم به‌عنوان یک پروژه اجرا کنید:

```bash
docker compose -f docker-compose.db.yml -f docker-compose.yml up -d
```

## دستورهای روزمره

وضعیت و لاگ:

```bash
docker compose ps
docker compose logs -f app
docker compose -f docker-compose.db.yml logs -f db
```

بعد از تغییر کد:

```bash
docker compose restart app
```

کد با bind mount از هاست خوانده می‌شود، پس rebuild لازم نیست. فقط وقتی rebuild کنید که `package.json` یا `Dockerfile` عوض شده باشد:

```bash
docker compose up -d --build
```

ورود به داخل کانتینر:

```bash
docker compose exec app sh
docker compose -f docker-compose.db.yml exec db mariadb -uchat -pchatsecret chat
```

توقف:

```bash
docker compose down                             # فقط اپلیکیشن
docker compose -f docker-compose.db.yml down    # دیتابیس، داده‌ها می‌مانند
docker compose -f docker-compose.db.yml down -v # دیتابیس + پاک کردن کامل داده‌ها
```

nginx:

```bash
docker compose -f docker-compose.nginx.yml up -d
docker compose -f docker-compose.nginx.yml logs -f nginx
docker compose -f docker-compose.nginx.yml logs -f certbot
docker compose -f docker-compose.nginx.yml down
```

بعد از تغییر فایل template باید کانتینر بازساخته شود، چون envsubst فقط موقع استارت اجرا می‌شود:

```bash
docker compose -f docker-compose.nginx.yml up -d --force-recreate nginx
```

تست درستی تنظیمات nginx بدون ری‌استارت:

```bash
docker compose -f docker-compose.nginx.yml exec nginx nginx -t
```

phpMyAdmin روی `http://localhost:8080` با کاربر `chat` و رمز `chatsecret`:

```bash
docker compose -f docker-compose.tools.yml up -d
docker compose -f docker-compose.tools.yml down
```

## SSL خودکار

### مسیر درخواست

```
مرورگر ──443/TLS──> nginx ──http──> app:3000 ──> db:3306
             80 ──> nginx ──> ریدایرکت به 443
                     └─ /.well-known/acme-challenge/ ──> certbot
```

فقط nginx پورت باز می‌کند. اپلیکیشن و دیتابیس روی `127.0.0.1` بایند شده‌اند و از بیرون در دسترس نیستند.

### دو حالت

مقدار `SSL_MODE` در `.env` تعیین می‌کند:

| حالت | چه می‌کند | کجا به درد می‌خورد |
|---|---|---|
| `selfsigned` | گواهی خودامضا می‌سازد | لوکال و شبکه‌ی داخلی، مرورگر هشدار می‌دهد |
| `letsencrypt` | گواهی واقعی می‌گیرد و خودکار تمدید می‌کند | سرور با دامنه‌ی عمومی |

### بن‌بستی که سه سرویس را لازم کرده

nginx وقتی `ssl_certificate` به فایل موجودی اشاره نکند اصلاً بالا نمی‌آید. از آن طرف Let's Encrypt تا nginx بالا نیامده باشد نمی‌تواند چالش ACME را روی پورت ۸۰ بخواند. هیچ‌کدام بدون دیگری شروع نمی‌شوند.

راه‌حل سه مرحله‌ای است:

۱. سرویس `certbot-init` یک‌بار اجرا می‌شود و یک گواهی خودامضای موقت می‌نویسد، بعد خارج می‌شود. nginx با `service_completed_successfully` منتظرش می‌ماند.

۲. nginx با همان گواهی موقت بالا می‌آید و پورت ۸۰ را برای چالش ACME باز می‌کند.

۳. سرویس `certbot` منتظر می‌ماند تا nginx جواب بدهد، گواهی واقعی را می‌گیرد و جای موقتی را می‌گیرد.

### بازخوانی بعد از تمدید

کانتینر certbot نمی‌تواند به کانتینر nginx سیگنال بفرستد. راه‌حل رایج این است که سوکت داکر داخل کانتینر certbot mount شود تا بتواند `docker exec nginx nginx -s reload` بزند، ولی این کار عملاً دسترسی root روی هاست را به certbot می‌دهد — بهای سنگینی برای یک reload.

اینجا nginx خودش فایل گواهی را می‌پاید. اسکریپت `docker/nginx/cert-watcher.sh` هر ۶۰ ثانیه اثر انگشت فایل را می‌گیرد و اگر عوض شده باشد `nginx -s reload` می‌زند. بدون قطعی و بدون دسترسی اضافه.

### گرفتن گواهی واقعی

دامنه باید رکورد A داشته باشد که به IP سرور اشاره کند و پورت ۸۰ از اینترنت باز باشد.

در `.env`:

```
DOMAIN = chat.example.com
HOST = https://chat.example.com
SSL_MODE = letsencrypt
LETSENCRYPT_EMAIL = you@example.com
LETSENCRYPT_STAGING = true
HTTP_PORT = 80
HTTPS_PORT = 443
HTTPS_PUBLIC_SUFFIX =
```

اول با `LETSENCRYPT_STAGING = true` تست کنید. سرور اصلی Let's Encrypt فقط ۵ شکست در ساعت اجازه می‌دهد و اگر رد شوید باید یک ساعت صبر کنید؛ سرور staging چنین محدودیتی ندارد. گواهی staging معتبر نیست و مرورگر هشدار می‌دهد، ولی ثابت می‌کند کل مسیر درست کار می‌کند.

```bash
docker compose -f docker-compose.nginx.yml up -d
docker compose -f docker-compose.nginx.yml logs -f certbot
```

وقتی در لاگ دیدید گواهی صادر شد، staging را خاموش کنید و گواهی staging را دور بریزید تا از نو صادر شود:

```bash
sed -i 's/^LETSENCRYPT_STAGING = true/LETSENCRYPT_STAGING = false/' .env
docker compose -f docker-compose.nginx.yml down
docker volume rm chat_project_nginx_certbot_certs
docker compose -f docker-compose.nginx.yml up -d
```

تمدید خودکار است: کانتینر certbot هر ۱۲ ساعت `certbot renew` می‌زند و اگر گواهی وارد بازه‌ی ۳۰ روز مانده به انقضا شده باشد تمدیدش می‌کند، وگرنه کاری نمی‌کند.

### اگر صدور شکست بخورد

اسکریپت به‌جای اینکه nginx را بی‌گواهی بگذارد، دوباره یک گواهی خودامضا می‌نویسد و سایت بالا می‌ماند. دلیل شکست در لاگ certbot است. دو علت رایج: دامنه به این سرور اشاره نمی‌کند، یا پورت ۸۰ پشت فایروال بسته است.

چند نگهبان هم قبل از تماس با Let's Encrypt کار را متوقف می‌کنند: اگر `DOMAIN` برابر `localhost` یا `*.local` باشد، یا `LETSENCRYPT_EMAIL` خالی باشد، اصلاً درخواستی فرستاده نمی‌شود و پیام دلیلش در لاگ می‌آید.

### WebSocket

این مهم‌ترین قسمت تنظیمات nginx برای این پروژه است. Socket.IO اول با long-polling شروع می‌کند و بعد درخواست upgrade به WebSocket می‌دهد. بدون این دو هدر، upgrade شکست می‌خورد:

```nginx
proxy_set_header Upgrade    $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

مقدار `$connection_upgrade` از یک `map` می‌آید که برای درخواست‌های upgrade مقدار `upgrade` و برای بقیه `close` برمی‌گرداند. ضمناً `proxy_http_version 1.1` لازم است چون پیش‌فرض `proxy_pass` نسخه‌ی ۱.۰ است و WebSocket روی آن کار نمی‌کند.

دو تنظیم دیگر هم لازم بود: `proxy_read_timeout 7d` چون سوکت چت بین دو پیام بی‌کار می‌ماند و پیش‌فرض ۶۰ ثانیه‌ای آن را قطع می‌کرد، و `proxy_buffering off` چون بافر کردن، ماهیت جریانی long-polling را از بین می‌برد.

### پورت‌ها

اگر چیز دیگری روی پورت ۸۰ یا ۴۴۳ هاست نشسته، در `.env`:

```
HTTP_PORT = 8081
HTTPS_PORT = 8443
HTTPS_PUBLIC_SUFFIX = :8443
HOST = https://localhost:8443
```

مقدار `HTTPS_PUBLIC_SUFFIX` را فراموش نکنید، وگرنه ریدایرکت از HTTP به پورتی می‌رود که کسی رویش گوش نمی‌دهد.

ولی روی سروری که می‌خواهید گواهی واقعی بگیرید، `HTTP_PORT` باید حتماً ۸۰ باشد. Let's Encrypt چالش HTTP-01 را فقط روی پورت ۸۰ عمومی می‌خواند و پورت دیگری قبول نمی‌کند.

## مفاهیمی که در این ساختار استفاده شده

**Image در برابر Container.** ایمیج قالب فقط‌خواندنی است، کانتینر نمونه‌ی در حال اجرای آن. `docker compose up --build` ایمیج را می‌سازد و از رویش کانتینر بالا می‌آورد.

**مرحله‌بندی در Dockerfile.** مرحله‌ی `depsstage` فقط `package.json` و `package-lock.json` را کپی می‌کند و `npm ci` می‌زند. چون این دو فایل با تغییر کد عوض نمی‌شوند، داکر لایه‌ی کش‌شده را دوباره استفاده می‌کند و rebuild چند ثانیه طول می‌کشد، نه چند دقیقه. این همان کاری است که `Dockerfile.vendor` در پروژه‌ی finoroyal برای composer انجام می‌دهد.

**Bind mount در برابر named volume.** در سرویس `app` هر دو را کنار هم می‌بینید:

```yaml
- .:/var/www/html
- node_modules:/var/www/html/node_modules
```

خط اول پوشه‌ی پروژه روی هاست را روی مسیر داخل کانتینر می‌اندازد، پس تغییر کد بلافاصله دیده می‌شود. مشکلش این است که پوشه‌ی هاست `node_modules` ندارد و همین «نداشتن» روی `node_modules` که داخل ایمیج ساخته شده می‌افتد و پاکش می‌کند. خط دوم یک volume نام‌دار دقیقاً روی همان مسیر سوار می‌کند و آن را نجات می‌دهد. برای همین `ls node_modules` روی هاست خالی است ولی داخل کانتینر پر.

**دوام داده.** والیوم `db_data` جدا از کانتینر زندگی می‌کند. `down` آن را پاک نمی‌کند، فقط `down -v`.

**Healthcheck.** هم اپلیکیشن و هم دیتابیس healthcheck دارند و در خروجی `docker compose ps` وضعیت `healthy` دیده می‌شود. healthcheck اپلیکیشن با ماژول `http` خود Node زده شده، چون ایمیج slim نه `curl` دارد نه `wget` و نصبشان فقط برای همین یک کار ارزش ندارد.

**متغیرهای محیطی.** فایل `.env` دو بار خوانده می‌شود: یک‌بار توسط Compose برای جایگزینی `${...}` داخل فایل‌های yml، یک‌بار هم با `env_file` به داخل کانتینر اپلیکیشن تزریق می‌شود.

**`extra_hosts`.** خط `host.docker.internal:host-gateway` باعث می‌شود کانتینر بتواند سرویس‌های روی خود هاست را صدا بزند.

## استفاده از دیتابیس روی هاست به‌جای کانتینر

در `.env`:

```
DB_HOST = host.docker.internal
```

و سرویس دیتابیس را اصلاً بالا نیاورید. دقیقاً همان کاری که پروژه‌ی finoroyal می‌کند.

یک نکته که معمولاً وقت زیادی می‌گیرد: اگر MySQL روی هاست فقط به `127.0.0.1` گوش می‌دهد، کانتینر با اینکه `host.docker.internal` را resolve می‌کند، `ECONNREFUSED` می‌گیرد. باید `bind-address` را روی `0.0.0.0` بگذارید و کاربر دیتابیس اجازه‌ی اتصال از رنج شبکه‌ی داکر داشته باشد.

## اجرا روی سرور تست

فقط Docker Engine و افزونه‌ی Compose لازم است، نه Node و نه MySQL.

```bash
git clone <repo> && cd ChatProject
cp .env.example .env
```

در `.env` این سه مورد را حتماً عوض کنید:

```
HOST = http://SERVER_IP:3000
JWT_SECRET = <خروجی openssl rand -hex 32>
DB_PASSWORD = <رمز قوی>
```

مقدار `HOST` باید دقیقاً همان آدرسی باشد که مرورگر می‌بیند، چون کلاینت با همین آدرس به Socket.IO وصل می‌شود. اگر اشتباه باشد صفحه بالا می‌آید ولی چت کار نمی‌کند.

همچنین برای گواهی معتبر:

```
DOMAIN = chat.example.com
SSL_MODE = letsencrypt
LETSENCRYPT_EMAIL = you@example.com
LETSENCRYPT_STAGING = true
```

```bash
docker network create chat_network
docker compose -f docker-compose.db.yml up -d
docker compose up -d --build
docker compose -f docker-compose.nginx.yml up -d
```

روی فایروال فقط `80` و `443` باید باز باشند. پورت‌های اپلیکیشن، دیتابیس و phpMyAdmin عمداً به `127.0.0.1` بایند شده‌اند و از بیرون در دسترس نیستند؛ برای رسیدن به آن‌ها از SSH tunnel استفاده کنید:

```bash
ssh -L 8080:127.0.0.1:8080 user@SERVER_IP
ssh -L 3000:127.0.0.1:3000 user@SERVER_IP
```

اگر روی سرور از قبل یک nginx سیستمی روی پورت ۸۰ نشسته، یکی از این دو کار را بکنید: یا آن را خاموش کنید تا nginx داکر پورت‌ها را بگیرد، یا nginx سیستمی را جلوی استک بگذارید و `proxy_pass` به پورت داکر بدهید. در حالت دوم صدور گواهی هم باید با همان nginx سیستمی انجام شود، نه با certbot داخل داکر.

## پشتیبان‌گیری

```bash
docker compose -f docker-compose.db.yml exec -T db \
    mariadb-dump -uroot -prootsecret chat > backup.sql

docker compose -f docker-compose.db.yml exec -T db \
    mariadb -uroot -prootsecret chat < backup.sql
```

## رفع اشکال

**شبکه پیدا نمی‌شود.** خطای `network chat_network declared as external, but could not be found`:

```bash
docker network create chat_network
```

**پورت اشغال است.** مقدار سمت چپ در `ports` را در `docker-compose.yml` عوض کنید و اگر پورت اپلیکیشن را عوض کردید، `HOST` در `.env` را هم هماهنگ کنید.

**تغییر `chat.sql` اعمال نمی‌شود.** این فایل فقط وقتی اجرا می‌شود که والیوم دیتابیس خالی باشد:

```bash
docker compose -f docker-compose.db.yml down -v
docker compose -f docker-compose.db.yml up -d
```

**اپلیکیشن به دیتابیس وصل نمی‌شود.** اول ببینید نام `db` از داخل کانتینر resolve می‌شود یا نه:

```bash
docker compose exec app node -e "require('dns').lookup('db',(e,a)=>console.log(e||a))"
```

اگر شکست خورد، یعنی دو سرویس روی یک شبکه نیستند:

```bash
docker network inspect chat_network
```

**`node_modules` داخل کانتینر خالی است.** والیومش را بسازید دوباره:

```bash
docker compose down -v && docker compose up -d --build
```

**nginx بالا نمی‌آید.** معمولاً یعنی گواهی روی دیسک نیست. ببینید `certbot-init` با کد صفر خارج شده یا نه:

```bash
docker logs chat_project_certbot_init
```

**چت وصل نمی‌شود ولی صفحه بالا می‌آید.** تقریباً همیشه یعنی `HOST` در `.env` با آدرسی که در مرورگر می‌بینید یکی نیست. کلاینت با همین مقدار به Socket.IO وصل می‌شود. در کنسول مرورگر خطای CORS یا خطای اتصال WebSocket می‌بینید.

اگر `HOST` درست است، ببینید upgrade واقعاً انجام می‌شود:

```bash
docker compose -f docker-compose.nginx.yml exec nginx \
    grep -E '" (101|400|502) ' /var/log/nginx/access.log | tail
```

کد `101` یعنی upgrade موفق بوده.

**`ERR_SSL_PROTOCOL_ERROR` در مرورگر.** احتمالاً دارید با `http://` به پورت HTTPS می‌زنید.

**هشدار گواهی در مرورگر.** با `SSL_MODE=selfsigned` طبیعی است. با `LETSENCRYPT_STAGING=true` هم طبیعی است، چون گواهی staging را هیچ مرورگری معتبر نمی‌داند.
