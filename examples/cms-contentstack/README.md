# A Statically Generated Blog Example Using Next.js and Contentstack

This example shows how to use the powerful features of Next.js [Static Generation](https://nextjs.org/docs/basic-features/pages) and [Contentstack](https://www.sanity.io/), as the data source.

## Demo

### [https://cms-contentstack.vercel.app/](https://cms-contentstack.vercel.app/)

## Deploy on your own

Once you have access to [the required environment variables](#step-4-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-contentstack&env=contentstack_api_key,contentstack_delivery_token,contentstack_environment,contentstack_region,contentstack_management_token,contentstack_preview_secret)

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

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash

npx create-next-app --example cms-contentstack cms-contentstack-app

# or

yarn create next-app --example cms-contentstack cms-contentstack-app
```

## Configuration

### Step 1. Create an account and a stack in Contentstack

First, log in to your Contentstack account, [create an account on Contentstack](https://www.contentstack.com/try-for-free/).

### Step 2. Create a Content Model

Content [modeling](https://www.contentstack.com/docs/developers/how-to-guides/content-modeling/) is about defining the structure of your content at a granular level. It involves:

- Analyzing the requirements - Determining what kind of content you need
- Identifying the structure required - Deciding how it should be structured in Contentstack
- Developing the content type - Defining the required content type and fields

For this example, you need to create two content types named Author and Post. To do that, click on the New Content Type button. In the window that opens, select Content Block and Multiple options. Name the content type as Author and provide an optional description. Once done, click on Create and Add fields.

- Add a file field with the name Picture.

After creating the Author content type, follow the same steps and create another content type named Post, but this time, select the Web Page option instead of Content Block. Also, choose Multiple from the checkbox instead of Single. Then, click on Create and Add fields to create a content type.

Now on the Content Type Builder page, add the following fields to your content type:

- Title - Text field (type single line text)
- Content - Rich text field
- Excerpt - Text field (type Multiline text)
- Cover Image - Media field (type one file)
- Date - Date and time field
- Slug - Text field. (This field contains is same as entry url except / is not used)
- Author - Reference field (type one reference)
- More Posts - Reference for other post entries

### Step 3. Create an Environment and Generate Delivery and Management Tokens

To create an environment, go to the "Settings" gear icon, select Environments, and then click on + New Environment.

Provide a name to your environment, such as development, and a base URL for it if you wish to.

After creating the environment, go to "Settings" and select Tokens. The Delivery Token tab is selected by default, click on + ADD TOKEN.

On the Create New Token page, provide a name to your token and an optional description. Under Scope, select the environment to which this token should be applicable to and then click on Generate Token.

We also need to create a Management token for this example. So click on the Management Token tab on the Token screen and click on + ADD TOKEN.

On the Create New Token screen, provide a name to your token and an optional description. Under Permissions, select the appropriate option and choose whether the token should expire or not. Then, click on Generate Token. Make note of the management token as it becomes visible just once when you create it for security purposes.

### Step 4. Publish Entries

Once we have added the environment, we can now publish the entries on them. Go to the content type and add an entry. After adding the required content, publish it on your desired environment by clicking on the Publish button.

### Step 5. Set up environment variables

Copy the `.env.local.example` file in root directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then, set each variable on `.env.local`:

- `contentstack_api_key` is your Stack API key.
- `contentstack_delivery_token` is the published environment delivery token (avoid spaces).
- `contentstack_environment` the name of your published environment (avoid spaces).
- `contentstack_region` Should be "eu" if you are in the European region and "us" if your app is hosted in the North America region (avoid spaces).
- `contentstack_management_token` should be Management token generated in the previous step.
- `contentstack_preview_secret` should be any string compatible with the browser URL.

Your `.env.local` file should look like this:

```bash
contentstack_api_key=......
contentstack_delivery_token=.....
contentstack_environment=......
contentstack_region=...

contentstack_management_token=......
contentstack_preview_secret=.....
```

### Step 6. Run Next.js in the Development Mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

### Step 7. Try The Preview Mode

To explore preview mode, go to your stack and open the Post content type. Select the entry that you want to edit.

- **Update the title**. For example, you can add `Demo` in the title.

- The state of post will switch to **CHANGED** automatically. **Do not** publish it. By doing this, the post will be in a draft state.

Now on the localhost server, which is created in step 6, change the localhost URL as shown below:

http://localhost:3000/api/preview?secret=contentstack_preview_secret&slug={post.slug}

secret = should be same secret value provided in .env file
slug = would be post entry url without trailing slashes
You will now be able to see the updated title. To exit the preview mode, you can click on **Click here to exit preview mode** at the top of the page.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy your Locally Installed Project

To deploy your locally installed project on Vercel, first push it to GitHub/GitLab/Bitbucket and then [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy Using our Template

Alternatively, you can deploy using our template by clicking on the Deploy button.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/cms-contentstack&env=contentstack_api_key,contentstack_delivery_token,contentstack_environment,contentstack_region,contentstack_custom_host,contentstack_management_token,contentstack_preview_secret)
