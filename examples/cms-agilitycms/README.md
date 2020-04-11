# A statically generated blog example using Next.js and Agility CMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Agility CMS](https://www.agilitycms.com) as the data source.

## Demo

TODO: Update this once deployed
[https://next-blog-datocms.now.sh/](https://next-blog-datocms.now.sh/)

### Related examples

- [Agility CMS Sample Starter](https://github.com/agility/agilitycms-next-starter-ssg)
- [Blog Starter](/examples/blog-starter)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)

## How to use

### Using `create-next-app`
TODO: Update this section...
Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-datocms cms-datocms-app
# or
yarn create next-app --example cms-datocms cms-datocms-app
```

### Download manually

Download the example:
TODO: Update this section...
```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-datocms
cd cms-datocms
```

## Configuration

### Step 1. Create an account and a project on `Agility CMS`

First, [create an account on Agility CMS](https://agilitycms.com).

After creating an account, select the **Blank (advanced users)** to create an blank Agility CMS instance. 

### Step 2. Create an `Author` Content Definition

From within the Agility CMS Content Manager, navigate to **Settings** > **Content Definitions** and click **New**  create a new **Content Definition**.

- The *Title* should be `Author`. This will also pre-populate your *Reference Name* for you.

Next, add these fields via the **Form Builder** tab (you don't have to modify any other settings):

- `Name` - **Text** field
- `Picture` - **Image** field

When you are done, click **Save & Close** to save your `Author` content definition.

### Step 3. Create a `List` based on your `Author` Content Definition

From within the Agility CMS Content Manager, navigate to **Shared Content** and click the **+ (New)** button to create a new `Content List`.

- The *Content Definition* should be set to **Author**.
- the *Display Name* should be set to **Authors**. This will also pre-populate your *Reference Name* for you.

### Step 4. Create a `Post` Content Definiton

From within the Agility CMS Content Manager, navigate to **Settings** > **Content Definitions** and click **New**  create a new **Content Definition**.

- The *Title* should be `Post`.

Next, add these fields (you don't have to modify any other settings):

- `Title` - **Text** field
- `Slug` - **Text** field 
- `Date` - **Date/Time** field
- `AuthorID` - **Number** field (**Hide field from input form**)
- `Author` - **Linked Content** field
    - `Content Definition` - **Author**
    - `Content View` - **Shared Content**
    - `Shared Content` - **Authors**
    - `Render As` - **Dropdown List**
    - `Save Value To Field` - **AuthorID**
- `Excerpt` - **Text** field
- `Content` - **HTML** field 
- `Cover Image` - **Image** field 

When you are done, click **Save & Close** to save your `Author` content definition.

### Step 5. Create a `Dynamic Page List` based on your `Author` Content Definition

From within the Agility CMS Content Manager, navigate to **Shared Content** and click the **+ (New)** button and set the *Type* to `Dynamic Page List`

- The *Content Definition* should be set to **Post**.
- the *Display Name* should be set to **Posts**. This will also pre-populate your *Reference Name* for you.

### Step 6. Populate Content

From with **Shared Content** select the **Authors** list and create a new content item.

- You just need **1 Author content item**.
- Use dummy data for the text.
- For the image, you can download one from [Unsplash](https://unsplash.com/).

Next, select the **Posts** list and create a new content item.

- We recommend creating at least **2 Post content items**.
- Use dummy data for the text.
- You can write markdown for the **Content** field.
- For the images, you can download ones from [Unsplash](https://unsplash.com/).
- Pick the **Author** you created earlier.

**Important:** For each post content item, you need to click `Publish` after saving. If not, the post will be in the `Staging` state.

### Step 7. Set up environment variables

Copy the `.env.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Go to the **Getting Started** section from the menu and select **API Keys**, then click the `Show API Key(s)`.

Then set each variable on `.env`:

- `AGILITY_GUID` is be the **Instance GUID** provided.
- `AGILITY_API_FETCH_KEY` is the **Live API Key** 
- `Agility_API_PREVIEW_KEY` is the **Preview API Key** - this is used when the site is in  [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode) and allows your site to pull the latest content, regardless of whether it is published or not.
- `AGILITY_SECURITY_KEY` is **Security Key** and can be found in **Settings** > **Global Security** - this is used to communicate between the CMS your site to validate [Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode)

Your `.env` file should look like this:

```bash
AGILITY_GUID=...
AGILITY_API_FETCH_KEY=...
AGILITY_API_PREVIEW_KEY=...
AGILITY_SECURITY_KEY=...
```

### Step 8. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/zeit/next.js/discussions).

### Step 9. Try preview mode

In Agility CMS, go to one of the posts you've created and:

- **Update the title**. For example, you can add `[Staging]` in front of the title.
- Click **Save**, but **DO NOT** click **Publish**. By doing this, the post will be in the staging state.

Now, if you go to the post page on localhost, you won't see the updated title. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, you'll need to add your `localhost` to your **Domain Configuration** in Agility CMS.

- Go to **Settings** > **Domain Configuration**
- Click on the existing **Channel** called `Website`
- Click on the **+ (New)** button to add a new domain
- For *Name* use `Local`


TODO: Update this - can't set localhost right now to a `localhost`
- For *Domain URL* use `http://localhost:3000` 
- Check the *Preview Domain* so that it is set to `true`

TODO: Update this section

```
http://localhost:3000/api/preview?secret=<secret>&slug=<slug>
```

- `<secret>` should be the string you entered for `NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET`.
- `<slug>` should be the post's `slug` attribute (you can check on DatoCMS).

You should now be able to see the updated title. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

TODO: Update this section

### Step 10. Deploy on ZEIT Now

You can deploy this app to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on ZEIT Now, you need to set the environment variables with **Now Secrets** using [Now CLI](https://zeit.co/download) ([Documentation](https://zeit.co/docs/now-cli#commands/secrets)).

Install [Now CLI](https://zeit.co/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN>` and `<NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_datocms_api_token <NEXT_EXAMPLE_CMS_DATOCMS_API_TOKEN>
now secrets add next_example_cms_datocms_preview_secret <NEXT_EXAMPLE_CMS_DATOCMS_PREVIEW_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
