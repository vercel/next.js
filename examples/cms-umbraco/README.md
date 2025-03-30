# A statically generated blog example using Next.js and Umbraco CMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Umbraco CMS](https://www.umbraco.com/) as the data source.

## Demo

### https://nextjs-umbraco-sample-blog.vercel.app/

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

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-umbraco umbraco-app
```

```bash
yarn create next-app --example cms-umbraco umbraco-app
```

```bash
pnpm create next-app --example cms-umbraco umbraco-app
```

## Configuration

### Step 1. Create an Umbraco project

Use the .NET CLI to create a project locally.

1. Create an empty folder and open a terminal there.
2. If you haven't already, install the Umbraco .NET CLI templates for version 12.0 or above by running: `dotnet new install Umbraco.Templates::13.*`.
3. Create the Umbraco project by running: `dotnet new umbraco`

For more information on the Umbraco .NET CLI templates, visit [this page](https://docs.umbraco.com/umbraco-cms/fundamentals/setup/install/install-umbraco-with-templates).

### Step 2. Install sample data

To avoid having to create the entire blog dataset in hand, we have created a [NuGet package](https://www.nuget.org/packages/Umbraco.Sample.Headless.Blog) with everything you need to get started.

Install the NuGet package with the following command in the terminal window: `dotnet add package Umbraco.Sample.Headless.Blog`.

### Step 3. Configure the Umbraco Delivery API

The Umbraco Delivery API will be the data source for the blog. This API must be enabled explicitly.

Open `appsettings.json` and add the `DeliveryApi` configuration inside `Umbraco::CMS`:

```json
  "Umbraco": {
    "CMS": {
      "DeliveryApi": {
        "Enabled": true,
        "ApiKey": "my-secret-api-key"
      },
      ....
```

_The `ApiKey` configuration is optional, though necessary if you want to use the preview functionality of the blog sample._

### Step 4. Run Umbraco

Start Umbraco with the following command in the terminal window: `dotnet run`.

Follow the installation wizard to complete the Umbraco setup.

Once completed you'll be redirected to the Umbraco backoffice where the blog sample data is already installed.

### Step 5. Publish the sample data

All the sample content is unpublished to begin with. You need to publish all of it to show the blog posts on the blog.

1. Click the _Posts_ item in the Content tree. This item contains all the individual blog posts.
2. In the lower right hand corner of the browser you'll find a green button labelled "Save and publish".
3. Click the little up-arrow next to this button and select "Publish with descendants...".
4. In the dialog, tick "Include unpublished content items" to publish the _Posts_ item and all the blog posts in one go.

Now do the same for the _Authors_ item.

### Step 6. Set up environment variables

Locate `.env.local.example` where you created the `umbraco-app` project. Create a copy of the file and name it `.env.local`. Now edit the file and fill in the blanks.

- `UMBRACO_SERVER_URL`: The base URL of your Umbraco site. Avoid trailing slashes here.
- `UMBRACO_DELIVERY_API_KEY`: The API key you configured in `appsettings.json`. This is only necessary if you want to test Preview Mode.
- `UMBRACO_PREVIEW_SECRET` This can be any random string (but avoid spaces), like `my-preview-secret`. This is used for triggering preview, thus only necessary if you want to test Preview Mode.

The file should end up looking something like this:

```
NODE_TLS_REJECT_UNAUTHORIZED=0
UMBRACO_SERVER_URL = 'https://localhost:12345'
UMBRACO_DELIVERY_API_KEY = 'my-secret-api-key'
UMBRACO_PREVIEW_SECRET = 'my-preview-secret'
```

Notice the `NODE_TLS_REJECT_UNAUTHORIZED=0` setting. When running a .NET website locally, a self-signed SSL certificate is created to allow HTTPS bindings. Node.js does not trust self-signed SSL certificates, so you need to bypass the SSL/TLS certificate verification with this setting. Do not use this workaround in production.

### Step 7. Run Next.js in development mode

In the `umbraco-app` project folder, run:

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 8. Try Preview Mode

If you edit a post in Umbraco without publishing the changes, you won't see these changes at `http://localhost:3000` by default. However, if you enable **Preview Mode**, you'll be able to see the changes ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>
```

- `<secret>` should be the string you entered for `UMBRACO_PREVIEW_SECRET` in `.env.local`.

If you browse to the changed post, you will now see the unpublished changes.

To exit Preview Mode go to this URL:

```
http://localhost:3000/api/exit-preview
```

### Step 9. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Umbraco

Before you can deploy the blog to Vercel, you first need to deploy your Umbraco site to a hosting provider, to make the blog data available for Vercel.

If you use Azure, be sure to read [the guidelines](https://docs.umbraco.com/umbraco-cms/fundamentals/setup/server-setup/azure-web-apps) on deploying Umbraco to Azure.

You can also try this out on [Umbraco Cloud](https://umbraco.com/try-umbraco-cms/).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your Umbraco deployment.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-umbraco&project-name=nextjs-umbraco-blog&repository-name=nextjs-umbraco-blog&env=UMBRACO_SERVER_URL,UMBRACO_DELIVERY_API_KEY,UMBRACO_PREVIEW_SECRET&envDescription=Required%20to%20connect%20the%20app%20with%20Umbraco%20CMS&envLink=https://github.com/vercel/next.js/tree/canary/examples/cms-umbraco%23step-6-set-up-environment-variables)

### Getting to know Umbraco's Content Delivery API

This example utilizes the native Content Delivery API in Umbraco to fetch the blog data headlessly.

The Content Delivery API is a feature-rich API for headless content delivery. However, in an effort to keep the complexity down in this sample, certain features and optimizations have been omitted from the API queries. This results in slight over-fetching, particularly when fetching multiple blog posts.

You can read all about the Content Delivery API [here](https://docs.umbraco.com/umbraco-cms/reference/content-delivery-api).
