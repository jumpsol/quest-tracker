# 🎯 Quest Tracker

Günlük görevlerinizi ve birikim hedeflerinizi takip edin. Kayıt + Admin onay sistemi ile!

## ✨ Özellikler

- 🔐 **Kayıt/Giriş Sistemi** - Email & şifre ile
- ⏳ **Admin Onay** - Yeni kullanıcılar admin onayı bekler
- 👑 **Admin Panel** - Kullanıcıları onayla/reddet
- 📋 **Quest Sistemi** - Günlük görevler, streak takibi
- 🏦 **Savings Quest** - Solana TX ile otomatik doğrulama
- 📅 **Takvim** - Aylık ilerleme görünümü
- 💰 **Gelir/Gider** - Finansal takip

## 🚀 Kurulum

### 1. Bağımlılıkları yükle
```bash
npm install
```

### 2. Environment Variables
`.env.local` dosyası hazır. Vercel'e deploy ederken şunları ekle:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `HELIUS_API_KEY`

### 3. Çalıştır
```bash
npm run dev
```

### 4. Admin Ol
İlk kayıt olduktan sonra Supabase SQL Editor'da:
```sql
UPDATE profiles SET role = 'admin', status = 'approved' WHERE email = 'senin@emailin.com';
```

## 📦 Deploy (Vercel)

1. GitHub'a push et
2. vercel.com → New Project
3. Environment Variables ekle
4. Deploy!

---
Made with 💚
