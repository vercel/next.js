# ⚡ ️Tigris example app on Next.js - Todo list

A simple todo app built on [Next.js][next-url] and [Tigris](https://docs.tigrisdata.com/)
using [TypeScript client](https://docs.tigrisdata.com/typescript/), deployed on [Vercel][vercel-url].

### Project demo

https://tigris-nextjs-starter-kit.vercel.app/

# ⚙️ Deploying your own

All you need is a [Github](https://github.com), [Vercel][vercel-url] and Tigris
account([sign up for a free account](https://www.tigrisdata.com/nextjs#signup-form)). Now, Hit "Deploy"
and follow instructions to deploy app to your Vercel account

[![Deploy with Vercel](https://vercel.com/button)][deploy-url]

:tada: All done. You should be able to use app on the URL provided by Vercel. Feel free to play around
or do a [code walkthrough](#code-walkthrough) next :tada:

> [Tigris integration](https://vercel.com/integrations/tigris) with Vercel will automatically fetch
> access keys to populate [Environment Variables](.env.local.example) when deploying app.

<details>
<summary>2. Running Next.js server & Tigris dev environment on your local computer</summary>

## 📖 Running Next.js server & Tigris locally

### Prerequisites

1. Tigris installed on your dev computer
   1. For **macOS**: `brew install tigrisdata/tigris/tigris-cli`
   2. Other operating systems: [See installation instructions here](https://docs.tigrisdata.com/cli/installation)
2. Node.js version 16+

### Instructions

1. Clone this repo on your computer

```shell
git clone https://github.com/tigrisdata/tigris-vercel-starter
```

2. Install dependencies

```shell
cd tigris-vercel-starter
npm install
```

3. Start Tigris local development environment

```shell
tigris dev start
```

4. Run the Next.js server

```shell
npm run dev
```

> Note: This step uses a custom dev & build script to initialize Tigris collections for
> the app and requires [ts-node](https://www.npmjs.com/package/ts-node#installation) to be installed.

:tada: All done. You should be able to use app on `localhost:3000` in browser. Feel free to play
around or do a [code walk-through](#code-walkthrough) next :tada:

</details>

# 📖 How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-tigris tigris-next-app
```

```bash
yarn create next-app --example with-tigris tigris-next-app
```

```bash
pnpm create next-app --example with-tigris tigris-next-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

# 👀 Code walkthrough

<details>
<summary> 📂 File structure</summary>

```text
├── package.json
├── lib
│   ├── tigris.ts
├── db
│   └── models
│       └── todoItems.ts
└── pages
    ├── index.tsx
    └── api
        ├── item
        │   ├── [id].ts
        └── items
            ├── index.ts
            └── search.ts
```

</details>

<details>
<summary> 🪢 Tigris schema definition</summary>

[db/models/todoItems.ts](db/models/todoItems.ts) - The to-do list app has a single collection
`todoItems` that stores the to-do items. The Collection gets automatically provisioned by the
[setup script](scripts/setup.ts).

</details>

<details>
<summary> 🌐 Connecting to Tigris</summary>

[lib/tigris.ts](lib/tigris.ts) - Loads the environment variables you specified previously in creating a Vercel project
section and uses them to configure the Tigris client.

</details>

<details>
<summary> ❇️ API routes to access data in Tigris collection</summary>

All the Next.js API routes are defined under `pages/api/`. We have three files exposing endpoints:

#### [`pages/api/items/index.ts`](pages/api/items/index.ts)

- `GET /api/items` to get an array of to-do items as Array<TodoItem>
- `POST /api/items` to add an item to the list

#### [`/pages/api/items/search.ts`](/pages/api/items/search.ts)

- `GET /api/items/search?q=query` to find and return items matching the given query

#### [`pages/api/item/[id].ts`](pages/api/item/[id].ts)

- `GET /api/item/{id}` to fetch an item
- `PUT /api/item/{id}` to update the given item
- `DELETE /api/item/[id]` to delete an item

</details>

# 🚀 Next steps

In a few steps, we learnt how to bootstrap a Next.js app using Tigris and deploy it on Vercel. Feel
free to add more functionalities or customize App for your use-case and learn more about
[Tigris data platform](https://docs.tigrisdata.com/overview/)

<!-- MARKDOWN LINKS & IMAGES -->

[typescript]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[vercel]: https://img.shields.io/badge/vercel-F22F46?style=for-the-badge&logo=vercel&logoColor=white
[vercel-url]: https://vercel.com/
[deploy-url]: https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftigrisdata%2Ftigris-vercel-starter&project-name=todo-list-app-tigris&repo-name=todo-list-webapp-tigris&demo-title=My%20To-do%20list%20webapp&demo-description=A%20To-do%20list%20webapp%20using%20Next.js%20and%20Tigris&integration-ids=oac_Orjx197uMuJobdSaEpVv2Zn8
[next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[next-url]: https://nextjs.org/
