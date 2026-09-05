# suiss — Frontend Teknoloji Kararı

> **suiss**, tek monorepo içinde iki ürün barındırır: **`wallet`** (bireysel ve kurumsal e-para cüzdanı) ve **`pay`** (üye işyerine kart kabulü sağlayan sanal POS). İkisi ortak tasarım sistemi ve ortak kod tabanından beslenir. Para tutan ve kart verisi işleyen bir platform olduğu için token saklama, oturum yönetimi ve PCI kapsam kararları buna göre alınmıştır. Sürüm bilgileri **5 Eylül 2026 itibarıyla doğrulanmıştır** (doğrulama kapsamı Özet Sürüm Tablosu'nun sonunda).

---

## 1. Mimari İlke

**KAPSAM: Bu doküman yalnızca FRONTEND kararlarını içerir.** Backend servisleri (API, veritabanı, mesaj kuyruğu, Novu self-host servisleri, sunucu tarafı rate limit, altyapı) kapsam dışıdır.

Tek istisna: **Next.js BFF katmanı** dahildir — teknik olarak sunucuda çalışsa da frontend uygulamasının parçası, frontend ekibinin sahipliğinde ve tek amacı token'ları tarayıcıdan uzak tutmak. Backend'den *beklenenler* (idempotency key desteği, DPoP doğrulama, imzalı URL üretimi vb.) ilgili yerlerde "backend gereksinimi" olarak işaretlenir ama tasarımı bu dokümanın konusu değildir.

Bütün yüzeyler (admin panel, user panel, mobil, Keycloak temaları, Novu dashboard) **tek bir Turborepo** içinde yaşar ve ortak paketlerden beslenir: tasarım sistemi, tipli API client, auth yardımcıları, para katmanı ve domain tipleri. Bir tasarım değişikliği veya API sözleşmesi güncellemesi tek yerden tüm yüzeylere yayılır.

### 1.1 İki ürün, tek monorepo

Bu doküman **iki ayrı ürünün** frontend'ini kapsar. İkisi aynı kod tabanını paylaşır ama farklı kitleye hizmet eder ve **farklı risk profiline** sahiptir:

| | `wallet` | `pay` |
|---|---|---|
| Ne | E-para cüzdanı — **bireysel ve kurumsal** | Sanal POS — üye işyerine kart kabulü |
| Kitle | Birey + şirket adına işlem yapan yetkili kullanıcılar | Üye işyeri sahibi + o işyerinin geliştiricisi + **işyerinin müşterisi** |
| Yüzey | Bizim uygulamamız | Büyük ölçüde **başkasının sitesinin içinde** çalışan kod |
| En büyük frontend riski | Oturum çalma → para kaybı | Kart verisi sızıntısı → **binlerce işyerini birden** etkileyen olay |
| Kart verisi | Görmez | **Görür** (Bölüm 35) |
| Dağıtım | Kendi domainimiz | Kendi domainimiz **+ üçüncü taraf sitelere gömülen script** |

Kritik asimetri: `wallet` hatası bir kullanıcıyı etkiler, `pay` hatası tüm üye işyeri ağını etkiler. Bu yüzden `pay`'in checkout yüzeyi bu dokümandaki **en katı** kurallara tabidir.

**Okuma haritası:** Bölüm 2–26 ve 38–39 iki ürün için de geçerli ortak temeldir. Bölüm 27–37 `pay`'e özeldir. Cüzdana özel kararlar Bölüm 7, 13, 16, 17'de, kurumsal cüzdana özel olanlar Bölüm 40'ta toplanır.

Temel kural: **kod ve tasarım tek kaynaktan (single source of truth), güvenlik en dışa açık yüzeyde en katı.**

---

## 2. Monorepo Temeli

| Katman | Karar | Sürüm | Gerekçe |
|---|---|---|---|
| Dil | TypeScript (strict) | 5.x | Para tutan projede tip güvenliği zorunlu; her pakette strict mode |
| Monorepo yönetimi | Turborepo | son | Cache'li, paralel build; app'ler ve paketler arası bağımlılık grafiği |
| Package manager | pnpm | **10.x** | En verimli disk kullanımı, sıkı bağımlılık izolasyonu, monorepo için ideal |
| Runtime | Node.js | **24 LTS** | Bkz. aşağıdaki not |

> **Runtime — neden Bun değil (bilinçli karar):** "En teknolojik" seçim Bun olurdu, ama cüzdanda **stabilite = güvenlik**. Performans kazanımları zaten build/tooling katmanından geliyor (Turbopack, Vite/Rolldown, Biome, React Compiler — hepsi Rust/native). Uygulama runtime'ını finansal bir üründe deneysel bir motora taşımak, kazandırdığından fazla risk getirir (Expo/native build uyumu, kenar durumlar). Bu yüzden kritik yolda **Node 24 LTS** — Eylül 2026 itibarıyla Aktif LTS hattı. Node 22 hâlâ destekli ama **Bakım LTS**'ine geçti (yalnız kritik güvenlik yaması, Nisan 2027'de bitiyor); yeni başlayan bir finansal projede bakım hattından başlamak baştan borçlanmaktır. Bun istenirse yalnızca hız-kritik yerel script'lerde opsiyonel kullanılabilir, kritik yola sokulmaz. Modern olmak, para söz konusu olan yerde temkinli olmayı gerektirir.

---

## 3. Uygulamalar (apps/)

### 3.1 `apps/web` — Cüzdan Paneli (bireysel + kurumsal)

**Next.js 16 (App Router) + Turbopack + React Compiler**

- **Neden Next.js, Vite değil:** Kritik gerekçe SEO değil, **BFF (Backend-for-Frontend)**. Token'lar `httpOnly` cookie'de tutulur, tarayıcıdaki JS bunlara hiç erişemez. Hassas API çağrıları Next server katmanında yapılır. Cüzdan = para; XSS karşısında bu koruma değerli.
- Ek olarak public/indekslenebilir sayfalar (ödeme linki, makbuz, davet) varsa SEO da kazanılır.
- **Next.js 16 performans kazanımları:** Turbopack artık hem dev hem production build'de varsayılan ve stabil (2-5x daha hızlı build, 5-10x daha hızlı Fast Refresh). React Compiler 1.0 built-in ve stabil — bileşenleri otomatik memoize eder, elle `useMemo`/`useCallback`/`React.memo` yazma ihtiyacını sıfırlar (daha hızlı runtime + daha temiz kod). Cache Components (`use cache`) ile ince taneli, edge-farkında caching.
- React 19.2, Server Components + Server Actions.
- **Tek uygulama, iki hesap tipi.** Bireysel ve kurumsal cüzdan ayrı uygulama değildir; aynı uygulama **hesap bağlamına** göre farklı bilgi mimarisi sunar. Gerekçe ve detay Bölüm 40'ta.

### 3.2 `apps/admin` — Admin Paneli (Web)

**Vite + React + TanStack Router**

- **Neden Vite, Next değil:** Admin dar ve güvenilir bir ekip kitlesine hizmet eder, genelde VPN/kurumsal ağ arkasındadır, saldırı yüzeyi küçüktür. Saf SPA'nın token riski burada kabul edilebilir. En hafif ve en hızlı dev deneyimi.
- Vite arkasında **Rolldown** (Rust bundler) — hızlı build.
- **React Compiler** (Vite plugin) burada da açık — otomatik memoization, elle optimizasyon boilerplate'i yok.
- TanStack Router ile tip-güvenli routing.

### 3.3 `apps/mobile` — Kullanıcı Mobil Uygulaması

**Expo (SDK 57, React Native 0.85+, New Architecture) + Expo Router**

- **Expo SDK 57** (Eylül 2026 stabil, RN 0.85+). New Architecture 2026'da varsayılan ve stabil; native'e yakın performans.
- **UI katmanı: `packages/uim` — React Native Reusables + NativeWind.** shadcn'in RN karşılığı: aynı bileşen API'si, aynı "kopyala-sahiplen" modeli, kendi içinde tanımlı token'lar. **Ayrı ve bağımsız pakettir — `packages/ui` mobilde kullanılamaz** (gerekçe Bölüm 4). Web ile paylaşılan şey tasarım dili ve API şeklidir, kod değil; ekip yine iki kez öğrenmez. NativeWind stilleri derleme zamanında RN `StyleSheet`'e derler (runtime string-parse yok) ve alttaki primitive'ler RN-native'dir (Radix zorlaması yok). Az npm bağımlılığı → küçük tedarik zinciri yüzeyi (Bölüm 15 ile uyumlu).
- **React Compiler** burada da açık — otomatik memoization, liste/animasyon ağırlıklı ekranlarda daha az re-render.
- Monorepo'da `packages/*` ile iş mantığı ve tip paylaşımı doğrudan mümkün.
- **Depolama katmanı:** hassas veri (token, seed) → **`expo-secure-store`** + cihaz keystore (pazarlık konusu değil). Hızlı non-sensitive state → **MMKV** (şifrelenmiş, senkron, AsyncStorage'dan kat kat hızlı).
- Build/dağıtım: **EAS Build + EAS Submit + EAS Update** (OTA güncelleme).

### 3.4 `apps/auth` — Keycloak Temaları

**Keycloakify 26**

- Login + account + admin + email temalarının hepsi tek JAR'a paketlenir.
- React tabanlı (Keycloakify'ın en tam entegrasyona sahip yolu).
- Keycloak sunucu sürümü: **26.7.x** (güncel stable; FAPI 2.0 Final, tam DPoP, entegre passkeys).
- Kritik avantaj: Keycloakify'ın yeni default görünümü de **shadcn/ui + Tailwind v4** üzerine kurulu — yani login ekranları ile paneller birebir aynı `packages/ui` token ve bileşenlerini paylaşır.

### 3.5 `apps/docs` — Dokümantasyon (tek uygulama, iki kitle)

**Fumadocs + `fumadocs-openapi`**

Tek bir doküman uygulaması hem iç mimari dokümantasyonunu hem üye işyeri geliştiricisinin okuduğu genel API referansını servis eder. Ayrı uygulama açılmaz — aynı arama, aynı bileşenler, aynı sürüm temposu.

- Next.js-native; API'nin OpenAPI spec'inden `fumadocs-openapi` ile üretilen referans sayfaları.
- Tarayıcıda çalışan statik full-text arama (Algolia gerektirmez).
- Aktif bakım, düzenli sürüm temposu (2026'da v16 hattı).
- _Alternatif:_ içerik ekibi teknik değilse hosted **Mintlify** düşünülebilir; git/MDX bilmeyen ekipler Fumadocs'ta zorlanır.

> **Kritik — genel/iç ayrımı:** Tek uygulama olmak, iç notların dışarı sızabileceği anlamına gelir. İçerik iki ayrı ağaçta tutulur (`content/public/`, `content/internal/`) ve **ayrım build zamanında** yapılır: genel dağıtım iç ağacı hiç derlemez, sadece route gizlemekle yetinilmez. İç doküman ayrı bir dağıtımda, kimlik doğrulamalı olarak yayınlanır. Bir MDX dosyasının yanlış ağaçta durması sızıntı demektir — CI bunu kontrol eder.

### 3.6 `apps/notify` — Bildirim Yönetim Panosu (Novu fork)

**Novu Dashboard fork'u (React)**

- Novu'nun self-hosted yönetim panosu (workflow/template/subscriber yönetimi) fork'lanıp baştan markaya uygun tasarlanır. Full redesign kararı verildi, bakım yükü kabul.
- **Lisans denetimi zorunlu:** Novu open-core; çekirdek MIT ama `/enterprise` ve bazı dashboard modülleri ticari lisanslı. Fork öncesi dokunulacak her modülün lisansı denetlenir (detay Bölüm 9.2).
- Redesign'da mümkün olduğunca `packages/ui` (shadcn + Tailwind v4) bileşenleri kullanılır — cüzdanın geri kalanıyla aynı tasarım dili.
- Ayrı repo + `upstream` remote ile sürüm takibi; görsel değişiklikler tema/override katmanında tutulur ki upstream merge'leri kolay olsun (detay Bölüm 9.2).

### 3.7 `apps/checkout` — Ortak Ödeme Sayfası

**Next.js 16 (App Router), ayrı origin, ayrı deploy**

- Üye işyerinin yönlendirdiği tam sayfa ödeme ekranı (sanal POS Model 3, bkz. Bölüm 28). Kart bilgisi **burada** girilir.
- **Kendi origin'inde yaşar** (`checkout.<domain>`) — cüzdan veya panel origin'iyle asla aynı değil. Bir XSS'in yatay geçişini keser.
- Bağımlılık bütçesi dokümandaki en sıkı olan: bu sayfaya kütüphane eklemek ayrı onay gerektirir (Bölüm 35).
- Üçüncü taraf script **sıfır** — analitik dahil. Ölçüm kendi origin'imizden, kendi kodumuzla.
- İşyeri markasına göre temalanır ama **düzen sabittir** (Bölüm 36).

### 3.8 `apps/elements` — Gömülebilir Kart Alanları

**Vite + React, iframe içinde çalışan mikro uygulama**

- `pay.js`'in iframe'e yüklediği asıl uygulama. Kart numarası / son kullanma / CVC alanlarının her biri ayrı iframe.
- Amaç: PAN üye işyerinin DOM'una **hiç girmez**; üye işyeri SAQ A'da kalır, kapsam bizde toplanır.
- Ana sayfa ile iletişim yalnızca `postMessage`, her mesajda `event.origin` doğrulanır (Bölüm 24).
- Sürümleme ve dağıtım kuralları Bölüm 30'da; bu uygulamanın **hiçbir sürümü** üye işyerince bundle'lanamaz.

### 3.9 `apps/merchant` — Üye İşyeri Paneli

**Next.js 16 (App Router) + BFF**

- İşyeri sahibi ve geliştiricisinin günlük çalıştığı yüzey: işlem listesi, iade/iptal, hakediş ve mutabakat, taksit ve komisyon ayarları, API anahtarları, webhook yönetimi.
- Vite değil Next: admin panelinin aksine bu panel **dış dünyaya açık** (herhangi bir işyeri kayıt olur), token BFF'te tutulmalı. Bölüm 3.2'deki "SPA riski kabul edilebilir" gerekçesi burada geçerli değil.
- Detaylı ekran ve durum kararları Bölüm 33'te.

---

## 4. Ortak Paketler (packages/)

| Paket | İçerik | Kimler kullanır |
|---|---|---|
| `packages/ui` | shadcn/ui + Radix + Tailwind CSS v4; **kendi token'larını kendi tanımlar** — yalnızca web | web, admin, checkout, merchant, auth, docs |
| `packages/uim` | React Native Reusables + NativeWind; **kendi token'larını kendi tanımlar** — yalnızca mobil | mobile |
| `packages/api-client` | `openapi-typescript` + `openapi-fetch` ile OpenAPI'den üretilen tipli client | admin, web, mobile |
| `packages/auth` | OIDC yapılandırması, token/session yardımcıları | admin, web, mobile |
| `packages/money` | Para tipleri, Dinero.js sarmalayıcı, formatlama + yuvarlama kuralları (bkz. Bölüm 11) | admin, web, mobile |
| `packages/types` | Domain tipleri (Transaction, Wallet, User, Balance...) | tüm app'ler |
| `packages/config` | Paylaşımlı tsconfig ayarları (base, next, react-library) | tüm app'ler |
| `packages/card` | Luhn doğrulama, BIN→banka/marka/tip çözümleme, kart maskeleme, taksit tablosu modeli | checkout, elements, merchant |
| `packages/checkout-sdk` | Üye işyerinin sitesine gömdüğü `pay.js`'in tip tanımları ve yükleyicisi. **Tek dışa yayınlanan paket** | dış üye işyerleri |

**Tasarım sistemi — iki bağımsız implementasyon:** Web tarafı shadcn/ui + Radix + Tailwind v4 (`packages/ui`), mobil tarafı React Native Reusables + NativeWind (`packages/uim`). **Her paket kendi token'larını kendisi tanımlar**; aralarında paket bağımlılığı yoktur.

> **Kritik ayrım — API benzerliği ≠ kod paylaşımı.** RNR, shadcn'in API şeklini bilinçli olarak taklit eder: `<Button variant="destructive" size="sm">` iki tarafta da aynı okunur, ekip iki kez öğrenmez. Ama bu **iki ayrı implementasyondur**, aynı paket değil. Web bileşenleri React Native'de çalışamaz:
>
> | Web'de var | Mobilde karşılığı |
> |---|---|
> | `radix-ui` primitive'leri | Yok — DOM'a bağlı |
> | `<div>`, `<button>`, `<span>` | Yok — `View`, `Pressable`, `Text` |
> | Keyfi seçiciler (`[&_svg]:size-4`) | NativeWind desteklemiyor |
> | `:has()` varyantları (`has-data-[...]`) | Yok |
> | `color-mix()`, `ring`, `transition-all` | CSS'e bağlı, RN'de yok |
>
> Yani sadece bileşen değil, **class string'lerinin kendisi bile** taşınabilir değil. Bu yüzden `packages/ui` mobil tüketicisi olmayan, web'e özel bir pakettir.

**Neden ortak token paketi yok (bilinçli karar):** Token'lar ayrı bir pakete çıkarılmadı. Tailwind v4 CSS-first (`@theme` bloğu), NativeWind ise JS yapılandırma bekliyor — tek dosya ikisini birden besleyemiyor, arada üretim adımı gerekiyordu. Bu ek karmaşıklık yerine her paketin kendi token tanımını taşıması tercih edildi. `packages/ui`'nin `packages/uim` tarafından import edilmemesi de böylece yapısal olarak garanti kalır (Metro üzerinden Radix ve DOM'a bağlı kodun mobil bundle'ına sızma riski yok).

> **Kabul edilen bedel — token sürüklenmesi.** İki paket bağımsız olduğu için marka renkleri, aralık ve tipografi ölçekleri zamanla ayrışabilir. Bu risk kabul edilmiştir; karşılığında **tasarım token'ları tek bir yazılı referanstan** (tasarım dosyası) beslenir ve token değerleri değiştiğinde **iki paket birlikte güncellenir**. Görsel regresyon testi (Bölüm 10) web tarafındaki kaymayı yakalar; mobil tarafın karşılığı ekip disiplinidir.

**`packages/money` genişler:** cüzdan tarafı yalnızca tutar taşırken sanal POS tarafı **komisyon, taksit vade farkı, hakediş ve mutabakat** aritmetiği getiriyor. Bunlar da aynı pakete girer — üç ayrı yerde taksit hesabı yapılması yasak (Bölüm 31).

**API client:** `openapi-typescript` + `openapi-fetch`. Cüzdan API'sinden (OpenAPI spec) tipli client üretilir; web ve mobil aynı client'ı paylaşır. Backend-agnostik olduğu için (Java/Go/başka dil olabilir) güvenlik-kritik ayrı bir servis için en sağlam yol budur. Para söz konusuyken tek kaynak ve tip güvenliği hayati.

> **oRPC seçeneği:** Eğer backend'i (veya Next BFF katmanını) TypeScript yazıyorsan, `openapi-fetch` yerine **oRPC** değerlendirilebilir: uçtan uca tip güvenliği + OpenAPI 3.1 çıktısı + Standard Schema (Valibot/Zod) desteği + edge uyumu, tRPC benzeri DX ile. tRPC'nin aksine OpenAPI üretebildiği için hem kendi client'ın hem üçüncü taraflar için tek kaynak olur. Backend TS değilse openapi-typescript'te kal.

---

## 5. Kesişen Kararlar (Cross-cutting)

| İhtiyaç | Karar | Not |
|---|---|---|
| UI/global state | **Zustand** | 1.1KB, boilerplate yok; 2026'da en performanslı pragmatik seçim. Denetlenebilirlik ve öngörülebilir güncelleme cüzdanda değerli |
| Server state | **TanStack Query v6** | Fetch, cache, arka plan yenileme; server state'in çoğunu bu yönetir |
| URL state | **nuqs** | Filtre/sekme/sayfa durumu URL'de, tip-güvenli; paylaşılabilir cüzdan linkleri için ideal |
| Form + validasyon | **Valibot** (+ React Hook Form) | Bundle-kritik seçim: tipik şema ~1.4KB (Zod ~14KB). Mobil ve client tarafında ciddi bundle/soğuk-başlangıç kazancı. Standard Schema uyumlu (Zod ile interop mümkün) |
| Auth (web) | **Next.js BFF + httpOnly cookie + DPoP** | Token JS'e hiç düşmez, sender-constrained |
| Auth (admin) | **react-oidc-context + DPoP** | OIDC SPA akışı, sender-constrained token |
| Auth (mobil) | **expo-auth-session (OIDC + PKCE + DPoP)** + expo-secure-store | PKCE + DPoP zorunlu |
| i18n | **i18next / react-i18next** | TR + EN, çeviriler `packages` seviyesinde paylaşılabilir |

---

## 6. Geliştirme Araç Zinciri (Tooling)

| Kategori | Karar | Eski default | Gerekçe |
|---|---|---|---|
| Format + Lint | **Biome** (her yerde, tek araç) | Prettier + ESLint | ESLint yok. Tek araç, tek config, 20-50x hız, type-aware lint, sıfır kafa karışıklığı |
| Bundler (web app) | **Turbopack** (Next), **Vite + Rolldown** (admin) | webpack | Rust tabanlı; Turbopack Next 16'da varsayılan ve stabil |
| Derleyici optimizasyonu | **React Compiler 1.0** | elle memoization | Otomatik memoization, tüm React yüzeylerinde açık |
| Test runner | **Vitest** | Jest | Vite ile aynı pipeline |
| E2E test (web) | **Playwright** | — | Cüzdan akışları için kritik |
| E2E test (mobil) | **Maestro** | — | Expo ile uyumlu, sade |
| Git hooks | **Lefthook** + lint-staged | Husky | Go tabanlı, paralel; sadece staged dosyalarda çalışır |
| TS script çalıştırma | **tsx** | ts-node | Sıfır config, anında TS |
| Env doğrulama | **@t3-oss/env + Zod** | elle process.env | Eksik env'de build patlar, tip-güvenli |
| Sürümleme + changelog | **Changesets** + commitlint | elle | Monorepo paketleri için sürüm/changelog otomasyonu |
| CI/CD | GitHub Actions + Turborepo remote cache | — | Paralel, cache'li pipeline |
| Deploy (web/docs) | Vercel veya self-host | — | Next için doğal |
| Deploy (mobil) | EAS Build + Submit + Update | — | Expo'nun resmi hattı |

> **Not — lint kararı kesin:** Sadece Biome. ESLint ve oxlint kullanılmıyor. Biome hem format hem lint yapıyor; Next/Expo'nun framework-özel birkaç kuralını kaçırma bedeli, tek-araç sadeliği ve daha az hareketli parça karşısında kabul edildi. Az bağımlılık = az saldırı yüzeyi, bu da cüzdanda bir güvenlik artısı.

---

## 7. Kimlik ve Token Güvenlik Katmanı (modern posture)

Para tutan bir proje olduğu için standart stack'in üstüne modern, saldırıya-dayanıklı bir güvenlik katmanı kuruluyor. Bu bölüm **iki ürün için de** geçerlidir: `wallet` son kullanıcıyı, `pay` üye işyeri sahibini ve geliştiricisini aynı Keycloak altyapısı üzerinden doğrular. Kart hamili tarafı oturum açmaz, dolayısıyla bu bölümün kapsamı dışındadır.

### Kimlik doğrulama (Keycloak 26.7 üzerinden)
- **FAPI 2.0 (finansal-sınıf profil) — hedef uyumluluk:** Keycloak FAPI 2.0 Security Profile ve Message Signing (Final) destekliyor. Cüzdan finansal bir ürün olduğu için auth katmanı bu profile göre yapılandırılır — bu, "en güvenli" hedefinin somut standardı.
- **Passkeys / WebAuthn:** Parola yerine FIDO2 passkey. Keycloak 26.4+ ile login formlarına conditional + modal UI olarak entegre; discoverable credential (required/preferred/discouraged), ES256, user verification zorunlu. iCloud Keychain / Google Password Manager / 1Password uyumlu. Phishing'e dayanıklı — cüzdan için en modern giriş.
- **MFA / TOTP + recovery codes:** Passkey kullanılmayan akışlarda ikinci faktör; recovery codes tam destekli.
- **Argon2id** parola hash'leme (Keycloak default) — PBKDF2'ye göre aynı CPU maliyetinde daha güçlü.
- **Step-up authentication:** Yüksek riskli işlemlerde (transfer, ayar değişikliği) ek doğrulama.

### Token güvenliği
- **DPoP (sender-constrained tokens) — tam destek:** Keycloak 26.4+ ile DPoP tam destekleniyor; token belirli istemciye bağlanır, çalınan token başka cihazda kullanılamaz. Admin/Account REST API dahil tüm endpoint'ler DPoP token işleyebiliyor, public client'larda refresh token binding mümkün. Bearer token'a göre ciddi upgrade.
- **Token saklama:** web'de httpOnly + Secure + SameSite cookie (BFF); mobilde expo-secure-store + keystore. Tarayıcı localStorage'da token **asla** tutulmaz.
- **PKCE:** Tüm OIDC akışlarında zorunlu.
- **Kısa access token ömrü + refresh token rotasyonu (tek kullanımlık):** Çalınan token penceresini daraltır, replay'i engeller.

### Uygulama katmanı
- **Sıkı CSP (nonce tabanlı, CSP Level 3):** XSS yüzeyini minimize eder. Next 16'da server-rendered nonce ile uyumlu.
- **Güvenlik başlıkları:** HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **Subresource Integrity (SRI):** Dış script/style bütünlüğü.
- **API client seviyesinde tip güvenliği:** Yanlış tutar/para birimi gibi hataları derleme zamanında yakalar (Zod + openapi tipleri).

### Mobil
- **Sertifika pinning:** MITM'e karşı; API sertifikası uygulamaya sabitlenir.
- **Biyometrik kilit:** Uygulama açılışı ve kritik işlemlerde Face ID / parmak izi.
- **Jailbreak/root tespiti + ekran kaydı/screenshot engelleme** hassas ekranlarda.

### Tedarik zinciri (supply chain)
- **pnpm** ile kilitli, deterministik bağımlılıklar; `--frozen-lockfile` CI'da zorunlu.
- **Otomatik bağımlılık denetimi** (Dependabot/Renovate + audit) — cüzdanda bir bağımlılık açığı = doğrudan risk.
- Az bağımlılık felsefesi (tek araç Biome gibi tercihler) saldırı yüzeyini bilinçli küçültür.

---

## 8. Klasör Yapısı

```
suiss/
├─ apps/
│  ├─ admin/            # Vite + React + TanStack Router
│  ├─ web/              # Next.js App Router (BFF)
│  ├─ mobile/           # Expo SDK 57
│  ├─ auth/             # Keycloakify 26 (login/account/email temaları)
│  ├─ docs/             # Fumadocs (genel API referansı + iç doküman)
│  ├─ notify/           # Novu Dashboard fork (redesign)
│  ├─ checkout/         # Ortak ödeme sayfası — AYRI ORIGIN
│  ├─ elements/         # Gömülebilir kart alanları (iframe)
│  └─ merchant/         # Üye işyeri paneli
├─ packages/
│  ├─ ui/               # shadcn + Radix + Tailwind v4 — WEB ONLY
│  ├─ uim/              # RN Reusables + NativeWind — MOBİL ONLY
│  ├─ api-client/       # openapi-typescript tipli client
│  ├─ auth/             # OIDC config + token/session
│  ├─ money/            # para tipleri, Dinero.js, formatlama (KRİTİK)
│  ├─ types/            # domain tipleri
│  ├─ card/             # Luhn, BIN, taksit tablosu (KRİTİK)
│  ├─ checkout-sdk/     # dışa yayınlanan pay.js (KRİTİK)
│  └─ config/           # paylaşımlı tsconfig ayarları
├─ turbo.json
├─ pnpm-workspace.yaml
├─ biome.json
└─ lefthook.yml
```

---

## 9. Bildirimler

Novu iki ayrı yüzeyde kullanılır ve ikisi de yeniden tasarlanır:

### 9.1 End-user Inbox (kullanıcının gördüğü feed)

**Novu** — `@novu/react` (web) + `@novu/react-native` (mobil).

Inbox, Bell, Notification ve Preferences bileşenleri render prop API'si ile (renderSubject, renderBody, renderDefaultActions, renderBell) tamamen kendi tasarım dilinize özelleştirilir. Layout olarak popover, yan menü veya tam sayfa kurulabilir. `packages/ui`'dan beslenir.

### 9.2 Novu Dashboard (ekip yönetim panosu) — FULL FORK + REDESIGN

Novu'nun self-hosted yönetim panosu (workflow/template/subscriber yönetimi) fork'lanıp baştan markaya uygun tasarlanacaktır. Bakım yükü (upstream merge sorumluluğu) kabul edilmiştir.

**Kritik önkoşul — lisans denetimi (başlamadan önce zorunlu):**
Novu open-core modeli kullanır. Çekirdek MIT lisanslıdır ancak `/enterprise` klasörü ve belirli dashboard modülleri **ticari lisans** altındadır. Fork'lamadan önce dokunulacak her modülün lisansı tek tek denetlenmeli; ticari lisanslı modüller değiştirilmemeli veya ticari lisans şartlarına uyulmalıdır. Cüzdan ticari bir ürün olduğu için bu adım pazarlık konusu değildir.

**Fork disiplini (merge acısını azaltmak için):**
- Fork ayrı bir repo olarak tutulur (`suiss-notify` gibi), monorepo'ya git submodule veya ayrı deploy olarak bağlanır.
- Upstream `novuhq/novu` bir `upstream` remote olarak eklenir; sürüm etiketleri düzenli takip edilir.
- Görsel değişiklikler mümkün olduğunca **ayrı bir tema/override katmanında** tutulur; çekirdek mantığa dokunmak minimize edilir. Bu, upstream merge'lerini kolaylaştırır.
- Dashboard bir React uygulamasıdır; yeniden tasarımda `packages/ui` (shadcn + Tailwind v4) token ve bileşenleri mümkün olduğunca yeniden kullanılır, böylece cüzdanın geri kalanıyla tutarlı kalır.
- Fork'un kendi CI/CD hattı olur; her upstream sürümünde merge + regression testi çalıştırılır.

**Kapsam notu:** Novu'nun self-host servisleri (API, Worker, WebSocket ve veri katmanı) **backend kapsamındadır, bu dokümana dahil değildir.** Bu dokümanda sadece fork'lanan Dashboard'un **frontend katmanı** (React uygulaması, tasarım, build, deploy artefaktı) ele alınır.

---

## 10. Kod Sağlığı, Kalite Kapıları ve DX Araçları

Çekirdek hattın (bölüm 6) üstüne, monorepo'yu temiz ve güvenli tutan ikinci katman. Bunlar CI'da "kalite kapısı" olarak çalışır; bir cüzdan projesinde özellikle güvenlik-tarama araçları pazarlık konusu değildir.

### Kod hijyeni / monorepo düzeni
| Araç | İş |
|---|---|
| **Knip** | Ölü kod, kullanılmayan dosya/export/bağımlılık tespiti. Monorepo'da bloat'ı önler, bundle'ı küçük tutar |
| **sherif** | Rust tabanlı monorepo linter; paketler arası sürüm uyumsuzluğu ve yaygın workspace hatalarını yakalar (hızlı CI kapısı) |
| **syncpack** | Bağımlılık sürümlerini tüm workspace'te tek noktadan hizalar (autofix) |
| **tsc --noEmit** | Ayrı tip-kontrol kapısı. Biome type-aware'i tam kapsamadığı için CI'da bağımsız tsc geçişi şart |
| **publint + are-the-types-wrong** | `packages/*` iç paketlerinin export/type haritasını doğrular |

### Güvenlik taraması (bu projede kritik)
| Araç | İş |
|---|---|
| **gitleaks** | Sır taraması — commit'e API key / seed / token sızmasını engeller (pre-commit + CI). Cüzdanda en kritik kapı |
| **osv-scanner** | Bağımlılık zafiyeti taraması (Google OSV veritabanı) |
| **Semgrep** | SAST — statik güvenlik analizi, kod seviyesinde zafiyet deseni yakalar |
| **Renovate** | Otomatik bağımlılık güncelleme + zafiyet yaması PR'ları |

### Tasarım sistemi DX
| Araç | İş |
|---|---|
| **Storybook** | `packages/ui`'yi izole geliştir/dokümante et; tüm yüzeyler aynı bileşenleri tükettiği için tek doğruluk kaynağı |
| **Görsel regresyon** (Chromatic vb.) | UI değişikliklerini otomatik yakalar — cüzdan arayüzünde kazara bozulmayı önler |
| **axe-core** (Playwright ile) | Erişilebilirlik (a11y) test kapısı |

### Test derinliği
| Araç | İş |
|---|---|
| **MSW (Mock Service Worker)** | API mock'lama; testleri gerçek backend'den bağımsızlaştırır |
| **Vitest coverage** (v8) | Kapsam raporu + CI eşiği |
| **size-limit** | Bundle boyut bütçesi; web bundle'ları büyüyünce CI kırılır |

> **Neden ilk turda yoktu:** İlk tablo kasıtlı olarak "kodu çalıştıran çekirdek hat" ile sınırlıydı. Bu katman "kodu sağlıklı ve güvenli tutan" ayrı bir tier — ve haklısın, çok paketli + finansal bir projede bunlar gerçekten gerekli, opsiyonel değil.

---

## 11. Para ve Sayı Katmanı (EN KRİTİK)

> Bir cüzdan projesinde en sık ve en pahalı hata burada yapılır. JavaScript'in `number` tipi IEEE 754 double'dır ve para için **uygun değildir** — `0.1 + 0.2 !== 0.3`. Biriken yuvarlama hataları toplam tutarlarda gerçek para farkına dönüşür.

### Kurallar (ihlal edilemez)
1. **Para asla `number` (float) olarak tutulmaz.** Ne state'te, ne API'de, ne veritabanında.
2. **Tam sayı (minor unit) taşınır:** 10,50 TL → `1050` (kuruş). Stripe'ın da benimsediği yaklaşım; tam sayı aritmetiği güvenli ve hızlı.
3. **Para daima `{amount, currency, scale}` üçlüsüdür.** Çıplak sayı dolaşmaz — para birimi olmayan tutar tip sistemi tarafından reddedilir.
4. **Yuvarlama tek noktada, açıkça yapılır**; yuvarlama modu (banker's rounding vs half-up) yazılı olarak kararlaştırılır.
5. **JSON'da tutar string veya integer'dır**, float değil.

### Kararlar
| İhtiyaç | Karar | Not |
|---|---|---|
| Para nesnesi + aritmetik | **Dinero.js v2** | Martin Fowler'ın Money pattern'i; immutable, tree-shakeable, çok para birimi, `allocate` ile kuruş kaybı olmadan paylaştırma |
| Yüksek hassasiyet / kripto | **decimal.js** | Kripto varlıklar 8-18 ondalık kullanır; integer minor-unit taşmaya yaklaşırsa arbitrary-precision gerekir |
| Çok büyük tam sayı | **BigInt** (native) | Wei/satoshi gibi 18 haneli değerler için bağımlılıksız çözüm |
| Görüntüleme / formatlama | **`Intl.NumberFormat`** (native) | Locale'e duyarlı para formatı; ek bağımlılık yok |
| Tip güvenliği | **Branded types** (`type Minor = number & {__brand:'minor'}`) | Major/minor karıştırmayı derleme zamanında engeller |

`packages/money` adında ayrı bir paket açılır: tüm para tipleri, dönüşümler, formatlama ve yuvarlama kuralları **tek yerde**. Web, mobil ve admin aynı paketi kullanır — para mantığının kopyalanması yasak.

---

## 12. UI / Uygulama Kütüphaneleri

Genel ilke: **her kütüphane bir bütçedir.** Hem bundle (performans) hem bağımlılık sayısı (güvenlik) önemli olduğu için, native çözüm varsa kütüphane eklenmez.

### Animasyon
| İhtiyaç | Karar | Gerekçe |
|---|---|---|
| Genel UI animasyon (web) | **Motion** (eski Framer Motion) | React'e en uygun deklaratif API, gesture + layout animasyonları. ~30KB olduğu için **seçici** kullanılır |
| Basit liste/DOM geçişleri | **AutoAnimate** (~1KB) | Vakaların çoğunu tek satırla çözer; Motion'a gerek kalmaz |
| CSS ile çözülebilenler | **Tailwind / native CSS** | Sıfır JS — varsayılan tercih |
| Mobil | **Reanimated 4 + Gesture Handler** | UI thread'de çalışır, 60/120fps |

> **Kural:** Veri yoğun ekranlarda (işlem listesi, dashboard) animasyon minimumda tutulur — aşırı animasyon algılanan performansı düşürür ve render maliyetini artırır. Motion sadece etkileşim seviyesinde kullanılır, tüm ekrana yayılmaz.

### Grafik / Chart
| İhtiyaç | Karar |
|---|---|
| Standart dashboard grafikleri (web) | **Recharts** — React-first, SSR/RSC uyumlu; shadcn'in chart katmanı zaten bunun üstünde, ekstra bağımlılık yok |
| Büyük veri seti (10k+ nokta) | **Apache ECharts** (canvas) — sadece gerekirse, lazy import ile |
| Mobil | **Victory Native** veya **react-native-gifted-charts** |

### Tablo / Liste (işlem geçmişi — her iki üründe de en yoğun ekran)
| İhtiyaç | Karar |
|---|---|
| Tablo mantığı | **TanStack Table** (headless) — markup senin, mantık kütüphanenin |
| Sanallaştırma (web) | **TanStack Virtual** — binlerce satırı DOM'u şişirmeden render eder |
| Sanallaştırma (mobil) | **FlashList** (Shopify) — FlatList'e göre çok daha az bellek, akıcı scroll |
| Sonsuz kaydırma | **TanStack Query `useInfiniteQuery`** |

### Temel UI parçaları
| İhtiyaç | Karar |
|---|---|
| Erişilebilir primitives | **Radix UI** (shadcn'in temeli) — a11y hazır |
| İkonlar | **Phosphor Icons** (`@phosphor-icons/react`) — 6 ağırlık (thin/light/regular/bold/fill/duotone), tree-shakeable, 9000+ ikon. Mobilde `phosphor-react-native`. **Not:** varsayılan barrel import bundle'ı şişirir — mutlaka doğrudan/alt-yol import kullanılır ve `size-limit` ile denetlenir |
| Toast / bildirim UI | **Sonner** — hafif, shadcn ekosisteminde standart |
| Komut paleti (admin) | **cmdk** — admin verimliliği |
| Tarih seçici | **react-day-picker** (shadcn Calendar) |
| Sürükle-bırak | **dnd-kit** — modern, a11y destekli |

### Tarih / Zaman
| Karar | Gerekçe |
|---|---|
| **date-fns v4** (+ `@date-fns/tz`) | Tree-shakeable, immutable. Moment.js **kullanılmaz** (deprecated, mutable, devasa) |
| **`Intl.DateTimeFormat`** | Locale formatlama için native |
| **Her zaman UTC sakla, sadece görüntülerken çevir** | Finansal kayıtta zaman dilimi hatası = mutabakat hatası |

### Diğer uygulama ihtiyaçları
| İhtiyaç | Karar |
|---|---|
| QR kod üretme/okuma | `qrcode.react` (web) + `expo-camera` (mobil) — ödeme linki / adres paylaşımı |
| Makbuz / PDF | İstemcide üretim gerekiyorsa `@react-pdf/renderer`. **Tercih:** üretimi backend'e bırak (istemciye fazla veri inmez) — frontend sadece indirir/gösterir |
| Dosya yükleme (KYC) | İmzalı URL ile object storage'a; boyut + MIME doğrulaması **hem client hem server** |
| E-posta şablonları | **React Email** — Novu ile birlikte, `packages/ui` token'larıyla tutarlı |
| Gerçek zamanlı (bakiye/işlem) | **WebSocket** + TanStack Query invalidation |
| Font | **Variable font, self-hosted** (`next/font`) — CLS yok, üçüncü taraf CDN yok (gizlilik + bir bağımlılık eksi) |
| Görsel optimizasyon | `next/image` (web), `expo-image` (mobil) |

---

## 13. Mobil Özel Katman

| İhtiyaç | Karar | Not |
|---|---|---|
| UI / bileşenler | **`packages/uim`** — React Native Reusables + NativeWind | shadcn RN karşılığı; kendi token'larını taşır, derleme-zamanı stil. `packages/ui` mobilde **kullanılmaz** |
| Navigasyon | **Expo Router** | Dosya tabanlı, deep-link doğal |
| Liste performansı | **FlashList** | İşlem geçmişi için kritik |
| Animasyon/gesture | **Reanimated 4 + Gesture Handler** | UI thread |
| Biyometrik | **expo-local-authentication** | Uygulama kilidi + kritik işlem onayı |
| Sır saklama | **expo-secure-store** | Keychain / Keystore |
| Hızlı depolama | **MMKV** (şifreli) | Non-sensitive state |
| Push | **expo-notifications** + Novu | |
| Ekran güvenliği | **expo-screen-capture** | Bakiye/seed ekranlarında screenshot ve kayıt engeli |
| Bütünlük kontrolü | **Play Integrity / App Attest** | Root/jailbreak ve sahte istemci tespiti |
| Sertifika pinning | Native SSL pinning | MITM koruması |
| OTA güncelleme | **EAS Update** | Kritik: OTA ile **native güvenlik kodu değiştirilemez**, sadece JS. Native güvenlik yamaları store üzerinden gider |

---

## 14. Gözlemlenebilirlik, Kalite ve Operasyon

Cüzdanda "ne olduğunu bilememek" başlı başına bir güvenlik açığıdır.

| İhtiyaç | Karar | Not |
|---|---|---|
| Hata izleme | **Sentry** (web + mobil + Next) | Source map'li stack trace, release takibi |
| Tracing / metrik | **OpenTelemetry (browser + BFF)** | Sadece istemci ve BFF katmanı; backend tracing kapsam dışı. Trace ID'yi backend'e iletir |
| Web performans (RUM) | **Core Web Vitals** takibi | LCP, INP, CLS bütçeleri CI'da kontrol |
| Bundle bütçesi | **size-limit** (CI kapısı) | Bundle büyürse build kırılır |
| Feature flag | **OpenFeature** standardı + provider | Riskli finansal özellikleri kademeli açmak, kill-switch |
| Ürün analitiği | **PostHog** (self-host tercih) | Cüzdan verisi hassas; self-host gizlilik açısından daha güvenli |
| Log | Yapılandırılmış JSON log | **PII, tutar ve token asla loglanmaz** — log redaction zorunlu |
| Bot / abuse koruması | **Turnstile** widget (frontend) + BFF katmanında doğrulama | Asıl rate limit backend'in işi; frontend widget'ı ve BFF doğrulamasını sağlar |
| Erişilebilirlik | **axe-core** CI kapısı + WCAG 2.2 AA | Finansal ürünlerde yasal gereklilik olabiliyor |

> **Gizlilik notu:** Üçüncü taraf script'leri (analytics, chat widget vb.) cüzdan panellerinde **çalıştırılmaz** veya sıkı CSP altında izole edilir. Her dış script bir oturum çalma riskidir. Analitik gerekiyorsa self-host tercih edilir.

---

## 15. Tedarik Zinciri Güvenliği (frontend'in en büyük güncel riski)

2026'da frontend'e yönelik en gerçek tehdit npm tedarik zinciri. Kendi kodun kusursuz olsa bile, bir bağımlılık ele geçirildiğinde cüzdan kullanıcılarının oturumu tehlikeye girer. Tehdit manzarası ciddi biçimde kötüleşti: kendi kendine yayılan solucanlar izole olayları zincirleme reaksiyona çevirdi ve Mart 2026'daki Axios saldırısı ilk 10'daki paketlerin bile güvende olmadığını gösterdi.

### Zorunlu kontroller
| Kontrol | Uygulama |
|---|---|
| **Lifecycle script'leri kapalı** | Global `ignore-scripts=true`; native derleme gereken paketler tek tek allowlist'lenir. En yaygın malware çalıştırma yolunu kapatır |
| **Kilitli, sabit sürümler** | `pnpm-lock.yaml` commit'lenir; CI'da `--frozen-lockfile` zorunlu. Range (`^`, `~`) yerine sabit sürüm |
| **Karantina penceresi** | Yeni yayınlanan sürümler X gün beklemeden production'a alınmaz — solucan dalgalarının en aktif olduğu ilk saatleri atlar |
| **Davranışsal tarama** | **Socket.dev** — CVE eşleştirmesi değil, paket davranışı analizi (ağ erişimi, dosya sistemi, obfuscation). Zararlıyı kurulumdan *önce* yakalar |
| **Zafiyet taraması** | `osv-scanner` + `pnpm audit --audit-level=high` CI kapısı |
| **SBOM üretimi** | Her build'de SBOM — olay anında maruziyeti dakikalar içinde çıkarabilmek için |
| **Provenance doğrulama** | `npm audit signatures` ile Sigstore attestation kontrolü |
| **Bağımlılık azaltma** | Her yeni paket bir karar; küçük yardımcı paketler yerine kendi kodun. Biome tercihimizin (tek araç) bir gerekçesi de bu |

> **Kritik uyarı — provenance yeterli değil:** Sigstore/provenance sinyali tek başına güven kaynağı sayılmamalı. Mayıs 2026'da 633 zararlı npm sürümü, saldırgan ele geçirdiği maintainer hesabından geçerli imza sertifikaları ürettiği için Sigstore doğrulamasından geçti; sistem paketin CI'da build edildiğini doğruladı ama kimlik bilgisini elinde tutanın yayınlamaya yetkili olup olmadığını anlayamadı. Bu yüzden **katmanlı savunma** şart: kapalı install script'leri, sabit lockfile, otomatik tarama ve yeni sürümler için karantina penceresinin birlikte kullanılması gerekiyor — tek başına hiçbir kontrol kararlı bir saldırgana karşı yolu kapatmıyor.

---

## 16. İşlem Bütünlüğü (frontend sorumluluğu)

Cüzdanda "iki kez gönderilen transfer" en pahalı frontend hatasıdır. Bunlar tamamen istemci tarafı disiplinidir:

| Konu | Karar |
|---|---|
| **Idempotency key** | Her para hareketi mutasyonunda istemci **UUID v4 üretir** ve `Idempotency-Key` header'ı ile gönderir. Retry'da **aynı key** kullanılır — yeni key üretmek çift işlem demektir. (Backend gereksinimi: key'i tanıması) |
| **Çift gönderim engeli** | Submit butonu mutasyon `isPending` iken kilitli; ayrıca mutation-level guard. Sadece görsel disable yetmez |
| **Optimistic update yasağı** | Bakiye ve işlem sonucunda **optimistic UI kullanılmaz**. Kullanıcıya sunucu onaylamadan "gönderildi" gösterilmez. (Optimistic sadece yorum/etiket gibi finansal olmayan alanlarda) |
| **Retry politikası** | TanStack Query'de para mutasyonları için `retry: false` (otomatik retry çift işlem riski). Retry kullanıcı aksiyonuyla ve aynı idempotency key ile |
| **Belirsiz durum UX'i** | Timeout/ağ hatasında "başarısız" **denmez** → "durum doğrulanıyor" gösterilir ve işlem durumu sorgulanır. Yanlış "başarısız" mesajı kullanıcıyı tekrar göndermeye iter |
| **Tutar doğrulama** | Client-side validation sadece UX içindir; **hiçbir zaman güvenlik sınırı değildir**. Yine de bakiye/limit kontrolü UI'da yapılır ki kullanıcı boşuna gönderim yapmasın |
| **İşlem onay ekranı** | Tutar, alıcı ve ücret **gönderimden önce ayrı bir onay adımında** gösterilir; kritik işlemlerde step-up auth tetiklenir |

---

## 17. Offline ve Ağ Dayanıklılığı

Cüzdanda offline stratejisi **kasıtlı olarak sınırlıdır** — finansal veri eskimiş gösterilemez.

| Katman | Karar |
|---|---|
| Okuma (read) | **TanStack Query persistence** (mobilde MMKV, webde IndexedDB) — sadece *son görülen* bakiye/işlem, açıkça "son güncelleme: HH:MM" etiketiyle |
| Yazma (write) | **Offline kuyruk YOK.** Para hareketi offline kuyruğa alınmaz — kullanıcı bağlantı gelince "hangi tutar hangi kurla gitti" belirsizliğine düşer. Offline'da transfer ekranı devre dışı |
| Sync motoru | **Gerekmiyor.** PowerSync/WatermelonDB gibi tam sync motorları bu proje için over-engineering; ayrıca sync altyapısı backend kapsamında |
| Statik varlıklar | Service Worker ile app shell cache (PWA) — ama **API yanıtları cache'lenmez** |
| Ağ hatası UX'i | Global offline banner; kritik ekranlarda "yeniden dene" ile açık geri bildirim |

> **Gerekçe:** Offline-first mimariler yazma kuyruğu ve çakışma çözümü gerektirir; para söz konusuyken çakışma çözümü kullanıcı zararına dönüşebilir. Basit ve öngörülebilir davranış burada daha güvenli.

---

## 18. Oturum ve Yetkilendirme (istemci tarafı)

| Konu | Karar |
|---|---|
| Oturum zaman aşımı | **Idle timeout** (ör. 10 dk hareketsizlik) + **absolute timeout**. Sayaç görünür, son 60 sn'de uyarı |
| Sekme senkronizasyonu | `BroadcastChannel` ile çoklu sekmede eşzamanlı logout — bir sekmede çıkış, hepsinde çıkış |
| Arka plana alma (mobil) | Uygulama arka plana alındığında **ekran maskelenir**; öne dönüşte biyometrik kilit |
| Yetki (RBAC) | Rol/claim'ler token'dan okunur; **UI gizleme güvenlik değildir** — sadece UX. Gerçek yetki backend'de |
| Route koruması | Next middleware (web) / TanStack Router `beforeLoad` (admin) ile merkezi guard |
| Token yenileme | Sessiz refresh; yarış durumu için tek uçuşta (single-flight) refresh — paralel 401'ler tek yenilemeye toplanır |
| Çıkış | Keycloak `end_session_endpoint` ile **gerçek SSO logout**; sadece local temizlik yetmez |
| Cihaz/oturum yönetimi | Kullanıcı panelinde "aktif oturumlar" ekranı + uzaktan sonlandırma |

---

## 19. Uyumluluk — Frontend Yükümlülükleri

> **Önemli — bu bölüm `wallet` içindir.** `pay` (sanal POS) hizmet sağlayıcı rolünde olduğu için PCI kapsamı çok daha geniştir ve bu bölümün yerine **Bölüm 35** geçerlidir. Aşağıdaki "üçüncü taraf iframe'e bırak, SAQ A'da kal" stratejisi `pay` için uygulanamaz.

Cüzdan ödeme sayfaları barındırdığı için PCI DSS'in **istemci tarafı** maddeleri doğrudan frontend'i bağlar. 6.4.3 ve 11.6.1 Mart 2025'ten beri zorunlu.

### PCI DSS 6.4.3 — Script envanteri ve bütünlüğü
Ödeme sayfasında yüklenen her script yetkilendirilmiş olmalı, bütünlüğü doğrulanmalı ve neden gerekli olduğu yazılı gerekçesiyle envanterde bulunmalı. Kritik nokta: bu, sadece ödemeyle ilgili script'leri değil, analytics, chat widget ve A/B test araçları dahil ödeme sayfasının yüklediği tüm script'leri kapsıyor.

**Frontend uygulaması:**
- Script envanteri repo'da versiyonlu bir dosyada tutulur (her script: amaç, sahip, onay).
- **Nonce tabanlı strict CSP** + dış kaynaklar için **SRI**. CSP ve SRI tarayıcıda ne yükleneceğini kısıtlamak ve doğrulamak için temel mekanizmalar, ancak tek başlarına yeterli değiller.
- **Ödeme/işlem sayfalarında üçüncü taraf script yok** — bu, uyumluluğu en kolay sağlayan mimari karar. Analitik gerekiyorsa self-host ve ayrı sayfa.
- SRI'nin sınırı bilinmeli: SRI statik script'lerde iyi çalışır ama sık güncellenen dinamik script'lerde her meşru değişiklik yeniden hash ve deploy gerektirdiği için yönetilemez hale gelir. Çözüm: dinamik dış script kullanmamak.

### PCI DSS 11.6.1 — Değişiklik tespiti
HTTP başlıklarına ve ödeme sayfası içeriğine yapılan yetkisiz değişiklikler için tespit ve alarm mekanizması gerekiyor. Neden periyodik tarama yetmiyor: saldırganlar zararlı script'i seçici olarak sadece gerçek kullanıcılara sunabiliyor, tarama araçlarına sunmuyor; kısa zaman pencerelerinde veya belirli coğrafyalara enjekte edebiliyorlar.

**Frontend uygulaması:** CSP `report-uri`/`report-to` ile ihlal raporlama + build çıktısı hash'lerinin release'te kaydı + güvenlik başlıklarının otomatik testi (Playwright ile her deploy sonrası doğrulama).

### KVKK / gizlilik (frontend tarafı)
- Analitik ve hata izlemede **PII redaction zorunlu** (Sentry `beforeSend` ile maskeleme).
- Session replay araçları cüzdan panellerinde **kullanılmaz**.
- Çerez/izin yönetimi yalnızca docs'ta; panellerde takip çerezi yok.
- Veri saklama: istemci tarafında hassas veri kalıcı saklanmaz (bkz. Bölüm 17).

> **Not:** Lisanslama ve kurumsal mevzuat yükümlülükleri (TCMB/6493 vb.) frontend kapsamı dışındadır; hukuk ve uyum ekibiyle yürütülür.

---

## 20. Test Stratejisi (detaylı)

| Katman | Araç | Kapsam / kural |
|---|---|---|
| Birim | **Vitest** | `packages/money` için **%100 kapsam zorunlu** — para mantığında test edilmemiş satır kabul edilmez |
| Bileşen | **Vitest + Testing Library** | `packages/ui` bileşenleri; Storybook story'leri test olarak koşar |
| API mock | **MSW** | Tüm testler gerçek backend'siz çalışır; sözleşme değişimi mock'ta yakalanır |
| Sözleşme | **openapi tip kontrolü** CI'da | OpenAPI spec değişince tipler yeniden üretilir; kırılma derlemede yakalanır |
| E2E (web) | **Playwright** | Kritik akışlar: login (passkey dahil), transfer + onay, idempotency retry, oturum zaman aşımı, çoklu sekme logout |
| E2E (mobil) | **Maestro** | Biyometrik kilit, deep link, offline davranışı |
| Güvenlik başlıkları | **Playwright** özel testi | CSP/HSTS/SRI her deploy sonrası doğrulanır (11.6.1 kanıtı) |
| Erişilebilirlik | **axe-core** (Playwright) | WCAG 2.2 AA kapısı |
| Görsel regresyon | Chromatic vb. | `packages/ui` değişiklikleri |
| Performans | **Lighthouse CI** + `size-limit` | Bütçe aşımında build kırılır |
| Para özel | Property-based test (fast-check) | Yuvarlama ve `allocate` için rastgele girdi testleri — kuruş kaybı olmadığı ispatlanır |

---

## 21. Ortamlar, Sürüm ve Dağıtım (frontend)

| Konu | Karar |
|---|---|
| Ortamlar | `local` → `dev` → `staging` → `prod`; her biri ayrı Keycloak realm ve ayrı API tabanı |
| Env yönetimi | **@t3-oss/env + Valibot**; eksik/yanlış env'de **build patlar**. `NEXT_PUBLIC_*` içine **asla sır konmaz** (bu değerler tarayıcıya iner) |
| Sır yönetimi | CI secret store; repo'da sır yok, **gitleaks** pre-commit + CI kapısı |
| Sürümleme | **Changesets** ile paket sürümleri + otomatik changelog |
| Web deploy | Immutable build artefaktı; **atomic deploy + anında rollback** |
| Mobil deploy | **EAS Build/Submit**; **EAS Update** ile OTA. Kritik: OTA sadece JS — native güvenlik yaması store'dan gider |
| Kademeli yayın | Feature flag ile yüzdelik açılış + **kill-switch** (riskli finansal özellik anında kapatılabilir) |
| CI güvenliği | Pinned action sürümleri (SHA ile), minimum izinli token, fork PR'larda secret erişimi yok |
| Build tekrarlanabilirliği | Frozen lockfile + sabit Node sürümü + Turborepo remote cache |

---

## 22. Tasarım Sistemi Derinliği

| Konu | Karar |
|---|---|
| Token kaynağı | `packages/ui` içinde tek token dosyası (renk, tipografi, aralık, radius, gölge) — Tailwind v4 CSS-first config ile |
| Tema | Açık/koyu + yüksek kontrast; `prefers-color-scheme` + kullanıcı tercihi |
| Mobil paylaşımı | **`packages/uim`** — RNR + NativeWind. Web ile paylaşılan: **tasarım dili ve API şekli**. Paylaşılmayan: bileşen kodu **ve token dosyası** (Bölüm 4). Değerler iki pakette elle hizalanır |
| Tipografi | Variable font, self-hosted; **tabular-nums** para gösteriminde zorunlu (rakamlar hizalansın, titremesin) |
| Para gösterimi | Tek `<Money>` bileşeni — formatlama, işaret, para birimi, hizalama tek yerde. Serbest metin içinde ham tutar yazılmaz |
| Durum renkleri | Sadece renkle anlam verilmez (renk körlüğü) — ikon + metin birlikte |
| Erişilebilirlik | Radix primitives, klavye tam gezinme, focus-visible, `aria-live` ile işlem durumu duyurusu |
| Yerelleştirme | TR/EN; sayı, tarih ve para formatı `Intl` ile; RTL'ye hazır yapı (logical CSS property'leri) |
| İkonografi | Phosphor — tek ağırlık seçilir (ör. `regular`, vurgu için `fill`), karışık ağırlık kullanılmaz |

---

## 23. Performans Bütçeleri (ölçülebilir hedefler)

| Metrik | Hedef | Nerede ölçülür |
|---|---|---|
| LCP | < 2.0 s (p75) | RUM + Lighthouse CI |
| INP | < 200 ms (p75) | RUM |
| CLS | < 0.1 | RUM + Lighthouse CI |
| İlk JS (web, giriş sayfası) | < 150 KB gzip | size-limit (CI kapısı) |
| İlk JS (admin) | < 250 KB gzip | size-limit |
| Mobil soğuk açılış | < 2 s | EAS/Sentry ölçümü |
| İşlem listesi scroll | 60 fps, 10k satırda | Sanallaştırma testi |

**Uygulama kuralları:** route bazlı code splitting; ağır bağımlılıklar (ECharts, PDF, QR tarayıcı) **lazy import**; Phosphor ve date-fns alt-yol import; RSC ile client bundle minimumda; görseller `next/image`/`expo-image`.

---

## 24. Tarayıcı Güvenliği Sertleştirmesi (frontier)

XSS bir cüzdanda oturum çalma = para kaybı demektir. 2026'da bu katmanda tarayıcının sunduğu en güçlü savunmalar artık cross-browser ve zorunlu tutulmalı.

### Trusted Types — DOM-based XSS'i tip seviyesinde bitirmek
CSP nonce/hash klasik XSS'i azaltır ama bir blind spot vardır: CSP hangi script'in yükleneceğini kontrol etmede iyidir, ama bir script çalışmaya başladıktan sonra o script'in veriyle ne yaptığına dair söz hakkı yoktur; Trusted Types bu boşluğu kapatır ve DOM manipülasyonunu sink seviyesinde güvenli hale getirir. Kritik olan: artık üretimde kullanılabilir. Trusted Types, Firefox'un da tamamlamasıyla 2026 başında cross-browser desteğe ulaştı. Şubat 2026'dan beri güncel cihaz ve tarayıcı sürümlerinde çalışıyor.

**Uygulama:**
- `Content-Security-Policy: require-trusted-types-for 'script'` + `trusted-types <policy>`. Bu, `innerHTML` gibi tehlikeli API'lerin ham string yerine yalnızca TrustedHTML/TrustedScript/TrustedScriptURL kabul etmesini zorunlu kılar.
- `innerHTML` yerine `textContent`; kaçınılmazsa **DOMPurify** + Trusted Types policy ile.
- React'te `dangerouslySetInnerHTML` yasağı; zorunlu HTML render'ı DOMPurify'dan geçer.

### CSP Level 3 — strict-dynamic
Host-allowlist yerine kriptografik güven: strict-dynamic algılandığında tarayıcı domain tabanlı source ifadelerini (ve `self`) yok sayar, güven yalnızca nonce/hash'e dayanır; nonce ile işaretlenmiş bir script'in dinamik olarak enjekte ettiği alt script'lere güvenilir. Bu, kırılgan CDN allowlist'lerini ortadan kaldırır. Uyarı: nonce exfiltration riski ele alınmalı — nonce her istekte üretilir, cache'lenmez, HTML'e sızacak yere konmaz.

### İzolasyon başlıkları
| Başlık | Amaç |
|---|---|
| **CSP `frame-ancestors`** | Sayfayı kimin çerçeveleyebileceğini belirler — clickjacking'in asıl savunması |
| **X-Frame-Options** | `frame-ancestors`'ın eski tarayıcılar için yedeği; ikisi birlikte gönderilir |
| **COOP** `same-origin` | Cross-origin pencere referanslarını keser (XS-Leaks koruması) |
| **COEP** `require-corp` | Cross-origin izolasyon; hassas verinin başka origin'e sızmasını zorlaştırır |
| **CORP** | Kaynakların hangi origin'lere yükleneceğini sınırlar |
| **HSTS** `preload` | Zorunlu HTTPS, downgrade saldırısı yok |
| **Referrer-Policy** `strict-origin-when-cross-origin` | Referer sızıntısı yok |
| **Permissions-Policy** | Kamera/mikrofon/geolocation gibi API'leri gerektiği yerle sınırlar |

### Çerçeveleme kontrolü (clickjacking)

Clickjacking'de saldırgan bizim sayfamızı kendi sahte sayfasına iframe ile gömer ve kullanıcıya farkında olmadan tıklatır. Bir ödeme yüzeyinde bunun karşılığı nettir: kullanıcı "Öde" butonuna bastığını bilmeden basar.

Bu projede tek bir politika yeterli değil, çünkü bir uygulamamız **kasıtlı olarak** çerçeveleniyor:

| Uygulama | Politika | Gerekçe |
|---|---|---|
| `web`, `merchant`, `admin`, `notify` | `frame-ancestors 'none'` | Hiçbir koşulda çerçevelenmez |
| `auth` (Keycloak temaları) | `frame-ancestors 'none'` | Login ekranının çerçevelenmesi kimlik avının klasik yolu |
| `checkout` | `frame-ancestors 'none'` | **Bilinçli karar:** ortak ödeme sayfası yönlendirmeyle açılır. Çerçeve içinde göstermek isteyen entegratör `elements` kullanır |
| `elements` | **Dinamik allowlist** | Zaten çerçevelenmek için var — aşağıya bakınız |
| `docs` | `frame-ancestors 'self'` | Örnek gömme senaryoları için |

#### `elements` — dinamik `frame-ancestors`

`elements` her üye işyerinin sayfasında çalışacağı için sabit politika yazılamaz. Ama `frame-ancestors *` demek "herkes gömebilir" demektir; o zaman saldırgan kendi sahte sayfasına **gerçek** kart alanlarımızı gömer ve kullanıcı doğru yerde olduğunu sanır.

**Karar:** `frame-ancestors` başlığı istek başına, o işyerinin **kayıtlı ve doğrulanmış** domainlerinden üretilir.

| Kural | Uygulama |
|---|---|
| Domain kaydı zorunlu | İşyeri panelden `pay.js`'i hangi domainlerde kullanacağını bildirir; bildirilmeyen domainde çalışmaz |
| Sahiplik doğrulanır | DNS kaydı veya `.well-known` dosyası ile. Doğrulanmamış domain canlı moda geçemez |
| Başlık istek başına üretilir | iframe yüklenirken çağıran origin ile eşleşen politika döner |
| Eşleşme yoksa iframe **yüklenmez** | Sessizce boş görünmez: işyeri geliştiricisinin konsolunda ve panelin geliştirici günlüğünde net hata çıkar |
| Test modunda `localhost` izinli | Canlı modda **asla** |
| Joker alt domain sınırlı | `*.magaza.com` kabul, `*.com` ret |

> **Sessiz başarısızlık yasak:** Yanlış yapılandırılmış CSP'nin en tehlikeli hâli, alanların hiç görünmemesi ve işyerinin bunu "yavaş yükleniyor" sanmasıdır. Hata görünür olmalı ki entegrasyon aşamasında yakalansın.

#### Ek kurallar

- **Frame-busting JS savunma değildir.** `window.top !== window.self` kontrolü atlatılabilir; başlık zorunlu, JS yalnızca ikinci katman.
- **3DS challenge iframe'i istisna değildir.** Orada bankanın sayfasını **biz** çerçeveliyoruz; bizim çerçevelenmemizle karıştırılmaz. `sandbox` niteliği mümkün olan en dar hâliyle verilir.
- **`rel="noopener noreferrer"`** dışa açılan tüm bağlantılarda — tabnabbing koruması.

### postMessage ve diğer sink'ler
- Her `postMessage` dinleyicisinde **`event.origin` doğrulanır** — cüzdan iframe/popup akışlarında (ör. 3DS) kritik.
- `eval`, `Function()`, string-`setTimeout` yasak (CSP ile de engellenir).
- Kullanıcı yüklemeleri **ayrı bir origin'den** servis edilir (asıl uygulama origin'inde değil).

> **İlke:** Bu katmanların hepsi savunma-derinliği — hiçbiri tek başına yeterli değil. Ama birlikte, cüzdanda XSS yüzeyini pratik olarak kapatır.

---

## 25. Web Performans Sınırı (frontier)

Performans hedefimiz sadece "hızlı yüklensin" değil, **her etkileşim anında akıcı** olsun. 2026'da bunun ölçüsü INP.

### INP — en çok başarısız olunan metrik
INP, FID'in yerini alan yanıt verebilirlik metriği; bir etkileşimin tüm yaşam döngüsünü ölçüyor ve 2026'da en sık başarısız olunan Core Web Vital — sitelerin %43'ü hâlâ 200ms eşiğini geçemiyor. Hedef: resmi eşik 200ms ama en iyi siteler 150ms altını hedefliyor.

**Ana teknik — main thread'e yield:** 2026'da kullanılacak API `scheduler.yield()`, `setTimeout(...,0)` değil; çünkü setTimeout devamı görev kuyruğunun sonuna atar, `scheduler.yield()` ise orijinal önceliği koruyarak bekleyen input işlendikten hemen sonra kodun devam etmesini sağlar. Etkisi büyük: bu desende olay işleyici senkron olarak neredeyse hiçbir şey yapmaz; pahalı işler (filtreleme, sıralama, hesaplama) yield edilir ve INP p75'te bu desenle tek başına %60-65 düşer.

**Kurallar:**
- Cüzdanda ağır işler (işlem listesi filtreleme/sıralama, çok para birimli hesap) `scheduler.yield()` (polyfill ile) veya Web Worker'a taşınır.
- Etkileşim anında önce görsel geri bildirim (seçili durum/loading), pahalı iş sonraya. React'te `useTransition`.
- Next.js 16'da: Server Components INP için en etkili araçlardan — ağır JS'i main thread'i bloklamayacağı sunucuya taşır.

### Speculation Rules API — anlık navigasyon
Deklaratif prefetch/prerender ile bir sonraki sayfa kullanıcı tıklamadan hazır. bfcache ile birlikte: navigasyonun varsayılan olarak hızlı olduğu, sonraki sayfanın zaten yüklendiği katmanlı bir yaklaşım. Cüzdanda "Panele git", "İşlem detayı" gibi öngörülebilir geçişlerde kullanılır (hover/viewport tetikli, muhafazakar — gereksiz prefetch bandwidth israfı).

### bfcache uyumu
Geri/ileri navigasyonda anlık geri yükleme. Kritik: `unload` handler kullanma (bfcache'i bozar), `Cache-Control: no-store` yalnızca gerçekten gerekli hassas sayfalarda. bfcache uyumu Playwright ile test edilir.

### Diğer
- **LCP < 2.0s:** kritik CSS inline, font preload + `display:swap`, hero görsel asla lazy değil.
- **CLS < 0.1:** tüm görsel/iframe/reklam alanlarına explicit boyut; dinamik içeriğe yer ayır.
- Kod bölme route bazlı; ağır bağımlılıklar lazy; RSC ile client JS minimumda.

---

## 26. Passkey / WebAuthn İstemci Implementasyonu

Auth'un sunucu tarafı Keycloak'ta (Bölüm 7); burada **istemci tarafı** entegrasyonu. Passkey artık bugünün teknolojisi: her büyük tarayıcı destekliyor, her büyük platform senkronize ediyor, WebAuthn spec'i stabil.

**Kütüphane:** WebAuthn'ı sıfırdan yazmak ince güvenlik hatalarının reçetesi — CBOR parsing, attestation doğrulama ve challenge yönetimi savaşta test edilmiş kütüphaneleri tek makul yol yapıyor; SimpleWebAuthn TypeScript için en yaygın benimsenen kütüphane. İstemcide `@simplewebauthn/browser`.

**Conditional UI (autofill) — tercih edilen akış:** `autocomplete="username webauthn"` token'ı tarayıcıya passkey'leri autofill dropdown'ında parola önerileriyle birlikte göstermesini söyler; `navigator.credentials.get()` çağrısında `mediation: "conditional"` bunu aktive eder. Kullanıcı username alanına odaklanınca passkey anında sunulur, ekstra tık yok.

**Zorunlu kurallar:**
- `isConditionalMediationAvailable()` ile özellik tespiti; yoksa modal akışa düş.
- Autofill mevcut olsa bile kullanıcıya her zaman modal deneyim seçeneği sunulur — güvenlik anahtarı veya non-discoverable credential kullananlar için.
- **rpId/origin tuzakları:** en sık hatalar burada. `rpId` mismatch, `NotAllowedError`, Safari'nin "operation is insecure" hatası ve conditional UI'ın görünmemesi — bu yüzden rpId production domain'iyle birebir eşleşmeli, tüm ortamlarda (dev/staging/prod) doğru yapılandırılmalı ve Safari özel durumları test edilmeli.
- **PRF extension (ileri seviye):** passkey'den türetilen anahtar ile istemci-tarafı şifreleme mümkün (hassas veri için); cüzdan yüksek güvenlik özellikleri isterse değerlendirilir.
- Passkey **birincil**, parola+MFA **fallback**; kademeli geçiş (day-one'da parolayı kaldırma).

---

## 27. Sanal POS — Frontend'e Ne Getiriyor

`pay`, üye işyerine kart kabulü sağlayan bir sanal POS hizmetidir. Cüzdandan en büyük farkı şudur: **kodumuzun bir kısmı bizim sitemizde değil, müşterimizin sitesinde çalışır.** Bu tek cümle frontend'in yarısını yeniden yazdırır.

### Üç ayrı kitle, üç ayrı yüzey

| Kitle | Ne yapıyor | Hangi yüzey | Tasarım önceliği |
|---|---|---|---|
| **Kart hamili** (işyerinin müşterisi) | Ödeme yapıyor, bizi tanımıyor | `checkout` + `elements` | Hız, güven, dönüşüm. Marka bizim değil |
| **İşyeri sahibi** | Parasını ve işlemlerini takip ediyor | `merchant` | Veri yoğunluğu, mutabakat netliği |
| **İşyeri geliştiricisi** | Entegrasyonu kuruyor | `docs` + `checkout-sdk` | Doğru örnek kod, hızlı ilk başarı |

Bu üçü **aynı ekipçe** yazılır ama tasarım dilleri ayrışır. Kart hamili yüzeyinde markamızı öne çıkarmak dönüşümü düşürür; işyeri panelinde markamızı gizlemek güveni düşürür.

### Cüzdanda olmayan yeni kavramlar

Bunların hepsi frontend'de karşılığı olan, tip sistemine girmesi gereken kavramlardır:

| Kavram | Frontend karşılığı |
|---|---|
| **BIN** | Kartın ilk 6–8 hanesi; hangi banka, hangi marka, kredi mi banka kartı mı — taksit tablosu buradan çıkar |
| **Taksit** | Türkiye e-ticaretinin belkemiği. Tutar tek sayı değil, bir **plan**: taksit sayısı, vade farkı, aylık tutar |
| **Provizyon / ön provizyon** | Tutarın bloke edilmesi ile çekilmesi ayrı işlemler; panelde ayrı durumlar |
| **İptal vs iade** | Aynı gün içinde iptal (void), sonrasında iade (refund). Kısmi iade mümkün — UI ikisini karıştırmamalı |
| **Hakediş / valör** | İşyerinin parayı ne zaman alacağı. Panelin en çok bakılan ekranı |
| **Mutabakat** | Bizim kayıtlarımız ile bankanın kayıtlarının eşleşmesi |
| **Komisyon** | İşlem başına kesinti; taksit sayısına göre değişir, iadede geri hesaplanır |
| **Chargeback / itiraz** | Kart hamilinin bankası üzerinden itirazı; işyerinin belge yüklediği bir akış |

> **Kural:** Bu kavramların hiçbiri serbest metin veya çıplak sayı olarak dolaşmaz. `packages/types` ve `packages/money` içinde tiplenir. Özellikle **taksit planı** bir sayı değil, bir nesnedir.

---

## 28. Ödeme Akış Modelleri (frontend sorumluluğu)

Türkiye'de sanal POS entegrasyonu üç modelde yapılır. Sanal POS **sağlayıcısı** olduğumuz için üçünü de sunmamız gerekir — ama üçü frontend'e ve PCI kapsamına çok farklı yük bindirir.

| Model | Kart bilgisi nerede giriliyor | Üye işyerinin PCI kapsamı | Bizim frontend yükümüz |
|---|---|---|---|
| **Model 1** — İşyeri kendi formu, 3DS'i kendi yönetir | İşyerinin sayfasında, kendi HTML'i | En ağır (SAQ A-EP veya D) | En az. Sadece API ve doküman |
| **Model 2** — İşyeri kendi formu, ödemeyi biz tamamlarız | İşyerinin sayfasında | Ağır (SAQ A-EP) | 3DS dönüş akışı ve sonuç sayfası |
| **Model 3** — Ortak Ödeme Sayfası | **Bizim sayfamızda** | En hafif (SAQ A) | **En ağır** — sayfanın tamamı bizim |
| **Model 3+** — Gömülü alanlar (`elements`) | Bizim iframe'imizde, işyerinin sayfası içinde | En hafif (SAQ A) | En ağır + iframe/postMessage karmaşıklığı |

**Kararımız — hangisini öne çıkarıyoruz:** Varsayılan ve dokümantasyonda önerilen yol **Model 3+ (gömülü alanlar)**, ikinci seçenek **Model 3 (ortak ödeme sayfası)**. Model 1 ve 2 destekleniyor ama dokümanda "yalnızca kendi PCI denetiminizi yürütüyorsanız" uyarısıyla veriliyor.

Gerekçe: gömülü alanlar üye işyerini SAQ A'da tutar (satış argümanı), dönüşümü ortak ödeme sayfasından yüksektir (kullanıcı siteden ayrılmaz), ve kapsamı bizde toplayarak güvenlik disiplinini **tek yerde** uygulanabilir kılar.

### 3D güvenlik modelleri

Ödeme akışından bağımsız olarak dört güvenlik modeli var. Frontend'i ilgilendiren kısmı: kullanıcının **kaç kez yönlendirildiği** ve **hangi ekranı kimin çizdiği**.

| Model | Akış | Frontend etkisi |
|---|---|---|
| **Non-Secure** | Doğrulama yok | Yönlendirme yok. Türkiye'de risk nedeniyle varsayılan değil |
| **3D Secure** | Doğrulama → sonuç bize döner → ayrı provizyon isteği | İki aşamalı; "doğrulanıyor" ara durumu şart |
| **3D Pay** | Doğrulama ve provizyon tek adımda | Tek dönüş. En yaygın tercih |
| **3D Host** | Kart bilgisi de banka sayfasında | Sayfa tamamen bankanın; sadece dönüş sayfası bizim |

> **Frontend kuralı — dönüş sayfası:** Her 3D modelde kullanıcı bankadan bize **geri döner**. Bu dönüş `POST` ile gelir, sayfa yenilenir, önceki JS state'i yok olur. Ödeme durumu **asla client state'inde tutulmaz** — dönüşte sunucudan sorgulanır. Bu, Bölüm 16'daki "belirsiz durum UX'i" kuralının sanal POS'taki en sık ihlal edilen hâlidir.

---

## 29. Checkout Yüzeyleri

### 29.1 Ortak Ödeme Sayfası (`checkout`)

Kendi origin'inde (`checkout.<domain>`) çalışan tam sayfa. En katı kurallara tabi yüzey:

- **Üçüncü taraf script sıfır.** Analitik, chat, A/B, hata izleme dahil. Ölçüm kendi kodumuzla, kendi origin'imizden.
- **Bağımlılık eklemek onay gerektirir.** Bu sayfanın `package.json`'ı ayrı bir CODEOWNERS kuralıyla korunur.
- **JS'siz temel akış çalışır.** Progressive enhancement: form `<form method="post">` olarak da gönderilebilir. Kart hamili bir kez bile "sayfa yüklenmedi" yaşarsa işyeri kaybediliyor.
- **Sıkı CSP + Trusted Types** (Bölüm 24) burada pazarlık konusu değil, diğer yüzeylerden daha erken uygulanır.
- Oturum yok, çerez yok, `localStorage` yok — sayfa tek işlemliktir ve arkasında iz bırakmaz.

### 29.2 Gömülü Alanlar (`elements`)

İşyerinin sayfasına `pay.js` ile gömülen, her biri ayrı iframe içinde çalışan kart alanları.

| Konu | Karar |
|---|---|
| İzolasyon | Her hassas alan (kart no, SKT, CVC) **ayrı iframe**, ayrı origin. Ana sayfa hiçbirinin içeriğini okuyamaz |
| Koordinasyon | Görünmez bir **kontrolör iframe** alanları toplar ve tokenizasyonu yürütür; işyerinin JS'i hiçbir aşamada PAN görmez |
| İletişim | Yalnızca `postMessage`. Her mesajda `event.origin` kontrolü; şema doğrulaması Valibot ile |
| Stil | İşyeri **token verir**, CSS vermez. Serbest CSS enjeksiyonu overlay/tuzak alan riskidir — kabul edilmiyor (Bölüm 36) |
| Erişilebilirlik | iframe içindeki alanların label'ı dışarıda kalıyor — `aria-labelledby` köprüsü ve odak yönetimi elle kurulur. Bu, iframe mimarisinin en sık atlanan bedeli |
| Otomatik doldurma | Tarayıcı autofill'i iframe sınırında bozulur; `autocomplete="cc-number"`, `cc-exp`, `cc-csc` token'ları ve `inputmode="numeric"` alan bazında doğru verilir |

### 29.3 Ödeme Linki ve QR

Kod yazamayan işyeri için: panelden tutar girilir, link veya karekod üretilir. Link `checkout`'un tek kullanımlık bir örneğini açar.

- **TR Karekod** standardına uyum (TCMB/BKM): karekod içeriği serbest değil, tanımlı bir şemadır. Üretim `packages/card` içinde tek noktada yapılır.
- Link'in kendisi **hassas veri taşımaz** — sadece opak bir referans. Tutar ve alıcı sunucudan çözülür (Bölüm 19 gizlilik kuralı).

---

## 30. `pay.js` — Gömülebilir SDK Dağıtımı

Bu, dokümandaki diğer her şeyden farklı bir yazılım: **sürümünü biz kontrol ediyoruz ama çalıştığı sayfayı kontrol etmiyoruz.**

### İhlal edilemez kurallar

1. **`pay.js` daima bizim CDN'imizden yüklenir** (`https://js.<domain>/v1/pay.js`). Üye işyeri onu bundle'layamaz, kopyalayamaz, kendi sunucusundan servis edemez. Bu bir tercih değil PCI gereğidir: kart alanlarını çalıştıran kodun her an güncellenebilir olması gerekir.
2. **npm paketi sadece bir yükleyicidir.** `packages/checkout-sdk` npm'e yayınlanır ama içinde SDK'nın kendisi yoktur — script etiketini enjekte eden ince bir sarmalayıcı ve TypeScript tipleridir. Modern bundler'larla çalışsın ama kod yine CDN'den gelsin diye.
3. **Ana sürüm URL'de sabittir** (`/v1/`). Kırıcı değişiklik `/v2/` açar; `/v1/` yaşamaya devam eder. Yama ve küçük sürümler sessizce ve geriye dönük uyumlu şekilde yayılır.
4. **Geriye dönük uyum penceresi yazılı taahhüttür.** Bir ana sürüm en az 24 ay yaşar. Sanal POS müşterisi entegrasyonuna yılda bir kez bakar.
5. **CSP sözleşmesi dokümante edilir.** İşyerine vereceğimiz tam direktif satırı (`script-src`, `frame-src`, `connect-src`) doküman sayfasında kopyalanabilir hâlde durur. Direktif değişirse bu bir **kırıcı değişikliktir**.

### Bunun getirdiği yükümlülükler

| Konu | Karar |
|---|---|
| Boyut bütçesi | `pay.js` yükleyici < 15 KB gzip; iframe uygulaması < 60 KB gzip. `size-limit` CI kapısı, aşımda build kırılır |
| Tarayıcı desteği | Panelden geniş: eski Safari ve Android WebView dahil. Destek matrisi yazılı, test edilen sürümler CI'da |
| Sürüm yayını | Kademeli (yüzdelik) yayın + anında geri alma. Checkout'ta bozuk sürüm = tüm ağın ödeme alamaması |
| İzleme | Sürüm bazlı hata oranı ve tokenizasyon başarı oranı; eşik aşımında otomatik geri alma |
| Alt kaynak bütünlüğü | Kendi script'imiz sık güncellendiği için SRI **kullanılamaz** — bu bilinçli bir istisnadır, yerine sıkı CSP + provenance ile telafi edilir (Bölüm 19'daki SRI sınırı notuyla aynı gerekçe) |
| Test | Gerçek üye işyeri sayfası simülasyonu: farklı CSP'ler, farklı çerçeve derinlikleri, Shopify/WooCommerce benzeri ortamlar. Playwright ile matris testi |

> **Kritik uyarı:** Kendi SDK'mızın tedarik zinciri artık **başkasının sayfasının** tedarik zinciri. Bölüm 15'teki kurallar burada iki kat sıkı uygulanır: `elements` ve `checkout-sdk` bağımlılık listesi minimumda tutulur, her ekleme ayrı onay ister.

---

## 31. Kart Formu ve Taksit (Türkiye'ye özel)

### Kart alanı davranışı

| Konu | Karar |
|---|---|
| Doğrulama | **Luhn** algoritması istemcide (anında geri bildirim) — ama güvenlik sınırı değil, sadece UX |
| Marka tespiti | BIN'den anlık: Visa/Mastercard/Troy/Amex. İkon alanı **sabit genişlikte** ayrılır, tespit anında layout kaymaz (CLS) |
| Maskeleme | Görüntülemede daima maskeli; log, hata mesajı, analitik ve ekran görüntüsüne **hiçbir koşulda** tam PAN düşmez |
| Giriş kolaylığı | `inputmode="numeric"`, alan bazında `autocomplete` token'ları, otomatik boşluklama, alanlar arası otomatik geçiş |
| Hata | Alan altında, düz Türkçe, anında. "Geçersiz kart" değil: "Kart numarası eksik görünüyor — 16 hane bekleniyor" |
| Alan sayısı | Kart no, SKT, CVC, ad. Fazlası dönüşüm kaybı |

### Taksit — dokümandaki en Türkiye'ye özel karar

Taksit, Türkiye e-ticaretinin belkemiğidir ve **frontend'de yanlış hesaplanması doğrudan para farkı** demektir.

**Akış:** Kullanıcı BIN'i yazar (ilk 6–8 hane) → BIN sorgusu → o bankaya ait taksit seçenekleri ve komisyon oranları → taksit tablosu çizilir → kullanıcı seçer → **toplam tutar değişir**.

| Kural | Gerekçe |
|---|---|
| **Taksit tablosu sunucudan gelir, istemcide hesaplanmaz** | Komisyon ve vade farkı oranları işyeri bazında sözleşmeye bağlıdır. İstemcide hesap = mutabakat farkı (CLAUDE.md demir kuralı: tutar istemciden gelmez) |
| **BIN sorgusu ilk 6 haneden tetiklenir, debounce'lu** | Her tuşta istek atmak hem gereksiz hem BIN'i log'lara yayar |
| **Seçilen taksitte toplam maliyet açıkça gösterilir** | Aylık tutar **ve** toplam tutar birlikte. Sadece aylık göstermek yanıltıcıdır |
| **Vade farkı ayrı satır** | "9 taksit × 1.250 TL = 11.250 TL (vade farkı 1.250 TL)" — gizlenmez |
| **Peşin fiyatına taksit ayrı işaretlenir** | Vade farksız kampanya farklı bir durumdur, aynı görünmemeli |
| **Taksit değişince tutar animasyonsuz güncellenir** | Para rakamı üzerinde animasyon = güven kaybı. `tabular-nums` zorunlu |
| **Tüm taksit aritmetiği `packages/money`** | Checkout, panel ve mutabakat ekranı aynı fonksiyonu çağırır. Üç ayrı yerde yuvarlama = üç ayrı sonuç |

> **Yuvarlama:** Taksit bölünmesinde kuruş artığı kaçınılmazdır (10.000 / 3). Dinero.js `allocate` ile dağıtılır, artık **ilk taksite** eklenir ve bu kural yazılıdır. Bölüm 20'deki property-based test burada da zorunludur: rastgele tutar ve taksit sayısı için `Σ taksitler == toplam` ispatlanır.

---

## 32. 3D Secure 2.x İstemci Akışı

3DS 2.x'te frontend pasif değil — doğrulamanın başarı oranı doğrudan frontend'in topladığı veriye bağlı.

### İki fazlı akış

**Faz 1 — Cihaz parmak izi (3DS Method).** Banka tarafı bir iframe içeriği döner; bunu **gizli bir iframe'e** hemen gömmemiz gerekir. Tarayıcı ve cihaz verisi (user-agent, ekran çözünürlüğü, saat dilimi, dil, renk derinliği, JS açık mı) toplanır.

> **Neden önemli:** Bu adım atlanırsa veya iframe'e yer bırakılmazsa işlem **frictionless** akıştan düşer ve kullanıcı gereksiz yere şifre ekranına gider. Dönüşüm kaybı doğrudan buradan gelir. Mobil öncelikli tasarımda bile bu gizli iframe için yer bırakılır.

**Faz 2 — Doğrulama.** İki sonuçtan biri:

| Sonuç | Frontend davranışı |
|---|---|
| **Frictionless** | Kullanıcı hiçbir ekran görmez. "Doğrulanıyor" durumu 1–2 sn görünür, sonra sonuç |
| **Challenge** | Bankanın ekranı iframe'de açılır. Boyut banka tarafından belirlenir (5 standart boyut) — konteyner **esnek** olmalı, sabit yükseklik vermek ekranı kırpar |

### Kurallar

- **Challenge iframe'i modal içinde,** arka plan kilitli, kaçış yolu (iptal) görünür. Kullanıcı bankanın ekranında kaybolmamalı.
- **Zaman aşımı yönetimi:** Banka ekranında kullanıcı SMS bekler; tipik süre 2–3 dakika. Kendi timeout'umuz bundan uzun olmalı, yoksa başarılı doğrulamayı "başarısız" sayarız.
- **Dönüş belirsizse "başarısız" denmez.** Bölüm 16'daki kural: "durum doğrulanıyor" gösterilir ve sunucudan sorgulanır. 3DS'te bu senaryo yaygındır (kullanıcı sekmeyi kapatır, ağ kopar).
- **`postMessage` ile gelen dönüşte `event.origin` doğrulanır** — 3DS akışı bu kontrolün en kritik olduğu yerdir (Bölüm 24).
- **Popup değil iframe.** Popup engelleyiciler mobilde akışı bitirir.

### Secure Payment Confirmation (SPC) — ileriye dönük

WebAuthn'ın ödemeye özel uzantısı; kart hamili biyometriyle doğrular, banka ekranı görünmez. W3C'de aday öneri aşamasında ve tarayıcı desteği hâlâ dar.

**Karar:** Şimdilik **uygulanmıyor, ama mimari engellenmiyor.** Özellik tespiti (`isSecurePaymentConfirmationAvailable`) ile kademeli açılacak şekilde 3DS katmanı soyutlanır. Passkey altyapısı (Bölüm 26) zaten kurulu olduğu için geçiş maliyeti düşük olur.

---

## 33. Üye İşyeri Paneli

Cüzdan paneli "az işlem, yüksek dikkat" içindir; işyeri paneli "çok işlem, hızlı tarama" içindir. Bilgi tasarımı öncelik kazanır (Bölüm 22 yerine bu bölüm geçerlidir).

### Test / Canlı mod ayrımı — en kritik UI kararı

| Kural | Gerekçe |
|---|---|
| Mod, panelin **her ekranında** görünür ve ayırt edilebilir | Test modunda canlı sandığı işlem yapan işyeri en sık destek talebidir |
| Test modu **sadece renk/rozet ile değil**, kalıcı bir kenar şeridi veya başlık bandıyla işaretlenir | Renk körlüğü + alışkanlık körlüğü. Bölüm 22 kuralı: renkle tek başına anlam verilmez |
| Mod değişimi **tüm veriyi tazeler** | TanStack Query cache'i mod bazında anahtarlanır; test verisinin canlı ekranda görünmesi kabul edilemez |
| API anahtarları mod bazında ayrıdır ve UI bunu gösterir | `sk_test_` / `sk_live_` ayrımı görsel olarak da yansır |
| Canlıya geçiş bir **kontrol listesi** ekranıdır | Webhook adresi, imza sırrı, iade politikası — eksikse uyarı |

### Ekranlar ve kararlar

| Ekran | Karar |
|---|---|
| **İşlem listesi** | TanStack Table + Virtual. Kaydedilebilir görünümler (filtre setleri URL'de, `nuqs` ile paylaşılabilir). Sonsuz kaydırma değil **sayfalama** — mutabakatta "kaçıncı sayfadaydım" önemlidir |
| **İşlem detayı** | Tam zaman çizelgesi: yetkilendirme, 3DS sonucu, provizyon, iade. Her adımın zaman damgası ve ham yanıt kodu görünür. Destek ekibinin ilk baktığı yer |
| **İade / iptal** | İkisi ayrı eylem, ayrı dil. Kısmi iade tutar alanı; **iade edilen komisyonun geri gelip gelmediği açıkça yazılır** |
| **Hakediş** | "Ne zaman ne kadar alacağım" sorusunun tek ekranda cevabı. Bekleyen / yolda / ödendi ayrımı, valör tarihi |
| **Mutabakat** | Günlük dosya indirme + fark raporu. Fark varsa üstte, sayı olarak |
| **Komisyon ve taksit ayarları** | Taksit sayısı başına oran tablosu. Değişiklik **önizlemeli**: "bu ayar 100 TL'lik 6 taksitli işlemde şunu değiştirir" |
| **API anahtarları** | Gizli anahtar **bir kez** gösterilir, sonra maskeli. Kopyala butonu, oluşturma tarihi, son kullanım zamanı, döndürme akışı |
| **Webhook yönetimi** | Uç nokta listesi, imza sırrı, **olay günlüğü ve yeniden gönderme**. Başarısız teslimatlar ayrı sekmede |
| **Geliştirici günlüğü** | Son API istekleri: istek/yanıt gövdesi (maskeli), hata kodu, ilgili doküman bağlantısı. Entegrasyon sırasındaki destek yükünü en çok azaltan ekran |
| **İtiraz (chargeback)** | Son tarihi olan bir görev akışı. Geri sayım görünür, belge yükleme, gönderilen delilin kaydı |
| **Ekip ve yetki** | Rol bazlı; muhasebeci iade yapamaz, geliştirici hakediş göremez gibi ayrımlar. UI gizleme güvenlik değildir (Bölüm 18) |

### Gerçek zamanlı

| İhtiyaç | Karar |
|---|---|
| İşlem akışı, ödeme durumu | **SSE (Server-Sent Events)** — tek yönlü sunucu→istemci akışı için WebSocket'ten basit, HTTP altyapısıyla uyumlu, otomatik yeniden bağlanma yerleşik |
| Cüzdan tarafı bakiye | Mevcut karar (WebSocket) korunur — orada çift yönlü ihtiyaç var |
| Ortak | TanStack Query invalidation ile birleşir; akış tek başına doğruluk kaynağı değildir |

---

## 34. Geliştirici Deneyimi (`apps/docs` + `packages/checkout-sdk`)

Sanal POS'ta entegrasyonu yapan geliştirici çoğu zaman **satın alma kararını veren kişidir.** Dokümantasyon pazarlama malzemesi değil, üründür.

| Konu | Karar |
|---|---|
| Doküman altyapısı | **Fumadocs** + `fumadocs-openapi`. Next.js-native, `packages/ui` ile aynı tasarım dili, git/MDX tabanlı |
| API referansı | OpenAPI spec'inden **üretilir**, elle yazılmaz. Spec değişince doküman kırılır — CI kapısı |
| Çalıştırılabilir örnek | Her uç nokta için kopyalanabilir istek; test anahtarıyla **gerçekten çalışan** örnekler |
| Dil kapsamı | Türkiye pazarı gerçeği: **PHP, Python, Node.js, C#, Java**. PHP birinci sınıf vatandaştır — atlanırsa pazarın önemli kısmı kaybedilir |
| SDK üretimi | Sunucu tarafı istemci kütüphaneleri OpenAPI'den üretilir. Elle yazılan SDK sürüm kayması demektir |
| Test kartları | Belgeli ve tıklanabilir: başarılı, yetersiz bakiye, 3DS challenge tetikleyen, hatalı CVC. Her senaryo için tek tık kopyalama |
| Entegrasyon kontrol listesi | "Canlıya çıkmadan önce" sayfası: CSP direktifi, webhook imzası, iade akışı testi, hata durumları |
| Sürüm günlüğü | Kırıcı değişiklikler ayrı ve öne çıkarılmış; geçiş rehberi zorunlu |
| Arama | Tarayıcıda çalışan statik full-text arama |
| Durum sayfası | Ayrı, bağımsız barındırılan uptime sayfası. Kendi altyapımızda barındırılmaz — kesinti anında o da düşer |

> **Ölçüt:** Yeni bir geliştirici, dokümana ilk girdiği andan test modunda başarılı ilk ödemeyi almasına kadar **15 dakikanın altında** kalmalı. Bu bir hedef değil kabul kriteridir; her sürümde ölçülür.

---

## 35. PCI DSS — Artık Hizmet Sağlayıcıyız

Bölüm 19, cüzdan varsayımıyla yazılmıştı: kart alanlarını başkasının iframe'ine bırakıp **SAQ A**'da kalmak. Sanal POS sağlayıcısı olmak bu varsayımı geçersiz kılar.

### Ne değişti

| | Önceki varsayım (cüzdan) | Yeni gerçek (sanal POS) |
|---|---|---|
| Rolümüz | Üye işyeri | **Hizmet sağlayıcı** |
| Kart verisi | Görmüyoruz | Görüyoruz — `elements` ve `checkout` içinde |
| Kapsam | SAQ A (~30 madde) | **SAQ D / Level 1 hizmet sağlayıcı** (~329 madde) |
| 6.4.3 ve 11.6.1 | Bizim ödeme sayfamız için | **Hem bizim sayfalarımız hem işyerlerine verdiğimiz kod için** |
| Denetim | Öz değerlendirme | Yıllık dış denetim (QSA), üç aylık tarama |

> **Not:** Yukarıdaki madde sayıları ve seviye ataması **hukuk ve uyum onayı gerektirir** — işlem hacmi ve kart kuruluşlarının sınıflandırmasına göre değişir. Frontend tarafında ise kapsamın genişlediği tartışmasızdır ve mimari buna göre kurulur.

### Frontend'e düşen somut yükümlülükler

| Yükümlülük | Uygulama |
|---|---|
| **Script envanteri (6.4.3)** | `checkout` ve `elements` için repo'da versiyonlu envanter dosyası: her script'in amacı, sahibi, onay kaydı. CI kapısı — envanterde olmayan script build'i kırar |
| **Değişiklik tespiti (11.6.1)** | Build çıktısı hash'leri her sürümde kaydedilir; canlı sayfanın başlık ve script bütünlüğü **sürekli** izlenir. Periyodik tarama yetersiz — saldırgan zararlı kodu seçici olarak yalnızca gerçek kullanıcılara sunabilir |
| **Kapsam ayrımı** | Kart verisine dokunan kod ayrı app'lerde ve ayrı origin'de toplanır. `apps/web`, `apps/mobile`, `apps/merchant` kapsam **dışında** kalır — bu ayrımı korumak mimari bir zorunluluktur |
| **Bağımlılık kontrolü** | `checkout` ve `elements` bağımlılıkları ayrı ve daha katı bir allowlist'e tabi. Bölüm 15'teki karantina penceresi burada iki katı |
| **Log ve hata yönetimi** | PAN/CVC hiçbir koşulda Sentry'ye, konsola, network log'una düşmez. `beforeSend` maskelemesi yetmez — bu alanların değeri hiçbir zaman iframe dışına çıkmaz |
| **Erişim ayrımı** | Kapsam içindeki repo dizinleri CODEOWNERS ile korunur; değişiklik ayrı onay ister |

### Erişilebilirlik — artık hukuki yükümlülük

AB'de Avrupa Erişilebilirlik Yasası (EAA) 28 Haziran 2025'ten beri yürürlükte ve tüketiciye yönelik bankacılık/ödeme hizmetlerini açıkça kapsıyor; ölçüt EN 301 549 üzerinden **WCAG 2.1 AA**. 2026 itibarıyla üye devletler ceza uygulamaya başladı.

Türkiye pazarı için doğrudan bağlayıcı olmasa da: AB'ye açılma ihtimali, kurumsal müşterilerin tedarikçi denetimi ve zaten Bölüm 22'de verilmiş a11y taahhüdü nedeniyle **WCAG 2.2 AA hedefi korunur ve checkout yüzeylerinde CI kapısı olur.** Gerekçe artık sadece kalite değil, pazar erişimi.

---

## 36. Çok Markalı Tasarım Sistemi

`packages/ui` artık iki ürüne **ve** üçüncü taraf işyeri temalarına hizmet ediyor. Tek token seti bunu kaldırmaz.

### Üç katmanlı token mimarisi

| Katman | İçerik | Kim değiştirebilir |
|---|---|---|
| **1. İlkel (primitive)** | Ham değerler: renk rampaları, aralık ölçeği, tipografi ölçeği | Sadece tasarım sistemi ekibi |
| **2. Anlamsal (semantic)** | Role bağlı: `surface`, `text-primary`, `danger`, `success`. Bileşenler **sadece bunu** kullanır | Sadece tasarım sistemi ekibi |
| **3. Marka (brand)** | Anlamsal katmanı hangi ilkele bağladığı: `wallet`, `pay`, `merchant-<id>` | Marka teması; işyeri sınırlı alt kümesini |

Bileşen kodu hiçbir zaman ilkel token'a doğrudan referans vermez. Marka değişimi tek bir eşleme dosyasıyla olur, bileşene dokunulmaz.

Bu üç katmanlı yapı **her iki pakette de ayrı ayrı kurulur** — `packages/ui` içinde Tailwind v4'ün `@theme` bloğuyla, `packages/uim` içinde NativeWind yapılandırmasıyla. Katman isimleri ve anlamsal token adları **birebir aynı** tutulur; farklılık yalnızca dosya biçimindedir. Marka katmanının değerleri değiştiğinde iki paket aynı PR'da güncellenir.

### İşyeri teması — sınırlı ve güvenli

Üye işyeri checkout'u kendi markasına yaklaştırabilir, ama **serbest CSS verilemez** — bu bir güvenlik sınırıdır, estetik tercih değil. Serbest CSS ile görünmez overlay, sahte alan veya yanıltıcı buton yapılabilir.

| İşyeri neyi değiştirebilir | Neyi değiştiremez |
|---|---|
| Marka rengi (kontrast doğrulamasından geçmek şartıyla) | Alanların düzeni ve sırası |
| Köşe yarıçapı, yazı tipi (izinli liste) | Güvenlik göstergeleri, kilit ikonu, sağlayıcı ibaresi |
| Logo, buton metni | Hata mesajlarının konumu ve görünürlüğü |
| Açık/koyu tema tercihi | `z-index`, konumlandırma, opaklık |

**Kontrast otomatik doğrulanır:** işyerinin verdiği renk WCAG AA eşiğini geçmiyorsa reddedilir ve panelde neden reddedildiği gösterilir. Erişilemez bir checkout'un sorumluluğu bizde kalır.

### Ürünler arası ayrım

`wallet` ve `pay` **aynı sistemi kullanır ama aynı görünmez.** Cüzdan sıcak ve sade; işyeri paneli yoğun ve araç gibi. Ayrım anlamsal token'ların farklı bağlanmasıyla ve yoğunluk (density) ölçeğiyle yapılır — iki ayrı bileşen seti yazılmaz.

---

## 37. Checkout Performansı, Dönüşüm ve Ajan Ticareti

### Checkout'a özel performans bütçeleri

Bölüm 23'teki bütçeler panel içindir. Checkout yüzeyi başkasının sayfasında ve başkasının müşterisiyle çalıştığı için daha sıkıdır:

| Metrik | Hedef | Neden |
|---|---|---|
| `pay.js` yükleyici | < 15 KB gzip | İşyerinin sayfa bütçesinden yiyoruz |
| `elements` iframe uygulaması | < 60 KB gzip | Alanların görünme süresi doğrudan dönüşüm |
| Alanların etkileşime hazır olma süresi | < 800 ms (p75) | Kullanıcı boş kutuya yazmaya başlarsa girdi kaybolur |
| `checkout` LCP | < 1.5 s (p75) | Panelden (2.0 s) daha sıkı |
| `checkout` INP | < 150 ms (p75) | Taksit seçimi anında hissedilmeli |
| BIN sorgusu → taksit tablosu | < 400 ms (p75) | Bu gecikme doğrudan terk sebebidir |

**Ölçüm:** Checkout'ta üçüncü taraf RUM aracı kullanılamaz (Bölüm 35). Ölçüm kendi kodumuzla, kendi origin'imize, PII'siz.

### Dönüşüm hunisi

Checkout bir huni olarak izlenir: alanlar göründü → ilk tuş → BIN çözüldü → taksit seçildi → gönderildi → 3DS başladı → 3DS bitti → sonuç. **Her adımın terk oranı** işyeri panelinde görünür — bu hem bizim için ürün metriği hem işyeri için satış argümanı.

> **Gizlilik sınırı:** Huni verisi toplu (aggregate) tutulur, kart hamili bazında iz sürülmez. Bölüm 19'daki oturum kaydı yasağı checkout'ta mutlaktır.

### Ajan ticareti (agentic commerce) — ileriye dönük

2026'da yapay zekâ ajanlarının kullanıcı adına satın alma yapması pratik bir gerçek hâline geldi; OpenAI ve Stripe'ın birlikte yürüttüğü **ACP (Agentic Commerce Protocol)** bu alanda en yaygın açık standart, yanında Google'ın UCP/AP2'si ve Anthropic'in MCP'si var. Protokoller açık olduğu için Stripe müşterisi olmayan sağlayıcılar da uyarlayabiliyor.

**Karar:** Bu tur için **uygulanmıyor**, ama iki mimari kısıt şimdiden konur:

1. **Ödeme başlatma akışı UI'dan bağımsız olur.** Checkout'un yaptığı her şey (taksit sorgusu, tokenizasyon, 3DS) başsız (headless) çağrılabilir olmalı; ekran bunun üzerine ince bir katman kalmalı. Ajan entegrasyonu geldiğinde yeniden yazım gerekmesin.
2. **İşlem bütünlüğü kuralları ajan trafiğinde de aynen geçerlidir** (Bölüm 16): idempotency anahtarı, optimistic UI yasağı, belirsiz durumda "başarısız" dememe. Ajan tarafında bunlar daha da kritiktir çünkü kullanıcı ekranı görmüyor.

> **Not:** Bu alan hızlı değişiyor. Karar, standart Türkiye pazarında pratik karşılık bulduğunda yeniden değerlendirilir — şimdiden protokol seçmek erken bağlanma olur.

---

## 38. İstek Doğrulama ve CSRF

Bölüm 7'de token'ları `httpOnly` cookie'ye koyarak XSS'e karşı sağlam bir savunma kurduk. O savunmanın kendi yan etkisi var ve doküman bugüne kadar bunu konuşmadı:

> `httpOnly` cookie XSS'e karşı korur, **CSRF'e karşı korumaz.** Aksine, cookie tabanlı oturum CSRF'in ön koşuludur — tarayıcı cookie'yi isteğe kendiliğinden ekler. Saldırganın token'ı okumasına gerek yoktur; kullanıcının tarayıcısına isteği **yaptırması** yeterlidir.

`web`'de transfer var, `merchant`'ta iade var. İkisi de tek bir sahte formla tetiklenebilir olmamalı.

### Üç katmanlı savunma

Hiçbiri tek başına yeterli sayılmaz; üçü birlikte uygulanır.

| Katman | Karar | Ne yakalar |
|---|---|---|
| **1. `SameSite`** | Oturum cookie'si `SameSite=Strict` + `Secure` + `httpOnly` | Cross-site isteklerin çoğunu tarayıcı seviyesinde keser |
| **2. Özel başlık** | Durum değiştiren her istekte CSRF token'ı özel bir başlıkta. Özel başlık **CORS ön kontrolünü zorunlu kılar** — basit form gönderimiyle taklit edilemez | Cross-origin fetch/XHR denemeleri |
| **3. Sunucu doğrulaması** | BFF katmanında `Origin` ve `Referer` allowlist'e karşı doğrulanır | Başlıkların atlatıldığı kenar durumlar |

### Kurallar

| Kural | Gerekçe |
|---|---|
| **Durum değiştiren hiçbir işlem `GET` değildir** | `GET` link, resim veya prefetch ile tetiklenebilir — CSRF'in en ucuz vektörü |
| **CSRF token oturuma bağlıdır ve girişte yenilenir** | Giriş öncesi alınan token giriş sonrası geçerli olmamalı (login CSRF) |
| **Token, oturum cookie'sinden ayrı taşınır** | `httpOnly` olmayan ayrı bir cookie veya sayfa yanıtına gömülü değer. Oturum cookie'siyle aynı yerde tutulmaz |
| **Speculation Rules prefetch'i mutasyon uçlarına dokunmaz** | Bölüm 25'teki muhafazakâr prefetch yapılandırması burada güvenlik gerekçesi de kazanır |
| **`SameSite=Strict`'in bedeli bilinir** | Dış siteden dönen `POST` isteğinde cookie gönderilmez — aşağıya bakınız |

### Yönlendirme dönüşleri — `SameSite=Strict` tuzağı

3DS akışında kullanıcı bankadan bize `POST` ile döner. `SameSite=Strict` cookie bu istekte **gönderilmez** ve kullanıcı çıkış yapmış görünür. Bu, `Strict` tercih eden ekiplerin en sık düştüğü tuzaktır ve genellikle cookie'yi `Lax`'a düşürerek "çözülür" — biz bunu kabul etmiyoruz.

**Karar:**

- `checkout` bu sorunu **yaşamaz**: orada oturum ve çerez zaten yok (Bölüm 29.1). Dönüş, sunucudaki işlem kimliğine bağlanır — tarayıcı durumuna değil. Bu, Bölüm 29.1'deki "çerezsiz sayfa" kararının ikinci ve daha önemli gerekçesidir.
- `web`'de dış dönüş gerektiğinde (cüzdana kart ekleme gibi) dönüş **ara bir `GET` sayfasına** yapılır, oradan uygulamaya geçilir. Cookie'yi `Lax`'a düşürmek çözüm sayılmaz.

### `elements` ve `checkout` — CORS sınırı

Bu iki yüzey tanımı gereği cross-origin çalışıyor, dolayısıyla CSRF modeli farklıdır:

- Kart alanları **oturum cookie'si kullanmaz.** Tokenizasyon isteği, kısa ömürlü ve tek kullanımlık bir istemci sırrıyla yetkilendirilir; ambient authority yoktur, dolayısıyla klasik CSRF yüzeyi de yoktur.
- CORS allowlist'i işyerinin kayıtlı domainleriyle sınırlıdır ve `frame-ancestors` ile **aynı kaynaktan** beslenir (Bölüm 24). İki liste ayrı tutulursa er ya da geç ayrışır.
- `Access-Control-Allow-Origin: *` hiçbir uçta kullanılmaz.

---

## 39. Hata Taksonomisi, Ret Kodları ve Yeniden Deneme

Doküman şimdiye kadar "hata mesajı düz Türkçe olsun" diyordu. Ödeme alan bir üründe bu yetmez: hatanın **sınıfı**, kullanıcıya ne söyleyeceğimizi ve arayüzün tekrar denemeye izin verip vermeyeceğini belirler.

### Üç hata sınıfı

| Sınıf | Örnek | Arayüz davranışı |
|---|---|---|
| **Altyapı / ağ** | Zaman aşımı, 5xx, bağlantı kopması | Sonuç **bilinmiyor**. "Başarısız" denmez — Bölüm 16 kuralı: "durum doğrulanıyor" + sunucudan sorgulama |
| **İş kuralı** | Limit aşımı, yetersiz bakiye, geçersiz IBAN | Kesin ve düzeltilebilir. Alan altında, ne yapılacağını söyleyerek |
| **Ödeme reddi** | Bankanın ret kodu | Aşağıdaki eşlemeye göre; soft/hard ayrımı belirleyici |

### Ret kodu eşlemesi

| Kural | Uygulama |
|---|---|
| **Ham kod kullanıcıya asla gösterilmez** | `54` değil → "Kartınızın süresi dolmuş görünüyor. Son kullanma tarihini kontrol edin veya başka bir kart deneyin." Ham kod yalnızca `merchant` işlem detayında ve geliştirici günlüğünde |
| **Soft / hard ayrımı zorunlu** | Soft (geçici: yetersiz bakiye, bankanın geçici reddi) tekrar denenebilir. Hard (kalıcı: kayıp/çalıntı kart, kapalı hesap) denenmez, başka yöntem önerilir |
| **Denenebilir kodlar açık listede** | Tek tek yazılır. **Bilinmeyen kod varsayılan olarak denenmez** — yeni kod varyantlarında kart ağı cezasına girmemek için |
| **Ağ kuralları arayüzü bağlar** | Kart ağlarının aynı kart/tutar çifti için deneme sınırı vardır. Arayüz bu sınırı aşacak bir "tekrar dene" sunmaz |
| **Denemeler arasında minimum bekleme** | Arka arkaya deneme sonucu değiştirmez, risk skorunu bozar |
| **Eşleme tablosu tek yerde** | `packages/card` içinde. `checkout`, `elements` ve `merchant` aynı tabloyu okur — üç ayrı yerde farklı mesaj yasak |

### Hata sonrası arayüz davranışı

| Kural | Gerekçe |
|---|---|
| **Girilen veri asla silinmez** | Hatadan sonra sıfırlanan form, ödeme akışındaki en pahalı tek hatadır. Kart numarası, ad ve adres korunur; CVC güvenlik gereği yeniden istenir |
| **Hata alanın altında, kırmızı çerçeveyle** | Sayfa üstündeki genel banner en kötü seçenek — kullanıcı hangi alanı düzelteceğini bulamaz |
| **Renk tek başına anlam taşımaz** | İkon + metin birlikte (Bölüm 22) |
| **`aria-live` ile duyurulur** | Ekran okuyucu kullanıcısı hatadan haberdar olmalı |
| **Mesaj ne yapılacağını söyler** | "İşlem başarısız" değil → "Bankanız işlemi onaylamadı. Bankanızı arayabilir veya başka bir kart deneyebilirsiniz." |
| **Özür ve teknik jargon yok** | Ne olduğunu ve çözümü söyle, geç |

### Hata sınırları (error boundary)

| Seviye | Davranış |
|---|---|
| **Route** | Sayfa çökerse uygulama kabuğu ayakta kalır, kullanıcı gezinmeye devam eder |
| **Kritik bileşen** (bakiye, işlem listesi, kart formu) | Kendi sınırı içinde çöker, çevresi çalışmaya devam eder |
| **`checkout` kökü** | Çökerse işlem durumunun belirsiz olduğu söylenir ve **tekrar gönderme önerilmez** — sorgulama yolu sunulur |
| Sentry'ye giden | Hata sınıfı, sürüm, route. **Tutar, PAN, kimlik ve kişisel veri asla** |

> **Yükleniyor ile boş durum karıştırılamaz.** Para gösteren hiçbir alanda "yükleniyor" ile "değer sıfır" görsel olarak aynı görünemez. Yüklenmemiş bakiye iskelet (skeleton) ile gösterilir, hiçbir zaman `0` ile. Bakiyesini yanlışlıkla sıfır sanan kullanıcı, teknik olarak hata sayılmayan ama gerçek zarar veren bir durumdur. Aynı kural işlem listesi, limit ve hakediş ekranları için de geçerlidir.

---

## 40. Kurumsal Cüzdan

Kurumsal cüzdan, bireysel cüzdanın "daha büyük limitli" hâli değildir. Farkı tek cümlede: **bireysel cüzdanda parayı harcayan ile karar veren aynı kişidir; kurumsalda değildir.** Bu ayrım frontend'in yarısını belirler.

### 40.1 Ayrı uygulama değil, hesap bağlamı

**Karar: tek `apps/web`, hesap bağlamına göre ayrışan deneyim.**

Gerekçe: bir kişi hem kendi bireysel cüzdanına hem bir veya birkaç şirketin cüzdanına yetkili olabilir. Bunlar arasında geçiş **günlük bir akıştır**, ayrı uygulamaya gitmek değil. Ayrıca ekranların büyük kısmı (bakiye, işlem geçmişi, ayarlar) ortak; ayrı uygulama bunları ikiye böler.

| Konu | Karar |
|---|---|
| Bağlam değiştirici | Kalıcı ve her ekranda görünür. Hangi hesaptasın sorusu bir tık uzakta olmamalı, **okunur** olmalı |
| Bağlam URL'de taşınır | Paylaşılan link doğru hesabı açar; `nuqs` ile tip-güvenli. Yanlış bağlamda açılan link sessizce başka hesabı göstermez, uyarır |
| Bağlam değişimi veriyi tazeler | TanStack Query cache'i hesap kimliğiyle anahtarlanır — Bölüm 33'teki test/canlı mod kuralının aynısı |
| Görsel ayrım | Kurumsal bağlam kalıcı bir kimlik taşır (şirket adı + işaret). Renk tek başına yeterli değil (Bölüm 22) |
| Route ayrımı | Kurumsala özel ekranlar ayrı route ağacında; kod bölme bağlam bazında |
| Mobil | Bağlam değiştirici mobilde de var. **Onay akışı mobilde birinci sınıf** — yönetici yolda onaylar. Toplu yükleme mobilde yok |

> **Yanlış bağlamda işlem, kurumsal cüzdanın en pahalı kullanıcı hatasıdır.** Şirket parasını bireysel hesaptan göndermek ya da tersi, geri alınması zor bir hatadır. Bu yüzden bağlam göstergesi para hareketi ekranlarında **onay adımında tekrar edilir** (Bölüm 16'daki onay ekranı kuralına ek).

### 40.2 Çok kullanıcılı erişim ve yetki

Bir şirket hesabına birden fazla kişi erişir ve hepsi aynı şeyi yapamaz.

| Rol | Yapabildiği |
|---|---|
| **Görüntüleyen** | Bakiye ve işlem geçmişi; hiçbir para hareketi başlatamaz |
| **Hazırlayan** | Transfer/ödeme hazırlar, onaya gönderir. Kendi hazırladığını **onaylayamaz** |
| **Onaylayan** | Bekleyen işlemleri onaylar veya reddeder |
| **Yönetici** | Kullanıcı ve yetki yönetimi, limit tanımı |

| Kural | Gerekçe |
|---|---|
| Roller **hesap bazında**dır, kullanıcı bazında değil | Aynı kişi A şirketinde onaylayan, B şirketinde görüntüleyen olabilir |
| **UI gizleme güvenlik değildir** | Bölüm 18 kuralı burada da geçerli — yetki sunucuda |
| Yetkisiz eylem gizlenmez, **açıklanır** | Buton yok olursa kullanıcı ne yapacağını bilemez. Devre dışı + "bu işlem için onaylayan yetkisi gerekiyor" |
| Kullanıcı davet akışı | E-posta/telefon ile davet, rol seçimi, kabul edene kadar bekleyen durum |
| Yetki değişikliği denetlenir | Kim kimin yetkisini ne zaman değiştirdi — kurumsal müşteri bunu görmek ister |

### 40.3 Onay akışı (maker-checker)

Kurumsal para hareketinin belirleyici farkı budur: işlem **hazırlanır**, sonra **onaylanır**. Türk kurumsal bankacılığında standarttır — şirketin imza sirkülerine göre tek, çift veya çok kademeli onay kurulur.

| Konu | Karar |
|---|---|
| **Bekleyen onaylar kuyruğu** | Kendi başına bir ekran ve bir bildirim kaynağı. Kurumsal kullanıcının en sık girdiği yer |
| Onay durumu görünür | "2 onaydan 1'i tamam — kalan: Ayşe Y." Kaç onay gerektiği ve kimin beklendiği açıkça yazılır |
| **Hazırlayan kendi işlemini onaylayamaz** | Sunucuda zorlanır; UI'da da baştan devre dışı ve gerekçesi yazılı |
| Reddetme gerekçe ister | Hazırlayan neden reddedildiğini görmeli, yoksa aynı hatayı tekrarlar |
| Onay **step-up auth** ister | Yüksek tutarda ek doğrulama (Bölüm 7). Onaylayan "yanlışlıkla" onaylayamamalı |
| Onay ekranı tam bilgi gösterir | Alıcı, tutar, ücret, toplam, hazırlayan, hazırlanma zamanı. Bölüm 16'daki onay ekranı kuralının kurumsal genişlemesi |
| Süre aşımı | Onaylanmayan işlem belirli sürede düşer; kullanıcıya geri sayım gösterilir |
| Değişiklik onayı bozar | İşlem detayı değişirse mevcut onaylar geçersiz olur. Bu, dinamik bağlamanın (dynamic linking) kurumsal karşılığıdır |

### 40.4 Toplu işlem

Maaş, tedarikçi ödemesi, iade listesi. Bireysel cüzdanda karşılığı yok.

| Konu | Karar |
|---|---|
| Yükleme | CSV/XML dosya; **önce doğrulama, sonra onay, sonra icra**. Yükler yüklemez işleme girmez |
| Doğrulama raporu | Satır bazında: kaç satır geçerli, kaç hatalı, hangi satır neden hatalı. Hatalı satır **indirilebilir** olmalı ki düzeltilip tekrar yüklensin |
| Kısmi kabul | Karar: **hepsi ya da hiçbiri değil** — geçerli satırlar işlenir, hatalılar rapor edilir. Ama bu seçim kullanıcıya açıkça sorulur |
| Toplam maliyet önizlemesi | İcradan önce toplam tutar + toplam ücret. Onay bunun üzerinedir |
| İlerleme | Uzun süren toplu işlem arka planda koşar; kullanıcı sayfadan ayrılabilir, sonuç bildirimle gelir |
| Sonuç raporu | Satır bazında sonuç, indirilebilir. Başarısız satırlar için **tekrar deneme aynı idempotency anahtarlarıyla** (Bölüm 16) |
| Büyük dosya | Doğrudan tarayıcıdan işlenmez; imzalı URL ile yüklenir, sunucu işler (Bölüm 12 dosya yükleme kuralı) |

### 40.5 Kurumsal kimlik doğrulama (KYB)

Şirket kaydı bireysel kayıttan farklıdır ve frontend'e ağır bir belge akışı getirir.

| Adım | Frontend sorumluluğu |
|---|---|
| Şirket bilgileri | Vergi numarası, ticaret sicil numarası, unvan — doğrulama sunucuda, format kontrolü istemcide |
| Belge yükleme | Ticaret sicil gazetesi, vergi levhası, imza sirküleri. Çoklu dosya, tip ve boyut doğrulaması **hem istemci hem sunucu** |
| **Gerçek faydalanıcı (UBO)** | Şirketin nihai sahiplerinin tespiti — MASAK yükümlülüğü. Birden fazla kişi, her biri için kimlik bilgisi. Frontend'in en karmaşık formu |
| Yetkili kişi doğrulaması | İmza yetkilisinin kendi kimlik doğrulaması — bireysel KYC akışına bağlanır |
| Durum takibi | Başvuru inceleniyor / ek belge isteniyor / onaylandı / reddedildi. **Ek belge istenirse hangi belge, neden** |
| Kısmi kayıt | Uzun bir akış — her adım kaydedilir, kullanıcı bırakıp dönebilir |

> **Not:** Bu akışın sunucu tarafı ve mevzuat yorumu backend `onboarding` servisindedir; bu bölüm yalnızca arayüz sorumluluğunu tanımlar. Hangi belgenin zorunlu olduğu **hukuk onayı gerektirir**.

### 40.6 Muhasebe ve raporlama çıktıları

Kurumsal kullanıcı veriyi kendi sistemine taşımak ister.

| İhtiyaç | Karar |
|---|---|
| Hesap ekstresi | Tarih aralığı seçimli; PDF (okuma) + CSV/Excel (işleme) |
| Muhasebe formatı | Standart bankacılık ekstre formatları yol haritasında; ilk turda CSV yeterli |
| Fatura bilgileri | Kurumsal kullanıcı ücret/komisyon için fatura ister — fatura adresi ve vergi bilgisi profilde |
| Büyük rapor | İstemcide üretilmez; sunucuda hazırlanıp bildirimle indirme bağlantısı gönderilir (Bölüm 12) |
| Erişim izi | Şirket yöneticisi kendi kullanıcılarının işlem ve giriş kaydını görebilir |

---

## Özet Sürüm Tablosu

| Teknoloji | Sürüm |
|---|---|
| TypeScript | 5.x (strict) |
| Node.js | **24 LTS** (Aktif LTS; 22 bakım hattına geçti) |
| pnpm | **10.x** |
| React | 19.2 |
| React Compiler | 1.0 (tüm React yüzeylerinde) |
| Next.js | 16.x (Turbopack varsayılan + React Compiler + Cache Components) |
| Vite | Rolldown motorlu |
| Expo SDK | **57** (Eylül 2026'da stabil) |
| State | Zustand + TanStack Query v6 + nuqs |
| Validation | Valibot (Standard Schema) |
| API katmanı | openapi-typescript + openapi-fetch (TS backend'de: oRPC) |
| Keycloak | 26.7.x (FAPI 2.0 Final + DPoP + Passkeys + Argon2id) |
| Keycloakify | 26 |
| Tailwind CSS | v4 |
| Biome | v2 (tek lint+format aracı) |
| Fumadocs | v16 hattı |
| Tasarım sistemi | `packages/ui` shadcn/Radix + Tailwind v4 (**web-only**) · `packages/uim` RNR + NativeWind (**mobil-only**). Ortak token paketi **yok**, her paket kendi token'ını tanımlar |
| Mobil depolama | expo-secure-store (sır) + MMKV (hız) |
| Para | Dinero.js v2 + Intl.NumberFormat (+ decimal.js/BigInt kripto) |
| Animasyon | Motion (seçici) + AutoAnimate / Reanimated 4 (mobil) |
| Chart | Recharts (web) / Victory Native (mobil) |
| Tablo | TanStack Table + TanStack Virtual / FlashList (mobil) |
| Tarih | date-fns v4 + Intl.DateTimeFormat |
| İkon | Phosphor Icons (6 ağırlık, alt-yol import) |
| Gözlemlenebilirlik | Sentry + OpenTelemetry + PostHog (self-host) |
| Tarayıcı güvenliği | Trusted Types + CSP L3 strict-dynamic + DOMPurify + COOP/COEP/CORP |
| Çerçeveleme | `frame-ancestors 'none'` (checkout dahil); `elements` için dinamik, doğrulanmış domain allowlist'i |
| CSRF | SameSite=Strict + özel başlık (CORS ön kontrolü) + BFF'te Origin/Referer doğrulaması |
| Hata yönetimi | Üç sınıf (altyapı/iş kuralı/ret); soft-hard ret ayrımı, bilinmeyen kod denenmez; eşleme `packages/card`'da |
| Performans (INP) | scheduler.yield + Speculation Rules + bfcache + useTransition |
| Passkey istemci | @simplewebauthn/browser + Conditional UI |
| Tedarik zinciri | ignore-scripts + Socket.dev + osv-scanner + SBOM + karantina |
| Kurumsal cüzdan | Tek `apps/web`, hesap bağlamı; rol bazlı yetki, maker-checker onay, toplu işlem, KYB (Bölüm 40) |

### `pay` (sanal POS) tarafı

| Konu | Karar |
|---|---|
| Checkout sayfası | `apps/checkout` — Next.js 16, **ayrı origin**, üçüncü taraf script sıfır |
| Gömülü kart alanları | `apps/elements` — alan başına ayrı iframe + görünmez kontrolör iframe |
| Dağıtılan SDK | `pay.js`, daima kendi CDN'imizden (`js.<domain>/v1/`), asla bundle'lanmaz |
| Öne çıkarılan entegrasyon | Model 3+ (gömülü alanlar); ikincil Model 3 (ortak ödeme sayfası) |
| 3D güvenlik | 3D Pay varsayılan; 3D Secure / 3D Host / Non-Secure destekli |
| 3DS sürümü | EMV 3DS 2.x — gizli method iframe + esnek challenge konteyneri |
| Kart yardımcıları | `packages/card` — Luhn, BIN çözümleme, taksit tablosu modeli |
| Taksit | Tablo **sunucudan**; aritmetik `packages/money`; artık kuruş ilk taksite |
| İşyeri paneli | `apps/merchant` — Next.js + BFF (SPA değil, dışa açık) |
| Gerçek zamanlı (panel) | SSE; cüzdan tarafında WebSocket korunur |
| Geliştirici dokümanı | `apps/docs` — tek uygulama; genel referans + iç doküman, ayrım build zamanında |
| SDK dilleri | PHP, Python, Node.js, C#, Java — OpenAPI'den üretilir |
| PCI rolü | **Hizmet sağlayıcı** (SAQ D / Level 1 hattı) — Bölüm 35, hukuk onayı gerekli |
| Tasarım sistemi | Üç katmanlı token (ilkel → anlamsal → marka); işyerine serbest CSS **verilmez** |
| Karekod | TR Karekod (TCMB/BKM) şeması, üretim `packages/card` içinde tek noktada |
| SPC / ajan ticareti | Uygulanmıyor; mimari engellenmiyor (Bölüm 32, 37) |

### Sürüm doğrulama notu — 5 Eylül 2026

**Doğrulanıp güncellenenler:** Node.js (22 → **24 LTS**), pnpm (9.x → **10.x**), Expo SDK (56 → **57**).

**Doğrulanıp yerinde bulunanlar:** React **19.2** (19.2.8 son yama; 19.3/20 yok), Next.js **16.2.x**, Tailwind CSS **v4** (4.3.2), Biome **v2** (2.3), Keycloak **26.7.3**.

**Henüz doğrulanmadı** — kod yazımından önce kontrol edilmeli: TanStack Query v6, Valibot, Zustand, nuqs, Dinero.js v2, date-fns v4, Motion, Recharts, Fumadocs v16, Keycloakify 26, Phosphor Icons, SimpleWebAuthn, Vite/Rolldown.

> **Kural:** Bu doküman sürüm kaynağı değildir. Kod yazımı başlarken her sürüm kendi kaynağından teyit edilir ve lockfile doğruluk kaynağı olur. Doküman gerekçeyi taşır, sürüm numarasını değil.
>
> **İskeletle çelişki uyarısı:** Mevcut `ui/` monorepo iskeleti bu dokümanla üç noktada çelişiyor — iskelet **ESLint + Prettier** kullanıyor (doküman Bölüm 6: yalnızca Biome), **pnpm 10.33** (doküman: 9.x), **Node >= 20** (doküman: 22 LTS). Kod yazılmadan önce ya doküman ya iskelet güncellenmeli.