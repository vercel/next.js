# A statically generated blog example using Next.js and WordPress

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [WordPress](https://wordpress.org) as the data source.

## Demo

### [https://next-blog-takeshape.now.sh/](https://next-blog-takeshape.now.sh/)

### Related examples

- [Blog Starter](/examples/blog-starter)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-wordpress cms-wordpress-app
# or
yarn create next-app --example cms-wordpress cms-wordpress-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-wordpress
cd cms-wordpress
```

## Configuration

### Step 1. Prepare your WordPress site

First, a WordPress site is required before hand, there are many solutions out there that can create help you with this, like [WP Engine](https://wpengine.com/) and [WordPress.com](https://wordpress.com/).

Once the site is ready, you'll need to install the [WPGraphQL](https://www.wpgraphql.com/) plugin, it will add a GraphQL API to your WordPress site, which we'll use to query the posts from this app. Follow the next steps to install it:

- Download the [WPGraphQL repo](https://github.com/wp-graphql/wp-graphql) as a ZIP archive.
- Inside your WordPress admin, go to **Plugins** and then click on **Add New**

![Add new plugin](./docs/plugins-add-new.png)

- Now click in the **Upload Plugin** button at the top of the page, you should be able to upload the WPGraphQL plugin

![Upload new plugin](./docs/plugins-upload-new.png)

- Once the plugin has been added, make sure to activate it too from either the **Activate Plugin** button after that WordPress shows after adding the plugin, or from the **Plugins** page.

![WPGraphQL installed](./docs/plugin-installed.png)

#### Optional: Add WPGraphiQL

The [WPGraphiQL](https://github.com/wp-graphql/wp-graphiql) plugin gives you access to a GraphQL IDE directly from your WordPress Admin, allowing you to inspect and play around with the GraphQL API.

The process to add WPGraphiQL is the same as the one for WPGraphQL, go to the [WPGraphiQL repo](https://github.com/wp-graphql/wp-graphiql), download it, and install it as a plugin in your WordPress site. Once that's done you should be able to access the GraphiQL page in the admin:

![WPGraphiQL page](./docs/wp-graphiql.png)

### Step 4. Populate Content

Select **Author** and create a new record.

- You just need **1 Author record**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

When you’re done, make sure to click **Enabled** under **Workflow Status**.

Next, select **Post** and create a new record.

- We recommend creating at least **2 Post records**.
- Use dummy data for the text.
- You can write markdown for the **Content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.

When you’re done, make sure to click **Enabled** under **Workflow Status**.

### Step 5. Set up environment variables

From the dropdown next to the project name, click **API Keys**.

Create a new API Key with the **Read** permission.

Next, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY` should be the API token you just copied.
- `NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID` should be the project ID, which is a substring in the project page URL: `https://app.takeshape.io/projects/<project-id>/...`
- `NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode).

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID=...
NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY=...
NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET=...
```

### Step 6. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/zeit/next.js/discussions).

### Step 7. Try preview mode

On TakeShape, create a new post like before. But **DO NOT** click **Enabled** under **Workflow Status**.

Now, if you go to `http://localhost:3000/posts/<slug>` (replace `<slug>`), you won’t see the post. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](/docs/advanced-features/preview-mode.md)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on TakeShape).

You should now be able to see this post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 8. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Now Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/now-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY>` and `<NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_takeshape_api_key <NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY>
now secrets add next_example_cms_takeshape_project_id <NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID>
now secrets add next_example_cms_takeshape_preview_secret <NEXT_EXAMPLE_CMS_TAKESHAPE_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
