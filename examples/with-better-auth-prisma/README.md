
# Next.js with Better Auth & Prisma

This example demonstrates how to use [Better Auth](https://www.better-auth.com) with [Prisma](https://www.prisma.io) and PostgreSQL in a [Next.js App Router](https://nextjs.org) application using Server Actions.

It provides a minimal, production-ready email and password authentication setup.

## Features

- **Better Auth** – Email and password authentication using the Prisma adapter
- **Prisma** – Type-safe database client
- **Server Actions** – Secure server-side form handling
- **App Router** – Modern Next.js routing and rendering
- **TypeScript** – End-to-end type safety

## What This Example Demonstrates

- Configuring Better Auth with Next.js App Router
- Handling authentication with Server Actions
- Persisting users and sessions using Prisma
- Secure environment variable configuration

## Getting Started

### 1. Install dependencies

```bash
npm install
# or
pnpm install
# or
yarn
# or
bun install
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your values:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
BETTER_AUTH_SECRET="your-secure-random-secret"
BETTER_AUTH_URL="http://localhost:3000"
```

Generate a secure secret:

```bash
openssl rand -base64 32
```

### 3. Set up the database

Run Prisma migrations to create the required tables:

```bash
npx prisma migrate dev
```

### 4. Run the development server

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/
  login/          # Login page
  register/       # Registration page
  actions/        # Server Actions for auth
lib/
  auth.ts         # Better Auth configuration
  prisma.ts       # Prisma client instance
prisma/
  schema.prisma   # Database schema
```

## Deploy Your Own

You can deploy this example using [Vercel](https://vercel.com/).

## Notes

- This example intentionally focuses on email and password authentication only.
- OAuth providers and advanced features are omitted to keep the example minimal.
- The setup is suitable for local development and can be extended for production use.

## Learn More

- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Better Auth Documentation](https://www.better-auth.com)
- [Prisma Documentation](https://www.prisma.io/docs)