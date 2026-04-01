# Next.js + Supabase: `use cache` with Authenticated Queries

This example demonstrates the correct pattern for combining Next.js `"use cache"`
with authenticated database queries via Supabase.

## The Problem

If you cache a server function that fetches user data, two things can go wrong:

1. **Security bypass** — another user gets your cached data
2. **Stale auth** — a logged-out user sees cached authenticated content

## The Solution

Separate the auth boundary from the data boundary:

- **Auth check** — runs every request, never cached
- **Data fetch** — cached, keyed by `userId`, protected by RLS

```
Request → auth check (every time) → cached data fetch (keyed by userId)
```

## Setup

1. Create a Supabase project at [database.new](https://database.new)
2. Enable Row Level Security on your tables
3. Copy `.env.local.example` to `.env.local` and fill in your keys
4. Run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Files

| File | Purpose |
|------|---------|
| `lib/supabase/server.ts` | Server-side Supabase client (reads cookies) |
| `lib/supabase/admin.ts` | Admin client (bypasses RLS — for cached queries) |
| `app/actions/auth.ts` | Auth check — NOT cached |
| `app/actions/data.ts` | Data fetch — cached, keyed by userId |
| `app/dashboard/page.tsx` | Page combining both |

## Security Model

1. `getCurrentUserId()` validates the JWT on every request via `getClaims()` — never cached
2. `userId` becomes part of the cache key — User A cannot get User B's cached data
3. Admin client bypasses RLS but filters explicitly by verified `userId`
4. Alternative pattern using RLS is documented in comments
