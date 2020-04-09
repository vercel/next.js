# A statically generated blog example using Next.js and Prismic

This example showcases Next.js's [Static Generation](/docs/basic-features/pages.md) feature using [Prismic](https://prismic.io/) as the data source.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-prismic cms-prismic-app
# or
yarn create next-app --example cms-prismic cms-prismic-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-prismic
cd cms-prismic
```

## Configuration

### Step 1. Create an account and a repository on Prismic

First, [create an account on Prismic](https://prismic.io/).

After creating an account, create a **repository** from the [dashboard](https://prismic.io/dashboard/) and assign to it any name of your liking.

### Step 2. Create an `author` type

From the repository page, create a new **custom type**:

- The name should be `author`.

Next, add these fields (you don't have to modify the settings):

- `name` - **Key Text** field
- `picture` - **Image** field

### Step 3. Create a `post` type

From the repository page, create a new **custom type**:

- The name should be `post`.

Next, add these fields (you don't have to modify the settings unless specified):

- `title` - **Title** field
- `content` - **Rich Text** field
- `excerpt` - **Key Text** field
- `coverimage` - **Image** field
- `date` - **Date** field
- `author` - **Content relationship** field, you may also add `author` to the **Constraint to custom type** option to only accept documents from the `author` type.
- `slug` - **UID** field.

### Step 4. Populate Content

Go to the **Content** page, it's in the menu at the top left, then click on **Create new** and select the **author** type:

- You just need **1 author record**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select **Post** and create a new record.

- We recommend creating at least **2 Post records**.
- Use dummy data for the text.
- You can write markdown for the **content** field.
- For images, you can download them from [Unsplash](https://unsplash.com/).
- Pick the **author** you created earlier.

**Important:** For each post record, you need to click **Publish** after saving. If not, the post will be in the draft state.

### Step 5. Set up environment variables

Follow the instructions in [this post](https://intercom.help/prismicio/en/articles/1036153-generating-an-access-token) to generate a new access token.

Next, copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Then set each variable on `.env`:

- `NEXT_EXAMPLE_CMS_PRISMIC_API_TOKEN` should be the **Permanent access token** you just created
- `NEXT_EXAMPLE_CMS_PRISMIC_REPOSITORY_NAME` is the name of your repository (the one in)
- `NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET` can be any random string (but avoid spaces), like `MY_SECRET` - this is used for [the Preview Mode](/docs/advanced-features/preview-mode.md).

Your `.env` file should look like this:

```bash
NEXT_EXAMPLE_CMS_PRISMIC_API_TOKEN=...
NEXT_EXAMPLE_CMS_PRISMIC_REPOSITORY_NAME=...
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

On DatoCMS, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Draft]` in front of the title.
- Click **Save**, but **DO NOT** click **Publish**. By doing this, the post will be in the draft state.

(If it doesn't become draft, you need to go to the model settings for `Post`, go to **Additional Settings**, and turn on **Enable draft/published system**.)

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](/docs/advanced-features/preview-mode.md)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on DatoCMS).

You should now be able to see the updated title. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 8. Deploy on ZEIT Now

You can deploy this app to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on ZEIT Now, you need to set the environment variables with **Now Secrets** using [Now CLI](https://zeit.co/download) ([Documentation](https://zeit.co/docs/now-cli#commands/secrets)).

Install [Now CLI](https://zeit.co/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN>` and `<NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_datocms_api_token <NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN>
now secrets add next_example_cms_datocms_preview_secret <NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
