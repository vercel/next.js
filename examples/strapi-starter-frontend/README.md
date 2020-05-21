# Strapi Blog Starter Frontend

Strapi is the #1 open source headless CMS frontend developers all over the world love. You can easily and quickly manage your content through an API and it's entirely made with Javascript (Node & React).

To make everything a bit easier, we created a [blog starter](https://github.com/strapi/strapi-starter-next-blog) containing a Strapi instance for managing your blog and a Next.js frontend.

## Deploy Your Strapi Instance

To deploy your Strapi instance you'll need:

- [A Heroku account](https://signup.heroku.com/) for free
- [A Cloudinary account for saving images](https://cloudinary.com/users/register/free) for free

You'll need a Cloudinary account as Heroku filesystem is not permanent

Once you have created these accounts you can deploy your instance by clicking this button

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/strapi/strapi-starter-next-blog)

## Test Locally

To run it locally, add `.env.local` file with the following content (replace `<YOUR-HEROKU-APP>`):

```
API_URL="https://<YOUR-HEROKU-APP>.herokuapp.com"
```

Then start the server:

```
npm install
npm run dev
```

## Deploy Your Next.js Frontend

First, import this project into [Vercel](http://vercel.com/) using the Git integration.

Then, set `API_URL` to your Heroku app’s URL from your project’s environment variables settings ([documentation](https://vercel.com/docs/v2/build-step#environment-variables)):

**Note** Your `API_URL` cannot contain a trailing slash.
