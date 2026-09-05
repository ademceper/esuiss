# suiss — Backend Teknoloji Kararı

> **suiss**, tek Go workspace'i içinde iki ürünü besler: **`wallet`** (bireysel ve kurumsal e-para cüzdanı) ve **`pay`** (üye işyerine kart kabulü sağlayan sanal POS). Paylaşılan `pkg/` kütüphaneleri ve database-per-service ilkesi üzerinden beslenen mikroservis mimarisi. Para tutan ve kart verisi işleyen bir platformda **doğruluk > güvenlik > performans > kolaylık** sıralaması pazarlık konusu değildir. Her kararda "bu ölçekte en performanslı + en güvenli olan" ölçütü uygulanmıştır. Sürüm bilgileri **5 Eylül 2026 itibarıyla doğrulanmıştır** (doğrulama kapsamı ve yöntemi Özet Sürüm Tablosu'nun sonunda).

## 1. Mimari İlke

**KAPSAM: Bu doküman yalnızca BACKEND kararlarını içerir.** Frontend uygulamaları (paneller, mobil, Keycloak temalarının React katmanı, Novu dashboard fork'u) kapsam dışıdır ve kendi teknoloji kararı dokümanında ele alınır.

İki sınır noktası bilinçli olarak dahildir:
- **Keycloak sunucusu ve özel SPI'ları** — login akışının kuralları (kilitleme, OTP, güvenlik görseli) Java uzantılarıyla backend'de yaşar; tema yalnızca render eder.
- **Novu self-host stack'i ve köprü servisi** — bildirim altyapısı backend sorumluluğudur; frontend yalnızca Inbox bileşenlerini tüketir.

Bütün servisler **tek bir `go.work` workspace'i** içinde yaşar ve ortak paketlerden beslenir. Bir middleware veya sözleşme değişikliği tek yerden tüm servislere yayılır.

### 1.1 İki ürün, tek workspace — servis paylaşım ilkesi

Servisler ürüne göre değil **domaine göre** bölünür. Bir yetenek iki üründe de gerekiyorsa **tek servis** olarak yazılır ve iki ürüne birden hizmet eder; ikinci bir kopyası açılmaz.

| İlke | Uygulama |
|---|---|
| **Ortak domain → tek servis** | Risk skorlama iki üründe de var → tek `fraud` servisi, iki kural seti |
| **Ayrışan domain → ayrı servis** | Kullanıcı kartı ile işyeri kart kabulü aynı şey değil → `issuing` ve `acquiring` ayrı |
| **Tek defter** | `pay` para hareketleri de `core`'un TigerBeetle defterinde muhasebeleşir. İkinci defter açılmaz — işyeri bakiyesi, komisyon ve hakediş farklı **hesap tipleridir**, farklı sistem değil |
| **Kopyalama yasağı** | Bir servis iki ürüne hizmet ediyorsa ürün ayrımı **kural seti** ve **yetkilendirme** seviyesinde yapılır, kod kopyalanarak değil |

> **`card` servisi yeniden adlandırıldı.** Eski `card` servisi kullanıcının kartını yönetiyordu (issuing). Sanal POS'ta gereken kart **kabulüdür** (acquiring) ve tamamen farklı bir domaindir. İkisinin aynı kelimeyle anılması dokümandaki en pahalı isim tuzağı olurdu: `card` → **`issuing`**, kart kabulü ise **`acquiring`**.

Temel kural: **kod tek kaynaktan, para yolu en katı disiplinle, her servis kendi verisinin tek sahibi, iç ağda bile güven yok (zero-trust).**

---

## 2. Monorepo Temeli

| Katman | Karar | Sürüm | Gerekçe |
|---|---|---|---|
| Dil | **Go** | **1.27** | Tek binary deploy, goroutine başına ~2KB stack, düşük GC duraklaması. Sürüm gerekçesi aşağıda |
| Workspace | `go.work` | — | Proto + pkg + 12 servis tek repoda; atomik cross-service değişiklik |
| Modül stratejisi | Servis başına ayrı `go.mod` | — | Bağımsız bağımlılık yönetimi; CI'da her servis bağımsız derlenir |
| HTTP framework | **Fiber (fasthttp)** | v3.3 | **Kilitli karar.** Bu ölçekte (yüksek TPS para hareketleri) ham throughput gerçek kazanım; güvenlik Bölüm 20 ile sertleştirilir |
| Servisler arası | **gRPC + Protobuf (buf)** | grpc-go 1.81 | Tipli sözleşme, deadline propagation, HTTP/2 multiplexing |

### Neden Go 1.27 (en güncel kararlı hat)
Kod değişikliği gerektirmeyen bedava performans yükseltmesi. **Go 1.27, 19 Ağustos 2026'da çıktı; 1.27.1 yaması 1 Eylül 2026'da yayınlandı.** 1.26'nın getirdiği kazanımların hepsi korunuyor: 1.25'te deneysel olan Green Tea GC 1.26'dan beri varsayılan, küçük nesneler için bellek ayırma çok daha hızlı. Green Tea GC çoğu program için otomatik %10-40 daha az GC yükü sağlıyor; nesne-merkezli taramadan bellek-farkında sayfa taramaya geçerek mark süresinin %35'ini boşa harcayan bellek stall'larını azaltıyor. Fintech için doğrudan değerli: container-aware GOMAXPROCS Kubernetes CPU throttling'i yapılandırma olmadan bitiriyor, Flight Recorder olaydan sonra execution trace yakalıyor. 512 byte altı allocation'lar %30'a kadar hızlı, cgo çağrı yükü ~%30 azaldı. Ek olarak `encoding/json/v2` yüksek throughput serileştirmede daha hızlı ve daha az allocation.

1.27 bunların üzerine generic method desteği, post-quantum kriptografi ve yeni JSON motorunu ekliyor. **Karar: 1.27 hattında kal.** Go'nun altı aylık sürüm temposunda bir sürüm geride kalmak, güvenlik yamalarının destek penceresini gereksiz daraltır.

### Neden Fiber (kilitli karar)
Bu ölçekte fasthttp'nin throughput/latency avantajı (~130k+ req/s, düşük per-request bellek) yüksek TPS para hareketleri için gerçek bir kazanım. fasthttp'nin bilinen dezavantajı net/http ekosistem uyumsuzluğudur; ama middleware zincirinin tamamı (`pkg/middleware` + `pkg/bootstrap`) zaten kendi yazılan kod olduğu için bu dezavantaj büyük ölçüde nötralize edilmiştir. fasthttp'nin footgun'ları (manuel bellek yönetimi, HTTP/2 yokluğu) **Bölüm 20**'de yapısal önlemlerle kapatılır — böylece hem hız hem güvenlik korunur.

### Neden .NET'te kalınmadı
Önceki monolit .NET 9.0'dı. Tek binary + küçük container imajı + cross-compile + goroutine modeli, 12 bağımsız servisli mimaride operasyon maliyetini belirgin düşürüyor. 1153+ migration biriktirmiş paylaşılan veritabanı, database-per-service'e geçişin ana gerekçesi oldu.

---

## 3. Servisler (services/)

Hepsi aynı iskeleti kullanır: `cmd/server` + hexagonal iç yapı (`internal/{domain, port, app, adapter}`) + `pkg/bootstrap.New()` ile ayağa kalkan standart Fiber hattı.

### 3.1 Ortak servisler (her iki ürüne hizmet eder)

Bunlar **tek kez** yazılır. Ürün ayrımı kural seti ve yetkilendirme seviyesindedir, ayrı servis açılmaz.

| Servis | Sorumluluk | `pay` ile ne değişiyor | Faz |
|---|---|---|---|
| `auth` | Kimlik akışlarının servis tarafı; profil, cihaz/oturum | **İki kimlik modeli:** insan için Keycloak/OIDC, makine için işyeri API anahtarı (Bölüm 29) | 1 |
| `core` | Hesap, bakiye, transfer — **TigerBeetle defterinin tek sahibi** | İşyeri bakiyesi, komisyon ve hakediş **aynı deftere** yeni hesap tipleri olarak girer | 1 |
| `notification` | Novu köprüsü: trigger, subscriber sync, In-App token | İşyerine giden bildirimler (iade, itiraz, hakediş) aynı köprüden | 1 |
| `integration` | Dış servis ağ geçidi: circuit breaker + token cache | Genel dış sağlayıcılar burada kalır; **banka POS adaptörleri `acquiring`'e gider** (gerekçe Bölüm 27) | 1 |
| `fraud` | Risk skoru, dolandırıcılık, AML | **İki kural seti:** cüzdanda APP fraud + AML, `pay`'de işlem fraud'u + işyeri fraud'u. Tek motor, farklı sinyal ve eşikler | 2 |
| `reconciliation` | Gün sonu, mutabakat, takas | Acquiring mutabakatı (banka ekstresi ↔ bizim işlemler) aynı motora yeni kaynak olarak eklenir | 3 |
| `approval` | Para hareketi öncesi **onay zinciri** (maker-checker): kural, bekleyen kuyruk, onay/ret kaydı | Kurumsal cüzdan transferleri **ve** işyeri iadelerinde aynı motor kullanılır | 2 |
| `reporting` | Raporlar, döviz, mevzuat formları | İşyeri raporları ve mevzuat bildirimleri aynı servisten | 3 |

### 3.2 Yalnızca `wallet`

| Servis | Sorumluluk | Faz |
|---|---|---|
| `issuing` | Kullanıcı kartı yaşam döngüsü, stok, PIN, limit — **eski `card`** | 1 |
| `fast` | Bankalararası anlık transfer (FAST), Kolas proxy, TR Karekod üretimi | 2 |
| `onboarding` | Kimlik doğrulama ve kademeli kayıt: **bireysel KYC** (a1 telefon / l1 TCKN) ve **kurumsal KYB** (ticaret sicil, vergi levhası, imza sirküleri, gerçek faydalanıcı tespiti) | 2 |
| `campaign` | Kampanya, cashback, referans ödülleri | 3 |
| `corporate` | Kurumsal hesap yapısı, organizasyon üyeliği ve rol yönetimi, **toplu işlem** (dosya alımı, satır doğrulama, icra, sonuç raporu), muhasebe çıktıları | **2** |

### 3.3 Yalnızca `pay` (sanal POS)

| Servis | Sorumluluk | Faz |
|---|---|---|
| `merchant` | Üye işyeri yaşam döngüsü: başvuru, sözleşme, komisyon ve taksit oranları, **domain doğrulama**, API anahtarları | 1 |
| `vault` | PAN tokenizasyon ve saklama — **CDE'nin kalbi**, ayrı güven bölgesi (Bölüm 26) | 1 |
| `acquiring` | Provizyon, ön provizyon, iptal, iade, kısmi iade, taksit; **banka POS adaptörleri ve yönlendirme** (Bölüm 27) | 1 |
| `threeds` | 3DS 2.x sunucusu / MPI: method içeriği, challenge yönetimi, sonuç doğrulama (Bölüm 28) | 1 |
| `webhook` | İşyerine olay teslimi: imzalama, yeniden deneme, DLQ, olay günlüğü (Bölüm 30) | 1 |
| `settlement` | Hakediş hesabı, valör, komisyon kesintisi, işyerine ödeme | 2 |
| `dispute` | Chargeback/itiraz akışı: delil toplama, son tarih takibi | 3 |

> **Not — `integration` ayrı servis çünkü:** dış dünyanın kırılganlığı (timeout, sertifika, kota) tek bir sınırda hapsedilir. Diğer servisler dış sağlayıcı bilmez; sadece gRPC ile Integration'a konuşur.

> **Not — neden `acquiring` ayrı, `integration`'ın içinde değil:** banka POS çağrıları para yolundadır ve p99 bütçesine tabidir; ayrıca 3DS akışı durum taşır ve ret kodları domaine özgüdür. `integration`'ın genel amaçlı devre kesici mantığı bu yükü taşımaz. Detay Bölüm 27.

> **Not — `threeds` neden ayrı:** protokol karmaşıklığı ve PCI kapsam ayrımı için. Erken fazda `acquiring` içinde bir paket olarak başlayıp hacim arttığında ayrılabilir; sözleşme baştan ayrı tutulur ki ayrılma maliyeti düşük olsun.

---

## 4. Ortak Paketler (pkg/)

| Paket | İçerik |
|---|---|
| `bootstrap` | Standart servis iskeleti: Fiber + middleware zinciri + healthz/readyz/metrics + graceful shutdown + timeout/limit sertleştirmesi (Böl. 20) |
| `middleware` | CorrelationID, SecurityHeaders, KeycloakAuth (JWT/OIDC + **DPoP doğrulama**), ChannelValidation |
| `config` | Viper tabanlı yapılandırma; ortam değişkeni override, servis başına `config.yaml` |
| `logger` | zerolog yapılandırılmış JSON log |
| `telemetry` | OpenTelemetry trace kurulumu (OTLP/HTTP → Tempo) |
| `metrics` | Prometheus kayıt ve ortak metrikler |
| `errors` | Tek tip hata modeli; HTTP/gRPC eşlemesi |
| `validator` | go-playground/validator v10 + özel tag'ler (`tckn`, `iban`, `phone_tr`, `no_xss`, `sql_safe`) |
| `database` | pgx işlem yardımcıları (`RunInTx`); GORM yalnız basit CRUD'da |
| `event`, `outbox` | NATS JetStream yayın/tüketim + transactional outbox |
| `saga` | Çok adımlı dağıtık işlemler için saga/telafi düzeni |
| `circuitbreaker` | sony/gobreaker sarmalayıcı |
| `httpclient`, `httputil` | Timeout'lu, izlenebilir, **mTLS'li** dış çağrı istemcisi |
| `joblock`, `scheduler` | Redis distributed lock + robfig/cron; job'lar tek instance'ta koşar |
| `tokencache` | Dış sağlayıcı token'larının Redis cache'i |
| `crypto` | AES-256-GCM alan şifreleme; anahtarlar **KMS/HSM envelope encryption** ile (Böl. 22) |
| `masking` | Log ve yanıtlarda PII maskeleme (TCKN, telefon, kart no) |
| `audit` | Değiştirilemez (append-only, hash-zincirli) denetim izi yazıcısı (Böl. 17) |
| `fasthttpsafe` | fasthttp değer kopyalama yardımcıları + lint kuralları (Böl. 20) |
| `apikey` | İşyeri API anahtarı üretimi, hash'li saklama, kapsam (scope) ve mod kontrolü (Böl. 29) |
| `mode` | Test/canlı mod bağlamı; her sorgu ve her dış çağrı mod bilgisini taşımak zorunda (Böl. 31) |
| `declinecode` | Banka ret kodu → **kanonik kod** → istemci mesaj anahtarı eşlemesi (Böl. 27) |
| `webhooksign` | Webhook HMAC imzalama; ham gövde üzerinden, zaman damgalı (Böl. 30) |
| `pan` | **Yalnızca CDE içinde kullanılır.** Luhn, BIN çözümleme, maskeleme. `vault` ve `acquiring` dışındaki servislerin bu paketi import etmesi lint ile engellenir |

**Kural:** Bir davranış iki serviste tekrar ediyorsa `pkg/`'a iner. Servisler birbirinin `internal`'ına asla uzanamaz.

---

## 5. Kesişen Kararlar (Cross-cutting)

| İhtiyaç | Karar | Not |
|---|---|---|
| İç mimari | **Hexagonal (port & adapter)** | `domain` saf, `adapter` değiştirilebilir; test edilebilirlik |
| HTTP middleware zinciri | **Recover → Logger → CorrelationID → SecurityHeaders → CORS → RateLimit → BodyLimit/Timeout → KeycloakAuth (+DPoP) → ChannelValidation** | `bootstrap` içinde standart; healthz/readyz/metrics auth dışı |
| Yapılandırma | **Viper** | `config.yaml` + env override; eksik kritik değerde servis kalkmaz |
| Loglama | **zerolog** | Yapılandırılmış JSON; correlation ID her satırda |
| Doğrulama | **validator v10 + özel tag'ler** | İstek gövdeleri handler'a inmeden reddedilir |
| Kimlik claim'leri | `channel`, `user_type`, `tenant_scope` | Keycloak protocol mapper ile token'a girer; ChannelValidation çaprazı 403'ler |
| ID üretimi | **UUID v4** (`google/uuid`) | İdempotency anahtarları dahil |
| Serileştirme | **encoding/json/v2** | Yüksek throughput'ta daha hızlı, daha az allocation |
| Zaman | **Her zaman UTC sakla** | Finansal kayıtta zaman dilimi hatası = mutabakat hatası |

---

## 6. Geliştirme Araç Zinciri (Tooling)

| Kategori | Karar | Not |
|---|---|---|
| Build/görevler | **Makefile** | `run`, `build`, `test`, `lint`, `proto-gen`, `keycloak-ext`, `migrate-up/down`, `docker-up/down` |
| Lint | **golangci-lint** (+ özel fasthttp kuralları) | CI kapısı; `go vet` ayrıca koşar |
| Proto | **buf** | `proto/{common, core, card, fraud, identity, integration, notification}`; breaking-change denetimi |
| Keycloak uzantıları | **Maven (Java 21)** | `make keycloak-ext` tüm SPI jar'larını üretir |
| Migration | **golang-migrate** (`make migrate-up/down`) | Otomatik migration prod'da yasak |
| Yerel ortam | **docker compose** (include'lu) | Tek komutla tüm stack |

> **Not — lint kararı kesin:** Tek linter golangci-lint. Az araç = az hareketli parça; cüzdanda bu bir güvenlik artısıdır. fasthttp footgun'ları için özel lint kuralları eklenir (Böl. 20).

---

## 7. Kimlik ve Veri Koruma Katmanı

Para tutan bir platform olduğu için standart stack'in üstüne banka disiplininde bir kimlik ve veri koruma katmanı kurulmuştur.

Bu bölüm **insan kimliğini** anlatır: cüzdan kullanıcısı ve işyeri panelini kullanan kişi, ikisi de Keycloak üzerinden doğrulanır. İşyerinin **sunucusunun** bizi çağırırken kullandığı makine kimliği (API anahtarı) farklı bir modeldir ve Bölüm 29'da ele alınır.

### Kimlik doğrulama (Keycloak 26.7 + özel SPI'lar)

Login akışı hazır Keycloak akışı değildir; dört özel uzantıyla (Java SPI) banka tipi akış kurulmuştur:

- **Telefon + 6 haneli PIN:** Kimlik telefon numarasıdır (`phone-username-password-form`); yalnızca **onaylı** telefon eşleşir, onaysız telefon genel "kullanıcı adı veya şifre hatalı" hatasına düşer (kullanıcı varlığı sızdırılmaz).
- **Şifre politikası:** `length(6)` + `^[0-9]{6}$` + `passwordHistory(3)` + **pinStrength** (ardışık/tekrarlı/doğum tarihi/TCKN/telefon türevi reddedilir) + **forceExpiredPasswordChange(90)**.
- **Hesap kilidi:** brute force koruması, **3 hatalı PIN'de geçici kilit** + bilgilendirme SMS'i; "şifremi unuttum" akışında telefon OTP ile self-service unlock.
- **Güvenlik görseli (anti-phishing):** ilk girişte katalogdan seç, sonrakilerde onayla.
- **SMS OTP (her girişte):** 6 hane, **3 dk geçerli**, 3 yanlışta iptal + yeni kod. Login ve reset aynı `OtpCodes` durum makinesini paylaşır.
- **Kademeli kayıt:** a1 (telefon) / l1 (TCKN + kimlik doğrulama); TCKN algoritma doğrulaması ve 18 yaş kontrolü sunucuda.
- **Kurumsal hesaplar — Keycloak Organizations:** Kurumsal cüzdan için ayrı realm açılmaz. Keycloak 26'da **Organizations** birinci sınıf ve stabil bir özelliktir: tek realm içinde çok kiracılık, organizasyon bazlı üyelik, davet akışı ve **organizasyona özel roller** sağlar. Bir kullanıcı birden çok organizasyona üye olabilir ve her birinde farklı role sahip olabilir — kurumsal cüzdanın tam ihtiyacı budur. 26.6+ ile gelen **Organization Groups** şirket içi departman/ekip hiyerarşisini de karşılar.
- **Organizasyon claim'i:** Aktif organizasyon ve o organizasyondaki roller token'a protocol mapper ile girer. Servisler yetkiyi bu claim'den okur; `tenant_scope` bu modele bağlanır.
- **Çoklu sözleşme onayı:** KVKK/koşullar/pazarlama izinleri sürümlü; sürüm değişince reconsent zorunlu.

> **Frontend uyum notu:** Frontend passkey/DPoP/FAPI 2.0 öngördü. Uzlaşı: PIN+OTP+görsel birincil kalır, **passkey opt-in ikinci yöntem** eklenir, **DPoP token seviyesinde çift taraflı açılır**, FAPI 2.0 yol haritasına konur.

### Token güvenliği

- **Kısa access token (dakikalar) + refresh rotasyonu**; her servis token'ı OIDC discovery ile doğrular.
- **DPoP doğrulama:** `KeycloakAuth` middleware sender-constrained token'ı doğrular (`cnf/jkt` eşleşmesi); çalınan token başka istemcide işe yaramaz.
- **Channel doğrulama:** `channel`/`user_type` claim'leri çapraz kullanılamaz (WEB/MOBILE ↔ API 403).
- Fine-grained admin yetkileri client rolleriyle (`users:read`, `wallets:freeze`, `withdrawals:approve`...); kompozit rollere bağlanır.

### Veri koruması (özet — detay Böl. 22)

| Veri | Yöntem |
|---|---|
| TCKN, kart numarası (DB'de) | AES-256-GCM alan şifreleme, KMS/HSM envelope encryption |
| Şifre/PIN (Keycloak'ta) | Argon2id |
| Log ve yanıtlar | `pkg/masking`; **PII, tutar ve token asla loglanmaz** |
| HTTP yanıtları | SecurityHeaders: HSTS, nosniff, DENY, CSP, Permissions-Policy; `Server` başlığı silinir |

---

## 8. Klasör Yapısı

```
server/
├─ go.work                  # 12 servis + pkg tek workspace
├─ Makefile
├─ docker-compose.yml       # include: infra/keycloak/docker-compose.yml
├─ proto/                   # buf ile yönetilen gRPC sözleşmeleri
│  ├─ common/ core/ issuing/ fraud/ identity/ integration/ notification/
│  ├─ merchant/ acquiring/ threeds/ vault/ webhook/ settlement/
├─ pkg/                     # paylaşılan kütüphaneler (Bölüm 4)
├─ services/
│  └─ <servis>/
│     ├─ cmd/server/main.go
│     ├─ config.yaml
│     └─ internal/{domain, port, app, adapter}
└─ infra/
   ├─ envoy/                # kenar gateway: HTTP/3, TLS, mTLS origin
   ├─ istio/                # Ambient mesh yapılandırması (ztunnel, waypoint)
   ├─ keycloak/             # realm import + özel SPI uzantıları (Java)
   │  └─ extensions/{login, registration, multi-terms, authz}
   └─ novu/                 # self-host Novu stack'i
```

---

## 9. Bildirimler — Novu Köprüsü

Bildirim altyapısı **self-hosted Novu**'dur (`infra/novu`); backend'de tek temas noktası `notification` servisidir.

| Uç | İş |
|---|---|
| `POST /api/notification/trigger` | Novu workflow tetikleme (işlem makbuzu, OTP, kampanya) |
| `POST /api/notification/subscribers` | Çağıranı Keycloak claim'lerinden Novu subscriber'ına senkronlama |
| `GET /api/notification/inapp-token` | In-App merkez kimliği (subscriberId + HMAC) — **frontend Inbox tüketir** |
| `ALL /api/notification/me/*` | Self-service passthrough — yalnızca çağıranın kendi kaydı |
| `ALL /api/notification/admin/*` | Tam Novu /v1 yüzeyi — **`notification-admin` realm rolü şartıyla** |

- Tüm uçlar paylaşılan Keycloak auth middleware'inin arkasındadır; handler subject claim'ine güvenir.
- Novu API anahtarı açılışta bootstrap edilir; diğer servisler Novu'yu bilmez, köprüyü çağırır.
- SMS/e-posta sağlayıcıları Novu integration'ları olarak yönetilir.

---

## 10. Kod Sağlığı, Kalite Kapıları ve Tedarik Zinciri

| Araç / kapı | İş |
|---|---|
| `golangci-lint` + `go vet` + fasthttp kuralları | Statik analiz; CI'da zorunlu geçiş |
| `go build ./...` her serviste | Derlenmeyen kod merge edilemez |
| `buf lint` + breaking check | Proto sözleşme disiplini |
| Tablo-güdümlü birim + property-based test | Para yolu öncelikli |
| **gitleaks** (pre-commit + CI) | Sır sızıntısı — en kritik kapı |
| **govulncheck** | Go bağımlılık zafiyeti (yalnız gerçekten çağrılan zafiyetli kod) |
| **osv-scanner** | Geniş zafiyet veritabanı taraması |

### Go'ya özel tedarik zinciri sertleştirmesi
- **Modül checksum DB açık** + `go.sum` commit'li + `-mod=readonly`.
- **Özel modül proxy** (Athens/JFrog) veya vendoring — upstream kaybı ve tampering'e karşı.
- **Distroless/scratch base imaj** — imajda shell yok, minimum saldırı yüzeyi.
- **İmaj imzalama (cosign/Sigstore)** + admission controller yalnız imzalı imaj çalıştırır.
- **SLSA provenance** + her imaj için SBOM.
- **Pinned CI action'ları** (SHA), minimum izinli token, fork PR'da sır erişimi yok.

---

## 11. Para ve Defter Katmanı (EN KRİTİK)

> Bakiye, ilişkisel tabloda güncellenen bir sütun **değildir** — çift kayıtlı (double-entry) bir defterde muhasebeleştirilir.

### Kurallar (ihlal edilemez)
1. **Para asla float taşınmaz.** Ne Go tipi, ne JSON, ne DB. Tutarlar tamsayı **minor unit** (10,50 TL → `1050` kuruş).
2. **Bakiye türetilir, atanmaz.** `UPDATE balance = ...` yasaktır.
3. **Her para hareketi çift kayıttır:** borç ve alacak bacağı aynı atomik transferde; toplam daima sıfırlanır.
4. **Yuvarlama tek noktada ve açıkça**; kuruş paylaştırma kayıpsız `allocate` mantığıyla.
5. **JSON'da tutar integer veya string'dir**, float değil. (Frontend `packages/money` ile birebir aynı sözleşme.)

### Kararlar
| İhtiyaç | Karar | Not |
|---|---|---|
| Defter (ledger) | **TigerBeetle 0.17.9** | Çift kayıt için tasarlanmış tek amaçlı finansal DB; debit/credit, two-phase transfer, bakiye garantileri motorda |
| Defter sahibi | **Yalnızca `core` servisi** | Başka servis TigerBeetle'a bağlanamaz; para hareketi = core'a gRPC |
| İlişkisel yan | PostgreSQL (core DB) | Metadata + işlem geçmişi görünümü — para gerçeği değil, izdüşümü |
| Kimliklendirme | UUID + idempotency key | Aynı transfer iki kez muhasebeleşemez (Böl. 17) |
| Defter dayanıklılığı | Yerleşik replikasyon (cluster) + düzenli yedek + point-in-time recovery | Defter tek hata noktası olamaz |
| `pay` hesap tipleri | İşyeri bakiyesi, komisyon geliri, hakediş bekleyen, iade karşılığı, itiraz bloke | **Aynı defter**, ayrı hesap tipleri — ikinci bir defter açılmaz |
| Kurumsal hesap tipleri | Şirket ana hesabı, alt hesap/masraf merkezi, onay bekleyen bloke | Onay bekleyen tutar defterde **bloke** olarak durur; onay gelmeden serbest bakiyeye sayılmaz |

> **Sanal POS neden aynı defterde:** Bir ödeme, işyerinin alacağı ile bizim komisyon gelirimizin aynı anda doğduğu bir olaydır; iade bunun tersini yazar. İki ayrı sistemde tutulursa aralarındaki mutabakat kendi başına bir problem hâline gelir. Tek defter, çift kayıt disiplinini `pay` tarafına bedelsiz taşır.

> **Neden TigerBeetle:** `SELECT ... FOR UPDATE` ile elle kurulan bakiye disiplini her geliştiricinin doğru hatırlamasına bağlıdır. Defter semantiğini motora gömmek (negatif bakiye reddi, çift bacak zorunluluğu, idempotent transfer) insan hatası sınıfını yapısal olarak kapatır.

---

## 12. Veri Katmanı

| Konu | Karar | Not |
|---|---|---|
| Veritabanı | **PostgreSQL 18.6** | Servis başına **ayrı instance**. PostgreSQL 19 Eylül/Ekim 2026'da çıkıyor ama hâlâ beta — **bilinçli olarak 18 hattında kalınıyor**, para tutan sistemde yeni major sürüm beklenir |
| DB driver | **pgx** (para yolu) / GORM (basit CRUD) | pgx: öngörülebilir, hızlı, elle SQL; GORM magic'i para yolunda yok |
| Cross-service veri | **JOIN yok** | gRPC ile sorgula veya NATS event'iyle denormalize et |
| İşlem sınırı | `pkg/database.RunInTx` ile açık | Auto-migrate prod'da yasak |
| Cache / kısa ömürlü durum | **Redis 8** | Distributed lock, sağlayıcı token cache, rate limit durumu |
| Bağlantı güvenliği | DB'ye **TLS**; kimlik bilgisi KMS/secret store'dan | |
| Şifreleme | Hassas alanlar AES-256-GCM, PII maskeli loglanır | Böl. 22 |

---

## 13. Mesajlaşma ve Event-Driven Akış

| Konu | Karar | Not |
|---|---|---|
| Broker | **NATS JetStream — 3 düğümlü cluster** | Kalıcı stream, at-least-once, yeniden oynatma |
| Yayın disiplini | **Transactional outbox (`pkg/outbox`)** | Event iş verisiyle aynı DB işleminde; ayrı yayıncı NATS'a taşır |
| Tüketici disiplini | İdempotent tüketici + dedup | Aynı event iki kez görülmeye dayanıklı |
| Dağıtık işlem | **Saga (`pkg/saga`)** | Telafi adımlarıyla; 2PC kullanılmaz |
| Zamanlanmış işler | **robfig/cron + Redis lock** | Her job tek instance'ta |

---

## 14. API Gateway, Ağ Katmanları ve Servisler Arası İletişim

Katmanlı yaklaşım — her protokol en güçlü olduğu yerde:

| Hat | Protokol | Not |
|---|---|---|
| **Kullanıcı ↔ Envoy** | **HTTP/3 (QUIC)** + HTTP/2 fallback | Mobilde bağlantı dayanıklılığı, 0-RTT, head-of-line blocking yok. TLS Envoy'da sonlanır |
| **Envoy ↔ Fiber servisleri** | HTTP/1.1 + mTLS | Fiber'ın HTTP/2 desteklememesi burada önemsiz; mesh mTLS ekler |
| **Servis ↔ servis** | **gRPC (HTTP/2) + mTLS** | grpc-go kendi HTTP/2 stack'i, Fiber'dan bağımsız; deadline context ile yayılır |

- **Kenar:** Envoy v1.39 — tek giriş kapısı: HTTP/3, TLS sonlandırma, kenar rate limit, yönlendirme. (v1.39.0, Temmuz 2026; HTTP/2 ve HTTP/3 tarafında çok sayıda CVE kapatıldı — eski hatta kalmak güvenlik borcudur.)
- **Dış API stili:** REST/JSON; sözleşme **OpenAPI ile yayınlanır** (frontend client'ı bundan üretir).
- **Dış sağlayıcılar:** yalnızca `integration` servisi; circuit breaker + timeout'lu `httpclient` + `tokencache`.

---

## 15. Dayanıklılık Desenleri

| Desen | Uygulama | Ne zaman |
|---|---|---|
| Circuit breaker | `pkg/circuitbreaker` (sony/gobreaker) | Tüm dış sağlayıcı çağrıları |
| Timeout + context | `pkg/httpclient`, gRPC deadline | Her ağ çağrısında; sınırsız bekleme yasak |
| Distributed lock | `pkg/joblock` (Redis) | Çoklu instance'ta tekil job |
| Graceful shutdown | `bootstrap` | In-flight isteği tamamla, sonra kapan |
| Rate limit | Fiber limiter + Envoy kenarı | Hassas uçlarda sıkılaştırılır |
| Retry | Yalnız idempotent uçlarda, backoff | Para mutasyonunda otomatik retry yok (Böl. 17) |
| Bulkhead | Servis/kaynak izolasyonu | Bir sağlayıcının çökmesi diğer akışları boğmaz |

---

## 16. Gözlemlenebilirlik

Tercih: **tam self-host LGTM stack'i** — telemetri üçüncü tarafa akmaz.

| Sinyal | Karar | Sürüm |
|---|---|---|
| Trace | **OpenTelemetry** (`pkg/telemetry`) → **Tempo** | Tempo **2.10** (2.9 desteği Aralık 2026'da bitiyor) |
| Metrik | Prometheus client (`/metrics`) → **Prometheus** | **v3.14** |
| Log | zerolog JSON → **Loki** | **3.7** |
| Panolar + alarm | **Grafana** + Alertmanager | **13.2** |
| Korelasyon | CorrelationID + trace ID log alanı; **W3C traceparent** frontend'den zincirlenir | Tek kimlik |
| Profilleme | **Flight Recorder** (Go 1.26) + pprof | Olay sonrası execution trace |
| Mesh gözlemi | Istio telemetri / Kiali | Servis topolojisi + mTLS durumu |

**Log redaction zorunlu.** Keycloak event'leri denetim izi olarak açıktır.

---

## 17. İşlem Bütünlüğü ve Denetim İzi

| Konu | Karar |
|---|---|
| **Idempotency key** | Her para mutasyonu `Idempotency-Key` tanır (istemci UUID v4 üretir); aynı key = aynı sonuç. Key + sonuç saklanır |
| **Defter seviyesi tekillik** | TigerBeetle transfer ID'leri istemci-üretimi UUID; aynı ID ikinci kez kabul edilmez |
| **Kilitleme** | İlişkisel tarafta yarışta açık `FOR UPDATE`; iyimser kilit yalnız finansal olmayan alanlarda |
| **Outbox + idempotent tüketici** | Event dünyasında exactly-once *etkisi* |
| **Belirsiz durum** | Dış timeout'ta "başarısız" değil; mutabakat karar verene dek "doğrulanıyor" |
| **Değiştirilemez denetim izi** | Her para hareketi kim/ne zaman/hangi kanaldan; **append-only, hash-zincirli** (`pkg/audit`) — silme yok, ters kayıt var. Tamper-evident |

---

## 18. Test Stratejisi

| Katman | Araç | Kural |
|---|---|---|
| Birim | `go test` (tablo-güdümlü) | Para/defter yolunda test edilmemiş satır kabul edilmez |
| Property-based | gopter / `testing/quick` | Yuvarlama/`allocate` için rastgele girdi — kuruş kaybı ispatlanır |
| Sözleşme | buf breaking + üretilmiş tipler | Proto değişince tüketiciler derlemede kırılır |
| Entegrasyon | docker compose ortamına karşı | Postgres/NATS/Redis/TigerBeetle gerçek; mock yalnız dış sağlayıcılar |
| Uçtan uca kimlik | Login akışı scripti | PIN → görsel → OTP → token; her SPI değişikliğinde |
| Concurrency | `go test -race` | Para yolunda zorunlu — yarış durumu yakalanır |
| Yük | Kritik uçlarda benchmark | fasthttp/GC kazanımı ölçülerek korunur |
| Güvenlik | govulncheck + gitleaks + imaj tarama | CI kapısı |

---

## 19. Ortamlar, Sürüm ve Dağıtım

| Konu | Karar |
|---|---|
| Yerel ortam | `make run` → tüm stack docker compose |
| Orkestrasyon | **Kubernetes** — container-aware GOMAXPROCS (Go 1.26), network policy, pod security standards, secret CSI |
| Ortam ayrımı | `local → dev → staging → prod`; her ortamda ayrı realm ve ayrı sırlar |
| Sır yönetimi | **KMS/Vault** — repo'da sır yok; anahtarlar envelope encryption (Böl. 22) |
| Migration | Yalnız migration dosyasıyla; auto-migrate prod'da kapalı |
| Keycloak değişikliği | Realm JSON + SPI jar'ları versiyonlu; bilinçli re-import/Admin API |
| Dağıtım artefaktı | Tek statik binary / distroless container; **imzalı imaj**; anında rollback |
| Yayın stratejisi | Progressive delivery (canary/blue-green) + feature flag kill-switch |
| CI ilkeleri | Frozen bağımlılıklar, sabit Go sürümü, minimum izinli token, SLSA provenance |

---

## 20. Fiber Performans + fasthttp Güvenlik Sertleştirmesi

Fiber kilitli karar; bu bölüm hem hızını sonuna kadar kullanmak hem de fasthttp'nin footgun'larını yapısal olarak kapatmak içindir. **Bu, "Fiber + güvenlik" denklemini çözen bölümdür.**

### Performans (Fiber'ın gücünü kullan)
- Yüksek çekirdekli makinelerde `Prefork` değerlendirilir (global paylaşımlı state yoksa).
- Zero-allocation yol: kritik uçlarda gereksiz `[]byte`↔`string` dönüşümü yok.
- Go 1.26 Green Tea GC + `encoding/json/v2` altta çalışır.
- Bağlantı havuzu, keep-alive ve read/write buffer boyutları yük profiline göre ayarlanır.

### Güvenlik (footgun'ları yapısal kapat)
- **En kritik kural — değer kopyalama:** fasthttp'de `RequestCtx` ve ondan gelen tüm `[]byte`/`string` değerler handler dönünce geçersizleşir. Handler sınırını (goroutine, kanal, cache, struct alanı) geçen her değer **kopyalanır** (`utils.CopyString`). Bu `pkg/fasthttpsafe` + **özel golangci-lint kuralı** ile zorlanır — sessiz veri karışması riskini yapısal olarak kapatır.
- **Goroutine'e ctx taşıma yasağı:** handler içinden başlatılan goroutine `RequestCtx`'e dokunamaz; ihtiyaç duyulan değerler önce kopyalanıp geçilir.
- **DoS sertleştirmesi:** `BodyLimit`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout`, header boyut limiti `bootstrap`'ta zorunlu — slowloris/oversized-body koruması.
- **Streaming sınırı:** fasthttp streaming'i sınırlı; büyük dosya akışları (KYC belgeleri) doğrudan Fiber üzerinden değil, imzalı URL ile object storage'a.
- **HTTP/2 ve HTTP/3 devri:** Fiber'da yok; **Envoy kenarında** açılır (Böl. 14). Fiber sadece HTTP/1.1 kenarında çalışır.

> **Sonuç:** Fiber en hızlı olduğu yerde (REST kenarı) çalışır, zayıf olduğu yerler (HTTP/2/3) Envoy'a, güvenlik footgun'ları lint + yardımcı paketle kapatılır. Böylece hem en performanslı hem en güvenli.

---

## 21. Servis Mesh ve Ağ Güvenliği (zero-trust)

İç ağda bile şifresiz trafik yok. Servis-servis mTLS için karar:

**Istio Ambient mode (1.30 hattı).** Ambient'ta ztunnel her pod için L4 ve mTLS'i hallediyor; ambient mode sidecar'ları kaldırarak Istio'nun eski kaynak-yükü zayıflığını güce çeviriyor ve L7 yeteneklerini gereken yerde tutuyor. Zaten kenarda Envoy kullanıldığı için ekosistem uyumlu.

**Neden Cilium değil (güvenlik nüansı):** Cilium eBPF ile kernel'de çalıştığı için en düşük p99 gecikmeyi veriyor ama tasarım gereği aynı düğüm içi (intra-node) trafiği şifrelemiyor. Cüzdanda "en güvenli" ölçütünde bu bir eksi — mTLS'in her yerde garanti olması gerekir. O yüzden performans biraz geri de olsa **Istio Ambient** güvenlik önceliğinde doğru seçim. (Cilium saf-performans alternatifi olarak notta kalır.)

> **Olgunluk uyarısı:** Ambient **tek küme** senaryosunda üretime hazırdır. Çok kümeli/çok ağlı ambient ise 1.29 itibarıyla hâlâ **Beta**'dır. Bu, açık maddelerden olan felaket kurtarma (bölge kaybı) tasarımını doğrudan bağlar: çok bölgeli mesh planlanıyorsa olgunluk durumu o karardan önce yeniden değerlendirilmelidir.

| Katman | Karar |
|---|---|
| Servis-servis şifreleme | Istio Ambient mTLS (ztunnel), her pod |
| Ağ segmentasyonu | `card` servisi + DB'si ayrı segment (PCI DSS scope daraltma) |
| Network policy | Default-deny; yalnız gereken servis-servis yolları açık |
| Minimum yetki | Her servis yalnız kendi DB'sine ve gerekli sağlayıcılara erişir |
| Pod güvenliği | Non-root, read-only rootfs, seccomp, dropped capabilities |

---

## 22. Kriptografi ve Anahtar Yönetimi

| Konu | Karar |
|---|---|
| Alan şifreleme | AES-256-GCM (`pkg/crypto`) — TCKN, kart no, hassas PII |
| **Anahtar yönetimi** | **KMS + envelope encryption** — veri anahtarları (DEK) master key (KEK) ile şifreli saklanır; ham anahtar diskte/kodda durmaz |
| **Kart verisi (PCI)** | **HSM** — PCI DSS kart verisi anahtarları donanım güvenlik modülünde |
| Anahtar rotasyonu | Otomatik, versiyonlu; eski anahtarla şifreli veri okunabilir, yeni yazımlar yeni anahtarla |
| Parola/PIN | Argon2id (Keycloak) |
| Transport | TLS 1.3 her yerde; mTLS servis içi |
| Rastgelelik | `crypto/rand` — OTP, token, ID entropisi asla `math/rand` değil |
| İleriye dönük | Post-quantum TLS (hybrid) yol haritasında; Envoy/kütüphane desteği olgunlaştıkça |

---

## 23. Performans Bütçeleri (ölçülebilir hedefler)

| Metrik | Hedef | Nerede |
|---|---|---|
| API p99 gecikme (para dışı okuma) | < 50 ms | Prometheus + yük testi |
| Para mutasyonu p99 (core→TigerBeetle) | < 100 ms | uçtan uca trace |
| gRPC iç çağrı p99 | < 10 ms | mesh telemetri |
| Servis soğuk başlangıç | < 2 s | K8s readiness |
| GC pause p99 | < 1 ms | Go runtime metrik (Green Tea) |
| Bellek / servis (idle) | < 64 MB | container metrik |
| Event işleme gecikmesi (outbox→tüketici) | < 1 s | NATS + trace |

**Uygulama:** her serviste benchmark; regresyon CI'da yakalanır. fasthttp/Green Tea kazanımları ölçülerek korunur.

---

## 24. Uyumluluk — Backend Yükümlülükleri

| Alan | Karar |
|---|---|
| **PCI DSS** | Kart verisi tutan `card` servisi kapsam içinde: ağ segmentasyonu, HSM anahtar yönetimi, şifreli saklama, denetim log'u, erişim kontrolü |
| **KVKK** | PII şifreli + maskeli; erişim log'lu; saklama/silme politikaları; veri minimizasyonu |
| **Denetim izi** | Değiştirilemez, hash-zincirli (Böl. 17); düzenleyici sorgulara hazır |
| **AML/fraud** | `fraud` servisi; şüpheli işlem raporlama akışları |
| Mevzuat (TCMB/6493) | Hukuk/uyum ekibiyle; teknik kancalar (raporlama, limit, dondurma) `reporting`/`core`'da |

---

## 25. Frontend ile Sözleşme Sınırı

| Konu | Sözleşme |
|---|---|
| API | OpenAPI spec tek doğruluk kaynağı; frontend client'ı bundan üretir |
| Para | minor-unit tamsayı, JSON'da float yok — `packages/money` ile birebir |
| Idempotency | İstemci UUID v4 `Idempotency-Key` üretir, backend tanır |
| Auth | DPoP çift taraflı; channel claim'i istemciden doğru gelir; passkey opt-in |
| Bildirim | `inapp-token` (HMAC) frontend Inbox'a; `notification-admin` rolü admin panele |
| Trace | W3C traceparent frontend→BFF→Envoy→servis zincirlenir |
| Oturum | Backend oturum listeleme + uzaktan revoke ucu açar (frontend "aktif oturumlar" bekler) |
| KYC | Backend imzalı-URL üreten yükleme ucu açar |
| **`pay` — taksit** | Taksit tablosu ve komisyon **sunucudan** gelir; istemci hesaplamaz (frontend Böl. 31) |
| **`pay` — ret kodları** | Kanonik ret kodu + mesaj anahtarı backend üretir; istemci ham banka kodunu görmez (frontend Böl. 39) |
| **`pay` — `elements` çerçeveleme** | Backend, işyerinin doğrulanmış domainlerinden **istek başına** `frame-ancestors` üretir (frontend Böl. 24) |
| **`pay` — `pay.js` dağıtımı** | Sürümlü statik dağıtım (`/v1/`), en az 24 ay geriye uyum (frontend Böl. 30) |
| **`pay` — checkout durumu** | `checkout` çerezsizdir; işlem durumu sunucudaki işlem kimliğinden sorgulanır (frontend Böl. 38) |
| **`pay` — geliştirici günlüğü** | Son API istek/yanıtları maskeli saklanır, panelde gösterilir (frontend Böl. 33) |
| **`pay` — webhook** | İmza şeması, yeniden deneme takvimi ve olay kimliği sözleşmedir (Böl. 30) |

---

## 26. Kart Kasası ve PCI Kapsam Mimarisi (`vault`)

Frontend Bölüm 35'te rolümüzün değiştiğini yazdık: üye işyeri değil, **hizmet sağlayıcıyız**. Kart verisi bizim sistemimizden geçiyor. Backend'de bunun karşılığı ayrı bir güven bölgesidir.

### Temel ilke

> Tokenizasyon kapsamı **daraltır ama kaldırmaz**. Token üreten sistemin kendisi ve onunla konuşan her bileşen kapsam içindedir. Bu yüzden kasa mümkün olan en küçük yüzey olarak tasarlanır: ne kadar az şey PAN'a dokunursa denetim o kadar ucuzlar.

### `vault` servisinin sınırları

| Kural | Uygulama |
|---|---|
| **Tek PAN sahibi** | Ham PAN yalnızca `vault` içinde bulunur. Başka hiçbir servis PAN görmez, loglamaz, saklamaz |
| **Dışarıya yalnız token çıkar** | Diğer servisler token + son 4 hane + marka + BIN ile çalışır. Bu üçlü PCI kapsamı dışıdır |
| **`pkg/pan` import kısıtı** | `vault` ve `acquiring` dışında bir servis bu paketi import ederse **lint hata verir** — kapsam sızmasının en sessiz yolu budur |
| **Anahtarlar HSM'de** | Kart verisi anahtarları donanım güvenlik modülünde; `pkg/crypto` envelope encryption ile (Böl. 22) |
| **Ayrı ağ segmenti** | `vault` ve veritabanı kendi segmentinde; default-deny, yalnız `acquiring` ve `threeds` erişir |
| **Ayrı düğüm havuzu** | Kubernetes'te ayrı node pool; CDE dışı iş yükleriyle aynı makineyi paylaşmaz |
| **Segmentasyon testi 6 ayda bir** | Hizmet sağlayıcı yükümlülüğü — takvimlenmiş ve kanıtı saklanan periyodik kapı |

### Token modeli

| Konu | Karar |
|---|---|
| Token biçimi | Opak, rastgele, PAN'dan **türetilemez**. Format-preserving tokenization kullanılmaz — kapsamı geri getirir |
| Kapsam | Token **işyeri bazında** anlamlıdır; bir işyerinin token'ı başka işyerinde çözülmez |
| Kart saklama (kullanıcı bazlı) | Kart hamilinin "kartımı hatırla" onayı işyeri bazında; onay kaydı `merchant` tarafında sürümlü tutulur |
| Silme | Token silinebilir; silme denetim izine yazılır (`pkg/audit`), ters kayıt olarak |
| Ağ tokenizasyonu | Kart ağlarının kendi token hizmetleri yol haritasında — kart yenilendiğinde token'ın yaşamaya devam etmesi için |

---

## 27. Kart Kabulü ve Banka Adaptörleri (`acquiring`)

Türkiye'de sanal POS sağlayıcısı olmak, **her bankanın kendi protokolüyle** konuşmak demektir. Garanti kendi yapısını kullanır; İş Bankası, Akbank, Finansbank, Halkbank ve Anadolubank **EST** ailesindedir; diğerleri ayrı. XML/SOAP yapıları, hata kodları ve 3DS akışları birbirini tutmaz.

### Adaptör mimarisi

| Kural | Gerekçe |
|---|---|
| **Adaptör başına izolasyon** | Her banka kendi paketinde, kendi sözleşme testleriyle. Bir bankanın protokol değişikliği diğerlerini kırmaz |
| **Kanonik iç model** | Servisin geri kalanı banka bilmez; `Authorize`, `Capture`, `Void`, `Refund`, `Inquiry` gibi kanonik işlemlerle konuşur |
| **Kanonik ret kodu** | Her adaptör banka kodunu `pkg/declinecode` üzerinden kanonik koda çevirir. **Soft/hard sınıfı burada belirlenir** — frontend'in gördüğü tek gerçek budur |
| **Bilinmeyen kod = hard** | Eşlenmemiş banka kodu varsayılan olarak tekrar denenmez. Frontend Böl. 39'daki "varsayılan denenmez" kuralının kaynağı burasıdır |
| **Sözleşme testi zorunlu** | Her adaptör için banka test ortamına karşı koşan sözleşme testi; banka tarafı değişince CI kırılır |
| **Adaptör başına devre kesici ve kota** | Bir bankanın çökmesi diğer yönlendirmeleri etkilemez (bulkhead) |

### Yönlendirme

| Konu | Karar |
|---|---|
| Yönlendirme girdisi | BIN (banka/marka/kart tipi), işyeri anlaşmaları, taksit talebi, tutar |
| Failover | Birincil POS başarısızsa ikincile geçiş — **yalnız kesin başarısızlıkta**. Belirsiz durumda (timeout) geçiş yapılmaz, sorgulama yapılır |
| Taksit ve komisyon | Tablo işyeri sözleşmesinden hesaplanır ve **sunucudan döner**; istemci hesaplamaz (frontend Böl. 31) |
| BIN verisi | Kendi BIN tablomuz + düzenli güncelleme; sorgu `pay` tarafının en sık çağrılan ucu, agresif cache'lenir |

### Neden `integration` içinde değil

`integration` genel amaçlı dış çağrı geçididir: kırılgan, düşük hacimli, para yolunda olmayan sağlayıcılar için. `acquiring` ise para yolundadır, p99 bütçesine tabidir, durum taşır (provizyon → capture) ve domaine özgü ret semantiği vardır. İkisini birleştirmek `integration`'ın sadeliğini de `acquiring`'in disiplinini de bozar.

---

## 28. 3D Secure Sunucusu (`threeds`)

Frontend Bölüm 32'de istemci tarafını yazdık: gizli method iframe'i, esnek challenge konteyneri, belirsiz dönüşte "başarısız" dememe. Sunucu tarafı karşılıkları:

| Konu | Karar |
|---|---|
| Protokol | **EMV 3DS 2.x**; 3DS1 desteklenmez |
| Akış sahipliği | `threeds` method içeriğini üretir, challenge oturumunu yönetir, sonucu doğrular; `acquiring` yalnız sonucu tüketir |
| Durum makinesi | `başlatıldı → method → doğrulama → (frictionless \| challenge) → sonuç`. Her geçiş kalıcı ve denetlenebilir |
| Zaman aşımı | Kullanıcı banka ekranında SMS bekler; sunucu zaman aşımı istemcininkinden **uzun** olmalı, yoksa başarılı doğrulama başarısız sayılır |
| Sonuç doğrulaması | Dönen imza/CAVV sunucuda doğrulanır. **İstemciden gelen "başarılı" bilgisine asla güvenilmez** |
| Belirsiz dönüş | Kullanıcı sekmeyi kapatırsa akış yarıda kalır; durum `belirsiz` olarak yaşar ve mutabakat karar verir. Otomatik "başarısız" yazılmaz |
| Model desteği | 3D Pay varsayılan; 3D Secure, 3D Host ve Non-Secure desteklenir (frontend Böl. 28) |
| Muafiyet yönetimi | Düşük tutar ve güvenilir işyeri muafiyetleri yapılandırılabilir; kararın gerekçesi işlem kaydına yazılır |

---

## 29. İşyeri API Kimlik Doğrulaması ve Hız Sınırı

Bölüm 7 insanı doğrular. Bu bölüm **makineyi** doğrular: işyerinin sunucusu bizi çağırırken Keycloak akışı işletmez.

### Anahtar modeli

| Konu | Karar |
|---|---|
| Anahtar tipleri | **Yayınlanabilir** (istemci tarafında görünür, yalnız tokenizasyon başlatır) ve **gizli** (sunucudan sunucuya, tam yetki) |
| Mod öneki | `pk_test_` / `sk_test_` / `pk_live_` / `sk_live_` — mod anahtarın kendisinden okunur, ayrıca parametre gerekmez |
| Saklama | Anahtar **hash'li** saklanır; düz metin hâli yalnız üretim anında bir kez gösterilir. Kaybedilirse yenisi üretilir, kurtarılmaz |
| **Kısıtlı anahtarlar** | Kaynak bazında okuma/yazma yetkisi verilebilen anahtarlar. Sızıntı hâlinde zararı sınırlar; entegratörlere önerilen yol |
| Rotasyon | Çakışmalı rotasyon: eski ve yeni anahtar bir süre birlikte geçerli, sonra eski iptal |
| Kullanım izi | Her anahtarın son kullanım zamanı ve çağıran IP aralığı kaydedilir; panelde gösterilir |
| İptal | Anında etkili; cache'lenmiş doğrulama en fazla birkaç saniye yaşar |

### Hız sınırı ve kota

| Katman | Karar |
|---|---|
| **İşyeri bazında kota** | Kenar (Envoy) rate limit'i işyeri kimliğine göre uygulanır; bir işyerinin trafiği diğerini boğmaz |
| Okuma / yazma ayrımı | Ayrı bütçeler; rapor sorgusu ödeme alma kapasitesini yemez |
| Aşım yanıtı | `429` + `Retry-After`; sınır bilgisi yanıt başlığında sürekli görünür ki entegratör kendi tarafında ayarlayabilsin |
| Para yolu ayrıcalığı | Ödeme uçları ayrı ve daha yüksek bütçede; rapor/liste uçları önce kısılır |

---

## 30. Webhook Teslim Altyapısı (`webhook`)

Sanal POS'ta webhook altyapı değil **ürün özelliğidir** — işyerinin sipariş sistemi buna bağlıdır. Frontend Bölüm 33'te panele "olay günlüğü ve yeniden gönderme" ekranı koyduk; arkası burasıdır.

### Teslim sözleşmesi

| Konu | Karar |
|---|---|
| İmza | **HMAC-SHA256**, **ham gövde** üzerinden hesaplanır (yeniden serileştirme imzayı bozar). Zaman damgası imzaya dahil, eski damga reddedilir — replay koruması |
| Karşılaştırma | Sabit zamanlı; dokümanda işyerine de bu şekilde önerilir |
| Sır rotasyonu | Çakışmalı: iki sır bir süre birlikte geçerli, işyeri kesintisiz geçer |
| Olay kimliği | Her olayın kalıcı ve tekil kimliği vardır; işyeri bununla dedup yapar. **Tekrar teslim aynı kimlikle gelir** |
| Teslim garantisi | En az bir kez (at-least-once). İşyerinden idempotent işleme beklenir ve bu dokümante edilir |
| Sıralama | Garanti **edilmez**. Sıralama gerektiren yerde olayın kendi zaman damgası ve durum alanı kullanılır — DLQ devreye girince katı sıralama zaten bozulur, bu bilinçli takastır |

### Dayanıklılık

| Konu | Karar |
|---|---|
| Yeniden deneme | Jitter'lı üstel geri çekilme; artan aralıklarla ve sınırlı toplam süre |
| Devre kesici | Sürekli başarısız olan uç geçici olarak susturulur; işyerine bildirim gider |
| **DLQ** | Tükenen olaylar izlenen bir ölü mektup kuyruğuna düşer — sessizce kaybolmaz |
| Yeniden gönderme | Panelden elle tetiklenebilir; kim tetikledi denetim izine yazılır |
| **Periyodik mutabakat** | Hiç ulaşmamış olayları yakalamak için düzenli karşılaştırma. Webhook tek başına doğruluk kaynağı değildir; işyerine de "API'den doğrula" denir |
| Uç sağlığı | Başarı oranı ve gecikme işyeri panelinde görünür |

> **Güvenlik notu:** Webhook hedef adresi işyeri tarafından girilir — bu bir **SSRF** yüzeyidir. İç ağ adresleri, link-local ve loopback adresleri reddedilir; yalnız genel internete açık HTTPS uçları kabul edilir. Yönlendirme (redirect) takip edilmez.

---

## 31. Test / Canlı Mod İzolasyonu

Frontend Bölüm 33'te modun panelin her ekranında görünmesini ve mod değişiminde tüm verinin tazelenmesini kararlaştırdık. Backend'de bu bir **veri izolasyonu** kararıdır.

| Konu | Karar |
|---|---|
| İzolasyon seviyesi | Mod her kayıtta zorunlu bir alandır ve **her sorguya bağlam üzerinden otomatik eklenir** (`pkg/mode`). Elle filtre yazmaya bırakılmaz |
| Sızma koruması | Mod alanı olmayan sorgu repository katmanında **hata verir**; test verisinin canlı ekrana düşmesi sessiz bir hata olamaz |
| Kimlik | Mod, API anahtarının önekinden okunur; istek gövdesinden veya parametreden **asla** |
| Dış çağrı | Test modunda gerçek banka çağrısı yapılmaz — **banka simülatörü** devreye girer |
| Simülatör | Test kartları belirli ret kodlarını ve 3DS challenge'ını deterministik olarak tetikler; frontend Böl. 34'teki "tıklanabilir test kartları" bu simülatörden beslenir |
| Webhook | Test ve canlı uçlar ayrıdır; test olayı canlı uca gitmez |
| Defter | Test modu **TigerBeetle defterine yazmaz**; ayrı bir sayaç kullanılır. Test işlemi gerçek muhasebe üretmez |
| Veri yaşam süresi | Test verisi sınırlı süre saklanır ve otomatik temizlenir; canlı veri saklama politikasına tabidir |

> **Neden ayrı veritabanı değil:** Mod alanı + zorunlu bağlam, ayrı instance'a göre çok daha ucuz ve şema kayması riski yok. Bedeli, izolasyonun disipline bağlı olması — bu yüzden repository katmanında **yapısal** olarak zorlanır, geliştiricinin hatırlamasına bırakılmaz.

---

## 32. Kurumsal Cüzdan — Backend

Kurumsal cüzdan bireyselin büyük limitlisi değildir. Belirleyici fark: **parayı hazırlayan ile onaylayan farklı kişilerdir.** Bu, backend'de üç yeni yapı getirir — organizasyon modeli, onay zinciri, toplu işlem.

### 32.1 Organizasyon ve üyelik modeli

| Konu | Karar |
|---|---|
| Kimlik altyapısı | **Keycloak Organizations** — ayrı realm açılmaz. Tek realm, organizasyon bazlı üyelik ve roller (Bölüm 7) |
| Üyelik | Bir kullanıcı birden çok organizasyona üye olabilir; rolü **her organizasyonda ayrıdır** |
| Şirket içi yapı | Departman/ekip hiyerarşisi için Organization Groups |
| Yetki kaynağı | Aktif organizasyon ve roller token claim'inden okunur; servis kendi tablosunda ikinci bir yetki kopyası tutmaz |
| Hesap sahipliği | `corporate` servisi organizasyon ↔ cüzdan hesabı eşlemesinin sahibidir; `core` yalnız hesabı bilir |
| **Bağlam zorunluluğu** | Her istek hangi organizasyon adına yapıldığını taşır. Bağlamsız para hareketi isteği **reddedilir** — varsayılan organizasyon yoktur |
| Davet akışı | Keycloak davet mekanizması; kabul edilene kadar üyelik `bekliyor` durumunda, hiçbir yetki vermez |

> **Neden ayrı realm değil:** Realm başına kurumsal müşteri, kullanıcı başına birden çok şirket senaryosunu kırar (aynı kişi iki şirkette yetkili olamaz hâle gelir) ve realm sayısı arttıkça operasyon maliyeti patlar. Organizations tam bu iki sorunu çözmek için var.

### 32.2 Onay zinciri (`approval`)

**Ortak servistir** — kurumsal cüzdan transferi ve işyeri iadesi aynı motoru kullanır; iki kez yazılmaz.

| Konu | Karar |
|---|---|
| Konum | Para hareketinin **önünde** durur, içinde değil. Onay tamamlanmadan `core`'a transfer isteği gitmez — bu yüzden para yolunun p99 bütçesine yük bindirmez |
| Kural modeli | Organizasyon bazlı: tutar eşiği, gereken onay sayısı, hangi rollerin onaylayabileceği, sıralı mı paralel mi |
| **Hazırlayan onaylayamaz** | Sunucuda zorlanır. İstemci tarafındaki devre dışı buton yalnızca UX'tir |
| Bekleyen tutar | Onay beklerken tutar defterde **bloke** edilir (Bölüm 11). Aksi hâlde aynı bakiye iki işleme birden söz verilir |
| Değişiklik onayı bozar | İşlem detayı değişirse toplanmış onaylar geçersiz olur ve baştan başlanır |
| Süre aşımı | Onaylanmayan istek süresi dolunca düşer, bloke serbest kalır |
| Denetim izi | Kim hazırladı, kim onayladı/reddetti, hangi kanaldan, hangi gerekçeyle — `pkg/audit` hash-zincirine yazılır |
| Idempotency | Onay tamamlandığında oluşturulan transfer, hazırlama anında üretilen **aynı idempotency anahtarını** taşır (Bölüm 17) |

### 32.3 Toplu işlem

`corporate` servisinde; maaş, tedarikçi ödemesi, toplu iade.

| Aşama | Karar |
|---|---|
| Alım | Dosya doğrudan servise `POST` edilmez — imzalı URL ile object storage'a yüklenir, servis referansı işler (Bölüm 20 streaming sınırı) |
| Doğrulama | Satır bazında; sonuç **satır numarasıyla** raporlanır. Doğrulama icradan tamamen ayrı bir aşamadır |
| Onay | Toplu işlem tek bir onay birimidir — `approval` zincirine toplam tutar üzerinden girer |
| İcra | Satır başına ayrı transfer, **satır başına ayrı idempotency anahtarı**. Bir satırın başarısızlığı diğerlerini geri almaz |
| Kısmi sonuç | Varsayılan: geçerli satırlar işlenir, hatalılar raporlanır. "Hepsi ya da hiçbiri" davranışı istenirse saga ile telafi (Bölüm 13) |
| İlerleme | Uzun süren iş asenkron; durum ve ilerleme sorgulanabilir, bitince `notification` üzerinden haber verilir |
| Tekrar | Başarısız satırların tekrarı **aynı anahtarlarla** — çift ödeme riski yapısal olarak kapalı |
| Boyut sınırı | Dosya başına satır sınırı yazılı ve zorlanır; aşan dosya alınmaz |

### 32.4 Kurumsal KYB

`onboarding` servisinde, bireysel KYC ile aynı servis içinde ama ayrı akış.

| Konu | Karar |
|---|---|
| Doğrulama | Vergi numarası, ticaret sicil kaydı — mümkün olduğunca resmî kaynaktan doğrulanır, beyana bırakılmaz |
| Belge | Ticaret sicil gazetesi, vergi levhası, imza sirküleri; imzalı URL ile yüklenir, tip ve boyut **sunucuda** doğrulanır |
| **Gerçek faydalanıcı (UBO)** | Şirketin nihai sahiplerinin tespiti — MASAK yükümlülüğü. Her faydalanıcı için ayrı kimlik kaydı; zincir şirket yapılarında tekrarlı çözümleme |
| Yetkili kişi | İmza yetkilisinin kendi bireysel kimlik doğrulaması KYB'nin ön koşuludur |
| Durum makinesi | `başvuru → inceleme → ek belge → onay/ret`. Her geçiş denetim izinde |
| Yenileme | Belgelerin geçerlilik süresi takip edilir; süresi dolan belge için yenileme talebi otomatik açılır |
| Saklama | KYB belgeleri mevzuat süresi boyunca saklanır — silme talebi bu yükümlülüğü geçersiz kılmaz (Bölüm 24) |

> **Uyum notu:** Hangi belgenin zorunlu olduğu, UBO eşiğinin kaç olduğu ve saklama süresi **hukuk/uyum onayı gerektirir**. Bu bölüm teknik yapıyı tanımlar, mevzuat yorumunu değil.

### 32.5 Limit modeli

Kurumsalda limit tek boyutlu değildir:

| Katman | Örnek |
|---|---|
| Organizasyon limiti | Şirketin günlük/aylık toplam transfer tavanı |
| Kullanıcı limiti | Bir yetkilinin tek başına hazırlayabileceği tutar |
| Onay eşiği | Hangi tutarın üzerinde kaç onay gerektiği |
| Kimlik seviyesi limiti | KYB seviyesine bağlı mevzuat tavanı |

**Kural:** Etkili limit bunların **en düşüğüdür** ve hangi katmanın bağladığı kullanıcıya bildirilir. "Limit aşıldı" tek başına yetersiz bir hatadır (frontend Bölüm 39).

---

## Özet Sürüm Tablosu

| Teknoloji | Sürüm / Karar |
|---|---|
| Go | **1.26** (Green Tea GC default, container-aware GOMAXPROCS, encoding/json/v2) |
| HTTP framework | **Fiber v3.3 (fasthttp)** — kilitli; güvenlik sertleştirmesi Böl. 20 |
| gRPC / Protobuf | grpc-go 1.81 + buf (+ mTLS) |
| PostgreSQL | 18 (servis başına ayrı, 12 adet) |
| DB driver | pgx (para yolu) / GORM (CRUD) |
| TigerBeetle (defter) | 0.17.9 (+ replikasyon, yedek, PITR) |
| Redis | 8 |
| NATS JetStream | 3 düğümlü cluster (nats.go 1.52) |
| Keycloak | **26.7.3** (özel SPI + DPoP + Organizations) |
| Novu | self-host (köprü: `notification`) |
| Kenar | **Envoy v1.39** (**HTTP/3 / QUIC** + TLS + mTLS origin) |
| Service mesh | **Istio 1.30 Ambient** (ztunnel mTLS, sidecarless) |
| Orkestrasyon | Kubernetes (pod security, network policy default-deny) |
| Sır/anahtar | KMS/Vault + envelope encryption; **HSM (kart)** |
| Kriptografi | AES-256-GCM, TLS 1.3, Argon2id, crypto/rand |
| OpenTelemetry | Go SDK (doğrulanmadı) → **Tempo 2.10** |
| Prometheus / Loki / Grafana | **v3.14 / 3.7 / 13.2** |
| zerolog / Viper | 1.35 / 1.21 |
| validator | v10.30 (+ tckn, iban, phone_tr, no_xss, sql_safe) |
| JWT | golang-jwt v5 (+ DPoP) |
| Circuit breaker | sony/gobreaker 1.0 |
| Cron / lock | robfig/cron v3 + Redis lock |
| Java (Keycloak SPI) | 21 (Maven) — **Keycloak'ın desteklediği JDK ile sınırlı**; güncel Java LTS'i 25, yükseltme Keycloak destek matrisine bağlı |

### Sürüm doğrulama notu — 5 Eylül 2026

**Doğrulanıp güncellenenler:** Go (1.26 → **1.27.1**), Envoy (1.31 → **1.39**), Prometheus (3.4 → **3.14**), Loki (3.4 → **3.7**), Grafana (12.0 → **13.2**), Tempo (2.8 → **2.10**), Keycloak (26.7 → **26.7.3**), TigerBeetle (0.17 → **0.17.9**), Istio (sürümsüz → **1.30**).

**Doğrulanıp bilinçli olarak korunanlar:** PostgreSQL **18.6** (19 hâlâ beta), Java **21** (Keycloak destek matrisine bağlı — güncel LTS 25 ama Keycloak'ın desteklediği sürüm belirleyici).

**Henüz doğrulanmadı** — kod yazımından önce tek tek kontrol edilmeli: Fiber v3.3, grpc-go 1.81, nats.go 1.52, Redis 8, OpenTelemetry Go SDK, zerolog 1.35, Viper 1.21, validator v10.30, golang-jwt v5, sony/gobreaker 1.0, robfig/cron v3, buf.

> **Kural:** Bu doküman sürüm kaynağı değildir. Kod yazımı başlarken her sürüm kendi kaynağından teyit edilir ve `go.mod`/lockfile doğruluk kaynağı olur. Doküman gerekçeyi taşır, sürüm numarasını değil.

### `pay` (sanal POS) tarafı

| Konu | Karar |
|---|---|
| Servis sayısı | Ortak 8 + cüzdan 5 + `pay` 7 = **20 servis** (fazlandırılmış; `pay` Faz 1'i 5 servis) |
| Kart kasası | `vault` — tek PAN sahibi, ayrı segment ve ayrı node pool, HSM anahtarları |
| Token | Opak ve rastgele; PAN'dan türetilemez, işyeri bazında anlamlı |
| PCI rolü | **Hizmet sağlayıcı** — segmentasyon testi 6 ayda bir (hukuk/uyum onayı gerekli) |
| Kart kabulü | `acquiring` — banka adaptörleri + yönlendirme; kanonik ret kodu `pkg/declinecode` |
| Banka protokolleri | Garanti kendi yapısı; İş/Akbank/Finansbank/Halkbank/Anadolubank **EST** ailesi; her biri ayrı pakette ve sözleşme testli |
| 3DS | `threeds` — EMV 3DS 2.x; 3DS1 yok. Sonuç **sunucuda** doğrulanır |
| İşyeri kimliği | API anahtarı (`pk_`/`sk_`, `test`/`live`), hash'li saklama, kısıtlı anahtar desteği |
| Hız sınırı | İşyeri bazında kota; okuma/yazma ayrı bütçe; para yolu ayrıcalıklı |
| Webhook | HMAC-SHA256 ham gövde + zaman damgası; jitter'lı geri çekilme, DLQ, periyodik mutabakat, SSRF koruması |
| Test/canlı mod | Tek veritabanı + zorunlu mod alanı; repository katmanında yapısal zorlama; banka simülatörü |
| Defter | Tek TigerBeetle defteri; `pay` hesapları ayrı **tip**, ayrı sistem değil |

### Kurumsal cüzdan tarafı

| Konu | Karar |
|---|---|
| Organizasyon modeli | **Keycloak Organizations** — tek realm, çok organizasyon, organizasyona özel roller ve gruplar |
| Onay zinciri | `approval` — **ortak servis**; kurumsal transfer ve işyeri iadesi aynı motoru kullanır |
| Onay konumu | Para hareketinin önünde; onay beklerken tutar defterde bloke |
| Toplu işlem | `corporate` — imzalı URL ile alım, satır bazlı doğrulama, satır başına idempotency anahtarı |
| KYB | `onboarding` içinde ayrı akış; gerçek faydalanıcı (UBO) tespiti dahil — hukuk onayı gerekli |
| Limit | Dört katmanlı (organizasyon / kullanıcı / onay eşiği / kimlik seviyesi); etkili limit en düşüğü |
| Bağlam | Her istek organizasyon bağlamı taşır; bağlamsız para hareketi reddedilir |

> **Not — kapsam:** `pay` servislerinin sürüm ve altyapı seçimleri cüzdanla aynı hattı kullanır (Go 1.26, Fiber v3.3, PostgreSQL 18, NATS, Istio Ambient). Ayrı bir teknoloji hattı açılmaz; farklılık yalnız domain ve güvenlik bölgesi seviyesindedir.
| Tedarik zinciri | govulncheck + osv-scanner + gitleaks + distroless + cosign + SLSA + SBOM |