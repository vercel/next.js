# Next.js + StepZen

This example showcases how to use Next.js with [StepZen](https://stepzen.com) as your GraphQL data layer.

With this template you get a fully functional fullstack Next.js application and GraphQL API with the following features:

- Serverless GraphQL API
- Performance-optimized and auto-scalable
- Ability to add any data source declaratively

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-stepzen)

Or use the Vercel + StepZen integration:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/stepzen-dev/next.js/tree/canary/with-stepzen&project-name=nextjs-with-stepzen&repository-name=nextjs-with-stepzen&integration-ids=oac_fS5U5f04cXnxV1N90Ws6SFXh)

## Demo

[nextjs-with-stepzen.vercel.app](https://nextjs-with-stepzen.vercel.app)

## How to use

1. First, install StepZen CLI and log in using your StepZen account name and the admin key from dashboard.stepzen.com/account.

```bash
npm i -g stepzen
stepzen login
```

2. Then, create a `.env.local` file to pass your StepZen credentials to the NextJS app:

```bash
echo "STEPZEN_ACCOUNT=$(stepzen whoami --account)" >> .env.local
echo "STEPZEN_API_KEY=$(stepzen whoami --apikey)" >> .env.local
```

3. Finally, install dependencies and start the development server:

```bash
npm i
npm run dev
```

> Running `npm run dev` also executes `stepzen start`, which is the command to deploy your GraphQL API to the StepZen cloud. You can as well run the `stepzen start` command at any point, in a serapate terminal window.

### Start Coding

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app, and [dashboard.stepzen.com](https://dashboard.stepzen.com/explorer) to see your GraphQL API endpoint.

You can edit the GraphQL API by modifying `stepzen/index.graphql` by hand, or use the `stepzen import` CLI command to import additional data sources to your API.

With StepZen, you can declaritively add any data source to your API:

- `@rest`: Fetch data from any REST API
- `@dbquery`: Query any database
- `@graphql`: Query any GraphQL API

See [supported data sources](https://stepzen.com/docs/connecting-backends) for the complete list.

The page auto-updates as you edit JS or CSS files, and the GraphQL auto-updates as you edit GraphQL schema files in `stepzen/` directory.

The GraphiQL component on the home page is only an example to show that your app has a GraphQL API. Feel free to delete this component at any time. You can always use the [StepZen dashboard](https://dashboard.stepzen.com/) to explore your GraphQL endpoints.

## Learn More

To learn more about StepZen, take a look at the following resources:

- [StepZen Documentation](https://stepzen.com/docs) - learn about StepZen features and API.
- [StepZen Blog](https://stepzen.com/blog) - learn about StepZen features and API.
- [StepZen Examples](https://github.com/stepzen-dev/examples) - find more StepZen examples and integrations.
