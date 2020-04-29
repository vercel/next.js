# CMS Strapi

Strapi is the #1 open source headless CMS frontend developers all over the world love. You can easily and quickly manage your content through an API and it's entirely made with Javascript (Node & React).

To make everything a bit easier, we created a [blog starter](https://github.com/strapi/strapi-starter-next-blog) containing a Strapi instance for managing your blog and a Next.js frontend.

## Deploy Your Strapi Instance

To deploy your Strapi instance you'll need:

  - [A Heroku account](https://signup.heroku.com/) for free
  - [A Cloudinary account for saving images](https://cloudinary.com/users/register/free) for free

You'll need a Cloudinary account as Heroku filesystem is not permanent  

Once you have created these accounts you can deploy your instance by clicking this button

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/strapi/strapi-starter-next-blog)

## Deploy Your Next.js Frontend

  - Log in to Vercel by installing Now CLI:

  `npm i -g now`

  - Secure your `API_URL` with Now by running the following command:

  `now secret add api-url <https://your-strapi-instance.herokuapp.com>`

**Note** Your `API_URL` cannot contain a trailing slash

You can deploy your app in two different ways, but both of them work simply by pressing enter when asked for the root directory for your code.

  - Run `now` in your terminal

  - Click on the button below and follow the steps when prompted

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/strapi/strapi-starter-next-blog)
