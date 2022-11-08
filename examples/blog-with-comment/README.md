# Blog with Comment

This project adds commenting functionality
to [Next.js blog application](https://github.com/vercel/next.js/tree/canary/examples/blog)
using Upstash and NextAuth.

The comment box requires Auth0 authentication for users to add new comments. A
user can delete their own comment. Also admin user can delete any comment.

Comments are stored in Serverless Redis ([Upstash](http://upstash.com/)).

### Demo

[https://blog-with-comment.vercel.app/](https://blog-with-comment.vercel.app/)

## `1` Set up project

First, open up your terminal and navigate and run the following:

```bash
npx create-next-app --example blog-with-comment blog-with-comment
```

This will create a new folder in your current directory called **
blog-with-comment**.
Then, you can navigate into the folder, install the dependencies, and launch the
app:

```
cd roadmap && npm i
```

## `2` Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will
be ignored by Git):

```bash
cp .env.local.example .env.local
```

## `3` Set up Upstash Redis

Go to the [Upstash Console](https://console.upstash.com/) and create a new
database

#### Upstash environment

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` find the variables in
the database details page in Upstash Console.

<img src="https://github.com/upstash/next.js/blob/canary/examples/blog-with-comment/public/upstash.png" width="600">

## [`4` Set up user authentication with next-auth](https://github.com/upstash/roadmap#4-set-up-user-authentication-with-next-auth)

## `5` Run Your Project

In the project folder, run

```
next dev
```

## Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket
and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=upstash-roadmap)
.

**Important**: When you import your project on Vercel, make sure to click on **
Environment Variables** and set them to
match your `.env.local` file.
