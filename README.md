# Öğretmen Yardımcı PWA

Öğretmenler için ders ve uygulama takip sistemi. Mobil öncelikli, Progressive Web App.

## Teknoloji

- React 19 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Firebase Auth + Firestore
- Cloudflare R2 (fotoğraf depolama)
- vite-plugin-pwa (offline destek)

## Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Firebase Projesi Oluştur

1. [Firebase Console](https://console.firebase.google.com) > Yeni Proje
2. Authentication > Sign-in method: **Email/Password** ve **Google** etkinleştir
3. Firestore Database > Create database (production mode)
4. Project Settings > Web App > SDK configuration bilgilerini kopyala

### 3. Cloudflare R2 Bucket Oluştur

1. Cloudflare Dashboard > R2 > Create bucket: `ogretmen-yardimci`
2. Settings > Public access etkinleştir
3. API Tokens > R2 Token oluştur (Object Read & Write)
4. `cloudflare-worker/` dizinine gidip Worker'ı deploy et:

```bash
cd cloudflare-worker
npx wrangler deploy
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_PUBLIC_URL   # https://pub-xxxxx.r2.dev
```

### 4. Ortam Değişkenlerini Ayarla

`.env` dosyasını Firebase ve R2 bilgilerinizle doldurun:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_R2_WORKER_URL=https://your-worker.workers.dev
```

### 5. Firestore Güvenlik Kurallarını Yükle

```bash
firebase deploy --only firestore:rules
```

### 6. Geliştirme Sunucusu

```bash
npm run dev
```

### 7. Production Build

```bash
npm run build
npm run preview
```

## Özellikler

- **Giriş/Kayıt**: E-posta/şifre ve Google OAuth
- **Derslerim**: Ders kartları, arama, FAB ile ekleme
- **Ders Uygulamaları**: Uygulama ekleme, öğrenci listesi, puan girişi
- **Kamera**: Uygulama sırasında öğrenci fotoğrafı çekme
- **Öğrenci Ekleme**: Tekli form veya Excel import
- **Rapor**: Tarih aralığına göre Excel export
- **Öğrenci Profili**: Fotoğraf, PC geçmişi, notlar, portfolyo grafiği
- **PWA**: Offline destek, mobil kurulum

## Excel Import Format

Öğrenci listesi için Excel sütunları:

| No | Ad Soyad | PC No | Notlar |
|----|----------|-------|--------|
| 1  | Ayşe Yılmaz | PC-01 | |
