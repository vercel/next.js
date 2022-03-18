# Next.js + ButterCMS Starter Project

This Next.js starter project fully integrates with dynamic sample content from your ButterCMS account, including main menu, pages, blog posts, categories, and tags, all with a beautiful, custom theme with already-implemented search functionality. All of the included sample content is automatically created in your account dashboard when you sign up for a free trial of ButterCMS.

## Demo

Check out our live demo: [https://nextjs-starter-buttercms.vercel.app/](https://nextjs-starter-buttercms.vercel.app/)

## Deploy your own

Deploy your Butterized proof-of-concept app to Vercel, the creators of Next.js, and spread your love of Butter. By clicking the button below, you'll create a copy of our starter project in your Git provider account, instantly deploy it, and institute a full content workflow connected to your ButterCMS account. Smooth.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FButterCMS%2Fnextjs-starter-buttercms&env=NEXT_PUBLIC_BUTTER_CMS_API_KEY&envDescription=Your%20ButterCMS%20API%20Token&envLink=https%3A%2F%2Fbuttercms.com%2Fsettings%2F&project-name=nextjs-starter-buttercms&repo-name=nextjs-starter-buttercms&redirect-url=https%3A%2F%2Fbuttercms.com%2Fonboarding%2Fvercel-starter-deploy-callback%2F&production-deploy-hook=Deploy%20Triggered%20from%20ButterCMS&demo-title=ButterCMS%20Next.js%20Starter&demo-description=Fully%20integrated%20with%20your%20ButterCMS%20account&demo-url=https%3A%2F%2Fnextjs-starter-buttercms.vercel.app%2F&demo-image=https://cdn.buttercms.com/r0tGK8xFRti2iRKBJ0eY&repository-name=nextjs-starter-buttercms)

## How to use

### 1) Installation

First, install the dependencies by cloning the repo and running one of the following commands, depending on your current setup:

```bash
git clone https://github.com/ButterCMS/nextjs-starter-buttercms.git
cd nextjs-starter-buttercms
npm install # or yarn install
```

### 2) Set API Token

To fetch your ButterCMS content, add your API token as an environment variable.

```bash
$ echo 'NEXT_PUBLIC_BUTTER_CMS_API_KEY=<Your API Token>' >> .env
```

### 3) Run the local server

To view the app in a browser, you'll need to run the local development server:

```bash
npm run dev # or yarn dev
```

Congratulations! Your starter project is now live: [http://localhost:3000](http://localhost:3000).

## Notes

### Previewing

Your starter project is automatically configured to show draft changes saved in your Butter account when run locally or deployed to a hosting provider. To disable this behavior, set the following value in your .env file: PREVIEW=false.
