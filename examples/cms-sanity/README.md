# A statically generated blog example using Next.js and Sanity

This example showcases Next.js's [Static Generation](/docs/basic-features/pages.md) feature using [Sanity](https://www.sanity.io/) as the data source.

## Demo

### [https://next-blog-sanity.now.sh/](https://next-blog-sanity.now.sh/)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-sanity cms-sanity-app
# or
yarn create next-app --example cms-sanity cms-sanity-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-sanity
cd cms-sanity
```

## Configuration

### Step 1. Create an account and a project on Sanity

First, [create an account on Sanity](https://sanity.io).

After creating an account, install the Sanity cli from npm `npm i -g @sanity/cli`.

### Step 2. Create a new Sanity project

In a separate folder run `sanity init` to initialize a new studio project.

This will be where we manage our data.

When going through the init phase make sure to select **Yes** to the **Use the default dataset configuration** step and select **Clean project with no predefined schemas** for the **Select project template** step.

After initializing, get the `projectId` value from the `sanity.json` file that was generated for the next step.

### Step 3. Set up environment variables

First, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_SANITY_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](/docs/advanced-features/preview-mode.md).
- `SANITY_PROJECT_ID` the `projectId` from the previous step

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_SANITY_PREVIEW_SECRET=...
SANITY_PROJECT_ID=...
```

### Step 4. Copy the schema file

After initializing your Sanity studio project there should be a `schemas` folder.

To get up and running we want to copy the schema file from [`./schemas/schema.js`](./schemas/schema.js) to the studio project to use for creating/editing content.

### Step 5. Populate Content

To add some content go to your Sanity studio project where we added the schema file and run `sanity start`.

After the project has started and you have navigated to the URL given in the terminal, select **Author** and create a new record.

- You just need **1 Author record**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select **Post** and create a new record.

- We recommend creating at least **2 Post records**.
- Use dummy data for the text.
- You can write markdown for the **Content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.

**Important:** For each post record, you need to click **Publish** after saving. If not, the post will be in the draft state.

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

On Sanity, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- As you edit the document it will be saved as a draft, but **DO NOT** click **Publish**. By doing this, the post will be in the draft state.

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](/docs/advanced-features/preview-mode.md)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_SANITY_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on Sanity).

You should now be able to see the updated title. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 8. Deploy on ZEIT Now

You can deploy this app to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on ZEIT Now, you need to set the environment variables with **Now Secrets** using [Now CLI](https://zeit.co/download) ([Documentation](https://zeit.co/docs/now-cli#commands/secrets)).

Install [Now CLI](https://zeit.co/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_SANITY_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_sanity_preview_secret <NEXT_EXAMPLE_CMS_SANITY_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
