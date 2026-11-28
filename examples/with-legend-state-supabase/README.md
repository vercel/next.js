## Legend-State example

A full-stack collaborative solution demonstrating real-time synchronization using Next.js, powered by Legend-State for granular state management and Supabase for backend services. Core capabilities include:

- Real-time bidirectional synchronization: Instant updates with millisecond latency via Supabase Realtime
- Automatic timestamp tracking: Built-in creation and modification time recording
- End-to-end type safety: Strict TypeScript definitions across database models
- Optimized reactivity: Efficient state updates through Legend-State's observable system

---

## Setup

Create `.env.local`

```bash
cp .env.local.example .env.local
```

Link Supabase

```bash
supabase link
```

Apply Database

```bash
supabase db push

```

## Run

Install

```bash
pnpm install
```

Start

```bash
pnpm run dev
```

## Types

Generate `types.ts`

```bash
supabase start
supabase gen types --lang=typescript --local > src/lib/types.ts
```
