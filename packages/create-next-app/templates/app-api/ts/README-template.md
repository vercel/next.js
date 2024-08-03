This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000/api](http://localhost:3000/api) with your browser to see the result.

You can start editing the page by modifying `app/index.ts`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
## API Routes

This directory contains example API routes for the headless API app.

### GET /api/user-info
Returns information about the user based on the request data.
Query Parameters:
- `name`: The name of the user (optional)

Example usage:
```http
GET /api/user-info?name=John

### GET /api/error
Demonstrates a custom error response.

Example usage:
```http
GET /api/error
```
### GET /api/not-found
Demonstrates a 404 Not Found response.

Example usage:
```http
GET /api/not-found
