# A statically generated blog example using Next.js and Agility CMS

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Agility CMS](https://www.agilitycms.com) as the data source.

> `IMPORTANT` - This example uses Agility CMS's [**Page Management**](https://agilitycms.com/resources/posts/page-management-in-agility-cms-vs-other-headless-cmss) features. This means that the CMS ultimately drives what pages are available and what content is on each page. This enables **Editors** to focus on managing their pages, while allowing you, (the **Developer**) to focus on building UI components for the editors to compose their pages.

## Demo
[`LIVE` - https://next-blog-agilitycms.now.sh/ ](https://next-blog-agilitycms.now.sh/)

[ `PREVIEW MODE` - https://next-blog-agilitycms.now.sh/?agilitypreviewkey](https://next-blog-agilitycms.now.sh/?agilitypreviewkey=GzL%2fio1pLkfKc9BR1%2fC1cDQeKjL0AkwrTAJ22q3UEjAcOhyrqZejDkDv4kMlBKqrEuQxsuRyiP%2bUaykDYlJ%2fJg%3d%3d)

### Related examples

- [Agility CMS Sample Starter](https://github.com/agility/agilitycms-next-starter-ssg)
- [Blog Starter](/examples/blog-starter)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)

### How is this Different from Other CMS Examples?
We believe **Editors** should have full control their pages and what content is on each page without getting into code.

This means you'll not only be definining **Content** for your `Posts` and `Authors`, but you'll also be defining UI Components to compose your pages. This site will consist of a single **Page Template** and a collection of **Modules** that represent the UI components you see on the page.

> **NOTE** - `Modules` and `Page Templates` in Agility CMS simply correspond to `React Components` in your website.


## How to use

### Using `create-next-app`
Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example cms-agilitycms cms-agilitycms-app
# or
yarn create next-app --example cms-agilitycms cms-agilitycms-app
```

### Download manually

Download the example:
```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-agilitycms
cd cms-agilitycms
```

## Configuration

### Step 1. Create an account and a project on `Agility CMS`

First, [create an account on Agility CMS](https://agilitycms.com).

After creating an account, select the **Blank (advanced users)** to create an blank Agility CMS instance. 

### Step 2. Create an `Author` Content Definition

From within the Agility CMS Content Manager, navigate to **Settings** > **Content Definitions** and click **New** to create a new **Content Definition**.

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

From within the Agility CMS Content Manager, navigate to **Settings** > **Content Definitions** and click **New** to create a new **Content Definition**.

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

### Step 5. Create a `Dynamic Page List` based on your `Posts` Content Definition

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

### Step 7. Define your `Intro` Module 

Navigate to **Settings** > **Module Definitions** and click **New** to create a new **Module Definition**.

- The *Title* should be `Intro`
- The *Description*should be `Displays an intro message.`

In this case, we are not adding any fields to control the output or behaviour, since the content is actually hard-coded in the template.

Click **Save & Close** to save the definition.

### Step 8. Define your `Hero Post` Module 

Navigate to **Settings** > **Module Definitions** and click **New** to create a new **Module Definition**.

- The *Title* should be `Hero Post`
- The *Description*should be `Displays the latest Post.`

In this case, we are not adding any fields to control the output or behaviour, since the latest post will be used by default and all of the data is associated to the post itself.

Click **Save & Close** to save the definition.

### Step 9. Define your `More Stories` Module

Navigate to **Settings** > **Module Definitions** and click **New**  to create a new **Module Definition**.

- The *Title* should be `More Stories`
- The *Description*should be `Displays a listing of Posts.`

Next, add the following field:

- `Title` - **Text** field

Click **Save & Close** to save the definition.

### Step 10. Define your `Post Details` Module

Navigate to **Settings** > **Module Definitions** and click **New** to create a new **Module Definition**.

- The *Title* should be `Post Details`
- The *Description*should be `Displays the details of a Post.`

In this case, we are not adding any fields to control the output or behaviour, since the data is associated to the post itself.

Click **Save & Close** to save the definition.

### Step 11. Define a `One Column` Page Template

Navigate to **Settings** > **Page Templates** and click **New** to create a new **Page Template**.

- The *Name* should be `One Column Template`
- The *Digital Channel Type* should be `Website`
- Under *Module Zones* click `New (+)`
    - The *Display Name* should be `Main Content Zone`
    - The *Reference Name* should be `MainContentZone` (auto-populated)
    - Click `Save` to apply the `Main Content Zone`

Click **Save & Close** to save the page template.

### Step 12. Add a new Page called `home`

Navigate to **Pages** and click the **New (+)** button in the page tree to create a new **Page**.

- The *Type* should be `Page`
- The *Page Template* should be `One Column Template`
- The *Menu Text* should be `Home` - the *Page Title* and *Page Name* fields will be auto-populated and you can leave these values as is.

Click **Save** to create the `/home` page.

Next, add the `Hero Post` and `More Stories` modules to the `Main Content Zone` of the `home` page.

- Click the **New (+)** button on the `Main Content Zone` and select `Intro` to add the module to the page
- Click **Save & Close** on the module to return back to the page

- Click the **New (+)** button on the `Main Content Zone` and select `Hero Post` to add the module to the page
- Click **Save & Close** on the module to return back to the page

- Click the **New (+)** button on the `Main Content Zone` and select `More Stories` to add the module to the page
    - The *Title* field should be set to `More Stories`
- Click **Save & Close** on the module to return back to the page

**Important:** Click **Publish** on the page in order to publish the page and all of its modules.

### Step 13. Add a new Folder called `posts`

Navigate to **Pages** and click the `Website` channel, then click **New (+)** button in the page tree to create a new **Folder** in the root of the site.

- The *Type* should be `Folder`
- The *Menu Text* should be `Posts` - the *Folder Name* field will be auto-populated to `posts`

Click **Save** to create the `/posts` folder.

**Important:** Click **Publish** on the folder.


### Step 14. Add a new Dynamic Page called `posts-dynamic`

Navigate to **Pages** and select the existing `/posts` folder. Click the **New (+)** button in the page tree to create a new **Dynamic Page** underneath the `posts` page.

- The *Type* should be `Dynamic Page`
- The *Page Template* should be `One Column Template`
- The *Build Pages From* should be `
- The *Sitemap Label* should be `posts-dynamic`
- The *Page Path Formula* should be `##Slug##`
- The *Page Title Formula* shoul be `##Title##`
- The *Menu Text Formula* should be `##Title##`

Click **Save** to create the `/posts/posts-dynamic`dynamic page.

Next, add the `Post Details` module to the `Main Content Zone` of the `posts-dynamic` page.

- Click the **New (+)** button on the `Main Content Zone` and select `Post Details` to add the module to the page
- Click **Save & Close** on the module to return back to the page

**Important:** Click **Publish** on the page in order to publish the page and all of its modules.

### Step 15. Set up environment variables

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

### Step 9. Deploy on ZEIT Now

You can deploy this app to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on ZEIT Now, you need to set the environment variables with **Now Secrets** using [Now CLI](https://zeit.co/download) ([Documentation](https://zeit.co/docs/now-cli#commands/secrets)).

Install [Now CLI](https://zeit.co/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<NEXT_EXAMPLE_CMS_AGILITY_GUID>`, `<NEXT_EXAMPLE_CMS_AGILITY_API_FETCH_KEY>`, `<NEXT_EXAMPLE_CMS_AGILITY_API_PREVIEW_KEY>`, and `<NEXT_EXAMPLE_CMS_AGILITY_SECURITY_KEY>` with the corresponding strings in `.env`.

```
now secrets add next_example_cms_agility_guid <NEXT_EXAMPLE_CMS_AGILITY_GUID>
now secrets add next_example_cms_agility_api_fetch_key <NEXT_EXAMPLE_CMS_AGILITY_API_FETCH_KEY>
now secrets add next_example_cms_agility_api_preview_key <NEXT_EXAMPLE_CMS_AGILITY_API_PREVIEW_KEY>
now secrets add next_example_cms_agility_security_key <NEXT_EXAMPLE_CMS_AGILITY_SECURITY_KEY>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.

### Step 10. Try preview mode

Now that you've deployed your app to ZEIT NOW, take note of the URL of your deployed site. This will be registered in Agility CMS so that when editors click the `Preview` button within Agility CMS, your app is loaded in **Preview Mode**. Learn more about [NextJS Preview Mode](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, you'll need to add your site `https://<your-zeit-now-domain>.now.sh` to your **Domain Configuration** in Agility CMS.

- Go to **Settings** > **Domain Configuration**
- Click on the existing **Channel** called `Website`
- Click on the **+ (New)** button to add a new domain
- For *Name* use `Production`
- For *Domain URL* use `https://<your-zeit-now-domain>.now.sh`
- Check the *Preview Domain* so that it is set to `true`
- Click **Save** to save your settings

Go to one of your `Posts` and **Update the title**. For example, you can add `[Staging]` in front of the title. Click **Save**, but **DO NOT** click **Publish**. By doing this, the post will be in the staging state.

To enter **Preview Mode**, click the `Preview` button on the details of your `Post`. This redirects you to the '/'  homepage, however you will now be in **Preview Mode** so you can navigate to your `Post` you want to view on the website.


You should now be able to see the updated title. To exit the preview mode, you can click **Click here to exit preview mode** at the top.


