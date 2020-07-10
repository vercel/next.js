### Sitemap for Static Next.Js App

This is a static [Next.js](https://nextjs.org/) project which generates a sitemap for all the static paths.
Everytime, you try to start a development server or make a build, you get an updated `sitemap.xml` file in `public` directory.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000/sitemap.xml](http://localhost:3000/sitemap.xml) with your browser to see the sitemap.

**Note**: Everytime you add or remove a page from `pages` directory, you need to restart the server, to update your `pages/sitemap.xml` file.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/import?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
