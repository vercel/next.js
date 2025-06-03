# A statically generated blog example using Next.js and Enterspeed

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Enterspeed](https://www.enterspeed.com/) as the data source.

## Demo

### [https://next-blog-demo.enterspeed.com/](https://next-blog-demo.enterspeed.com/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-3-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-enterspeed&env=ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Enterspeed&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-enterspeed%23step-5-set-up-environment-variables&demo-title=Next.js%20with%20Enterspeed&demo-description=A%20statically%20generated%20blog%20example%20using%20Next.js%20and%20Enterspeed.)

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
npx create-next-app --example cms-enterspeed enterspeed-app
```

```bash
yarn create next-app --example cms-enterspeed enterspeed-app
```

```bash
pnpm create next-app -- --example cms-enterspeed enterspeed-app
```

## Configuration

### Step 1. Configure your Enterspeed account

First, you need an Enterspeed account site. Go to [Enterspeed.com](https://www.enterspeed.com/) to get started for free.

Once you have created an account, you need to:

- Create a data source
- Create an environment
- Create and configure domains
- Create an environment client

Creating the Environment client will generate an API key, which is the one we will use in our `ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY` environment variable.

### Step 2. Ingest content to Enterspeed

First, you need an Enterspeed account site. Go to [Enterspeed.com](https://www.enterspeed.com/) to get started for free.

Once you have created an account, you need to:
Create a tenant
Create a data source
Create an environment
Create and configure domains
Create an environment client
Creating the Environment client will generate an API key, which is the one we will use in our `ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY` environment variable.

Next, we need to get our content from our current CMS, PIM, etc. into Enterspeed. You can do this by using one of our [integrations](https://docs.enterspeed.com/integrations) or by using our [Ingest API](https://docs.enterspeed.com/api#tag/Ingest).

In the example below we simply make a cURL request to ingest our demo data from this example into Enterspeed.

There are two content types we need to ingest, the `blogPost`-type which is the actual blog post, and a `blog`-type which will work as a collection/parent for the blog posts.

Start by creating the `blog`-type

```bash
curl --location --request POST 'https://api.enterspeed.com/ingest/v2/1' \
--header 'X-Api-Key: [YOUR DATA SOUCE API KEY]' \
--header 'Content-Type: application/json' \
--data-raw '{
  "type": "blog",
  "url": "/blog"
}'
```

Next, ingest the actual blog post

```bash
curl --location --request POST 'https://api.enterspeed.com/ingest/v2/2' \
--header 'X-Api-Key: [YOUR DATA SOUCE API KEY]' \
--header 'Content-Type: application/json' \
--data-raw '{
  "type": "blogPost",
  "url": "/preview-mode-for-static-generation",
  "originParentId": "1",
  "properties": {
      "title": "Preview Mode for Static Generation",
      "featuredImage": "https://res.cloudinary.com/enterspeed/image/upload/v1648804237/Next.js%20-%20Example%20With%20Enterspeed/cover5.webp",
      "date": "2022-04-01T01:07:42",
      "author": {
          "name": "Vercel Team",
          "avatar": {
              "url": "https://res.cloudinary.com/enterspeed/image/upload/v1648804719/Next.js%20-%20Example%20With%20Enterspeed/vercel-avatar.webp"
          }
      },
      "categories": ["Next.js", "Static Generation"],
      "excerpt": "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Praesent elementum facilisis leo vel fringilla est ullamcorper eget. At imperdiet dui accumsan sit amet nulla facilisi morbi tempus.",
      "content": "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Praesent elementum facilisis leo vel fringilla est ullamcorper eget. At imperdiet dui accumsan sit amet nulla facilisi morbi tempus. Praesent elementum facilisis leo vel fringilla. Congue mauris rhoncus aenean vel. Egestas sed tempus urna et pharetra pharetra massa massa ultricies.</p><p>Venenatis cras sed felis eget velit. Consectetur libero id faucibus nisl tincidunt. Gravida in fermentum et sollicitudin ac orci phasellus egestas tellus. Volutpat consequat mauris nunc congue nisi vitae. Id aliquet risus feugiat in ante metus dictum at tempor. Sed blandit libero volutpat sed cras. Sed odio morbi quis commodo odio aenean sed adipiscing. Velit euismod in pellentesque massa placerat. Mi bibendum neque egestas congue quisque egestas diam in arcu. Nisi lacus sed viverra tellus in. Nibh cras pulvinar mattis nunc sed. Luctus accumsan tortor posuere ac ut consequat semper viverra. Fringilla ut morbi tincidunt augue interdum velit euismod.</p><h2>Lorem Ipsum</h2><p>Tristique senectus et netus et malesuada fames ac turpis. Ridiculus mus mauris vitae ultricies leo integer malesuada nunc vel. In mollis nunc sed id semper. Egestas tellus rutrum tellus pellentesque. Phasellus vestibulum lorem sed risus ultricies tristique nulla. Quis blandit turpis cursus in hac habitasse platea dictumst quisque. Eros donec ac odio tempor orci dapibus ultrices. Aliquam sem et tortor consequat id porta nibh. Adipiscing elit duis tristique sollicitudin nibh sit amet commodo nulla. Diam vulputate ut pharetra sit amet. Ut tellus elementum sagittis vitae et leo. Arcu non odio euismod lacinia at quis risus sed vulputate.</p>",
      "tags": ["SSG", "Preview"]
  }
}'
```

### Step 4. Create schemas inside Enterspeed

Now that our content has been ingested into Enterspeed, it's time to create schemas.

Schemas in Enterspeed are used to transform our data into generated views, which we can use in our frontend application.

Go to Schemas inside Enterspeed and create two Schemas: `Blog list` and `Blog post`.

Insert the code below into the specific schema. When you're done, save and deploy your schema, which will generate views based on the content you have ingested.

#### `Blog list` schema

```json
{
  "sourceEntityTypes": ["blog"],
  "route": {
    "handles": ["blogList"]
  },
  "properties": {
    "blogListItems": {
      "type": "array",
      "input": {
        "$lookup": {
          "operator": "equals",
          "sourceEntityProperty": "originParentId",
          "matchValue": "{originId}"
        }
      },
      "items": {
        "type": "object",
        "properties": {
          "url": "{item.url}",
          "title": "{item.properties.title}",
          "featuredImage": "{item.properties.featuredImage}",
          "date": "{item.properties.date}",
          "excerpt": "{item.properties.excerpt}",
          "author": {
            "type": "object",
            "properties": {
              "name": "{item.properties.author.name}",
              "avatar": {
                "type": "object",
                "properties": {
                  "url": "{item.properties.author.avatar.url}"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

#### `Blog post` schema

```json
{
  "sourceEntityTypes": ["blogPost"],
  "route": {
    "url": "{url}"
  },
  "actions": [
    {
      "type": "process",
      "originId": {
        "$exp": "{originParentId}"
      }
    }
  ],
  "properties": {
    "url": "{url}",
    "type": "{type}",
    "title": "{p.title}",
    "featuredImage": "{p.featuredImage}",
    "date": "{p.date}",
    "author": {
      "type": "object",
      "properties": {
        "name": "{p.author.name}",
        "avatar": {
          "type": "object",
          "properties": {
            "url": "{p.author.avatar.url}"
          }
        }
      }
    },
    "categories": {
      "type": "array",
      "input": "{p.categories}",
      "items": {
        "type": "string",
        "value": "{item}"
      }
    },
    "tags": {
      "type": "array",
      "input": "{p.tags}",
      "items": {
        "type": "string",
        "value": "{item}"
      }
    },
    "content": "{p.content}"
  }
}
```

--

### Step 5. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and set `ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY` to be the Environment client API key that you have created inside Enterspeed.

Your `.env.local` file should look like this:

```bash
ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY=

# Only required if you want to enable preview mode
# ENTERSPEED_PREVIEW_ENVIRONMENT_API_KEY=
# ENTERSPEED_PREVIEW_SECRET
```

### Step 6. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 7. Set up Preview Mode (Optional)

**This step is optional.** Most CMS supports preview mode (viewing your content before publishing it). The way we handle this in Enterspeed is by creating another data source where your preview data lives.

You then configure your CMS to send "draft"-content to this data source, alongside published content. We have for instance implemented this in our [Enterspeed Umbraco integration](https://github.com/enterspeedhq/enterspeed-source-umbraco-cms).

Once you have set up your new data source, you need to create a new environment client, which uses this data source.

Afterward, go to your `.env.local`-file and insert your new environment client API key in `ENTERSPEED_PREVIEW_ENVIRONMENT_API_KEY`.

Set `ENTERSPEED_PREVIEW_SECRET` to be any random string (ideally URL friendly).

Your `.env.local` file should look like this:

```bash
ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY=

# Only required if you want to enable preview mode
ENTERSPEED_PREVIEW_ENVIRONMENT_API_KEY=
ENTERSPEED_PREVIEW_SECRET
```

**Important:** Restart your Next.js server to update the environment variables.

### Step 8. Try preview mode

If you go to `http://localhost:3000`, you won’t see your preview data. However, if you enable **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>
```

- `<secret>` should be the string you entered for `ENTERSPEED_PREVIEW_SECRET`.

You should now be able to see this post. To exit Preview Mode go to this URL:

```
http://localhost:3000/api/exit-preview
```

### Step 7. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-enterspeed&env=ENTERSPEED_PRODUCTION_ENVIRONMENT_API_KEY&envDescription=Required%20to%20connect%20the%20app%20with%20Enterspeed&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-enterspeed%23step-5-set-up-environment-variables&demo-title=Next.js%20with%20Enterspeed&demo-description=A%20statically%20generated%20blog%20example%20using%20Next.js%20and%20Enterspeed.)
