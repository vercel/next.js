# Create a Static Blog Site Using Next.js and Contentstack

This example shows how you can create a static blog site by using the powerful features of Next.js [Static Generation](https://nextjs.org/docs/basic-features/pages) and [Contentstack](https://www.sanity.io/) as the data source.

## Demo

### [https://cms-contentstack.vercel.app/](https://cms-contentstack.vercel.app/)

## Deploy on Your Own

Once you have access to [the required environment variables](#step-4-set-up-environment-variables), deploy the sample app by using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-contentstack&env=contentstack_api_key,contentstack_delivery_token,contentstack_environment,contentstack_management_token,contentstack_preview_secret)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Strapi](/examples/cms-strapi)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [GraphCMS](/examples/cms-graphcms)
- [Kontent](/examples/cms-kontent)
- [Blog Starter](/examples/blog-starter)

## Steps for Executing the Example

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash

npx create-next-app --example cms-contentstack cms-contentstack-app

# or

yarn create next-app --example cms-contentstack cms-contentstack-app
```

## Configuration

### Step 1. Create an Account and a Stack in Contentstack

First, log in to your Contentstack account, [create an account on Contentstack](https://www.contentstack.com/try-for-free/).

### Step 2. Create a stack in your Contentstack Organization

Open the command prompt and run the following command to install the Contentstack CLI:

`npm i @contentstack/cli`

Next, log in to your contentstack CLI by using the following command:

`csdx auth:login`

To import the stack, use the following seed command.

```
  $ csdx seed -r "contentstack/stack-next.js-blog-example"
```
### Step 3. Steps to create delivery token
Go to your stack, navigate to the “Settings” gear icon, and select Tokens.
Open the Delivery Tokens tab, and click on the + ADD TOKEN button.
Provide a suitable Name (mandatory) and Description (optional) for the delivery token.
In the Scope section, select the publishing environment for which you want to generate a delivery token.

### Step 4. Set up the environment variables

Copy the `.env.local.example` file from your root directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then, set each variable on `.env.local` as follows:

- `contentstack_api_key` is your Stack API key.
- `contentstack_delivery_token` is the publishing environment delivery token (avoid spaces).
- `contentstack_environment` is the name of your published environment (avoid spaces).
- `contentstack_region` Should be "eu" if you are in the European region and "us" if your app is hosted in the North America region (avoid spaces).
- `contentstack_custom_host` only to be used when setting the custom host for the stack (optional)
- `contentstack_management_token` is the Stack Management token generated in the previous step.
- `contentstack_preview_secret` should be any string compatible with the browser URL.

Your `.env.local` file should look like this:

```bash
contentstack_api_key=......
contentstack_delivery_token=.....
contentstack_environment=......
contentstack_region=...
contentstack_custom_host=.....

contentstack_management_token=......
contentstack_preview_secret=.....
```

### Step 5. Run Next.js in the development mode

```bash
npm install
npm run dev
# or
yarn install
yarn dev
```

### Step 6. Try the preview mode

To explore the preview mode, go to your stack and open the Post content type. Select the entry that you want to edit.

- **Update the title**. For example, you can add `Demo` in the title.

- The status of the post content type will change to **CHANGED** automatically. **Do not** publish it. By doing this, the post will be in the draft state.

Now on the localhost server, which is created in step 6, change the localhost URL as shown below:

http://localhost:3000/api/preview?secret=contentstack_preview_secret&slug={post.slug}

secret = should be the same secret value provided in .env file
slug = would post entry URL without trailing slashes

You will now be able to see the updated title. To exit the preview mode, you can click on **Click here to exit preview mode** at the top of the page.

### Step 7. Deploy on Vercel

You can deploy this sample app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy your Locally Installed Project

To deploy your locally installed project on Vercel, first push it to GitHub/GitLab/Bitbucket and then [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy Using our Template

Alternatively, you can deploy the sample app by using our template. To do this, click on the Deploy button.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-contentstack&env=contentstack_api_key,contentstack_delivery_token,contentstack_environment,contentstack_management_token,contentstack_preview_secret)

