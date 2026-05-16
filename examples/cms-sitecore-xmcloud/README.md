# A Next.js Example Using Sitecore JSS and Sitecore XM Cloud

This example connects to a Sitecore XM Cloud site using the Sitecore JavaScript Rendering SDK (JSS) for Next.js and includes example components and configuration for headless SXA (Sitecore Experience Accelerator). For more information on creating and deploying a headless Sitecore solution to XM Cloud please refer to [Vercel's Sitecore XM Cloud Integration Guide](https://vercel.com/docs/integrations/sitecore) or official [Sitecore documentation](https://doc.sitecore.com/xmc/en/developers/xm-cloud/create-an-xm-cloud-project-from-a-starter-template-in-the-xm-cloud-deploy-app.html).

## Demo

### [https://vercel-sitecore-xmcloud-demo.vercel.app](https://vercel-sitecore-xmcloud-demo.vercel.app)

## Deploy your own

Using the Deploy Button below, you'll deploy the Next.js project as well as connect it to your XM Cloud project with the required environment variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-title=Sitecore+XM+Cloud+Next.js+Starter&demo-description=Simple+Next.js+blog+site+that+connects+to+a+Sitecore+XM+Cloud+site+using+the+Sitecore+JavaScript+Rendering+SDK+%28JSS%29.&demo-url=https%3A%2F%2Fvercel-sitecore-xmcloud-demo.vercel.app%2F&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2FJAWlcS27EakxvDFRjmLwD%2F412631142afd83d7b3a926cb7c3e44bd%2FCleanShot_2023-08-25_at_20.09.25_2x.png&project-name=Sitecore+XM+Cloud+Next.js+Starter&repository-name=sitecore-starter&repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-sitecore-xmcloud&from=templates&skippable-integrations=1&env=JSS_APP_NAME%2CSITECORE_API_KEY%2CSITECORE_API_HOST%2CGRAPH_QL_ENDPOINT%2CFETCH_WITH&envDescription=Instructions+on+how+to+get+these+env+vars&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-sitecore-xmcloud%2F.env.example)

- `JSS_APP_NAME`: The name of the JSS app that is configured in XM Cloud.
- `GRAPH_QL_ENDPOINT`: The GraphQL Edge endpoint. This is required for Sitecore Experience Edge.
- `SITECORE_API_KEY`: The Sitecore API key is required to build the app.
- `SITECORE_API_HOST`: The host of the Sitecore API.
- `FETCH_WITH`: The fetch method to the Sitecore API. This can be either `GraphQL` or `REST`.

### Related examples

- [AgilityCMS](/examples/cms-agilitycms)
- [Builder.io](/examples/cms-builder-io)
- [ButterCMS](/examples/cms-buttercms)
- [Contentful](/examples/cms-contentful)
- [Cosmic](/examples/cms-cosmic)
- [DatoCMS](/examples/cms-datocms)
- [DotCMS](/examples/cms-dotcms)
- [Drupal](/examples/cms-drupal)
- [Enterspeed](/examples/cms-enterspeed)
- [Ghost](/examples/cms-ghost)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent.ai](/examples/cms-kontent-ai)
- [MakeSwift](/examples/cms-makeswift)
- [Payload](/examples/cms-payload)
- [Plasmic](/examples/cms-plasmic)
- [Prepr](/examples/cms-prepr)
- [Prismic](/examples/cms-prismic)
- [Sanity](/examples/cms-sanity)
- [Sitecore XM Cloud](/examples/cms-sitecore-xmcloud)
- [Sitefinity](/examples/cms-sitefinity)
- [Storyblok](/examples/cms-storyblok)
- [TakeShape](/examples/cms-takeshape)
- [Tina](/examples/cms-tina)
- [Umbraco](/examples/cms-umbraco)
- [Umbraco heartcore](/examples/cms-umbraco-heartcore)
- [Webiny](/examples/cms-webiny)
- [WordPress](/examples/cms-wordpress)
- [Blog Starter](/examples/blog-starter)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cms-sitecore-xmcloud cms-sitecore-xmcloud-app
```

```bash
yarn create next-app --example cms-sitecore-xmcloud cms-sitecore-xmcloud-app
```

```bash
pnpm create next-app --example cms-sitecore-xmcloud cms-sitecore-xmcloud-app
```

## Configuration

To configure and run this example you can follow our [Sitecore XM Cloud Integration Guide](https://vercel.com/docs/integrations/sitecore)
