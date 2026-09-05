# suiss

Tek monorepo içinde iki ürün:

- **`wallet`** — bireysel ve kurumsal e-para cüzdanı
- **`pay`** — üye işyerine kart kabulü sağlayan sanal POS

Teknoloji kararları ve gerekçeleri [`frontend.md`](./frontend.md) ve [`backend.md`](./backend.md) dosyalarında.

## Yapı

```
apps/
  web/        Next.js 16 — cüzdan paneli (App Router + BFF)
  admin/      Vite + React + TanStack Router — yönetim paneli
packages/
  ui/         shadcn/ui + Radix + Tailwind v4 (web-only)
  config/     paylaşımlı tsconfig ayarları
```

## Gereksinimler

- Node.js 24 LTS
- pnpm 10

`engines` zorunlu tutuluyor (`engine-strict=true`); uyumsuz sürümde kurulum başlamaz.

## Komutlar

```bash
pnpm install

pnpm dev          # tüm uygulamalar (turbo)
pnpm build
pnpm typecheck

pnpm lint         # biome check
pnpm check        # biome check --write
pnpm format       # biome format --write
```

Tek bir uygulamayı çalıştırmak için:

```bash
pnpm --filter web dev
pnpm --filter admin dev
```

## Araçlar

Lint ve biçimlendirme tek araçla yapılır: **Biome**. ESLint ve Prettier kullanılmaz.
Bileşen eklemek için:

```bash
pnpm dlx shadcn@latest add <bileşen> -c apps/web
```

Bileşenler `packages/ui/src/components` altına yerleşir.
