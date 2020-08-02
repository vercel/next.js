# A stateful Next.js application using Redis (Lambda Store)

This example showcases how you can develop dynamic applications using Next.js and Redis as data store. The frontend fetches the data from Redis via Vercel functions. [Lambda Store](https://lambda.store/) is used as managed Redis service.

The example is a basic roadmap voting application where users can enter and vote for feature requests.

## Demo

[https://roadmap-voting-demo.vercel.app/](https://roadmap-voting-demo.vercel.app/)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-redis)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-redis roadmap-voting-app
# or
yarn create next-app --example with-redis roadmap-voting-app
```

## Configuration

Your application is running but its backend is not configured. Now we will integrate Lambda Store as data store. If you are planning to deploy to Vercel, you can leverage Vercel-Lambda Store Integration. Otherwise, you can still configure your application via adding environment variable to your Next.js application. We will explain both approaches.

### Configuration (without Vercel)

If you are planning to deploy your application to somewhere other than Vercel, you can still integrate Lambda Store by setting the environment variable. First create an account and a database in [Lambda Store console](https://console.lambda.store/). To connect to Redis, you will need your Redis connection string. You can get the connection string by clicking "Connect" on the Database page within the Lambda Store dashboard as below:
<img src="https://docs.lambda.store/img/vercel/vercel5.png" width="800" />

Create a file `.env.local` in your application directory and copy your connection string as below:
`REDIS_URL="YOUR_REDIS_CONNECTION_STRING"`

Now, you can deploy your application locally or remotely as it is properly configured to access Redis database remotely.

### Configuration (within Vercel)

You can integrate Lambda Store to your Vercel account. The good thing with integration is that once you set up integration, you do not have to visit Lambda Store console anymore. Here the steps for integration and deployment:

#### Step-1 Add Lambda Store Integration to Your Vercel Account

Visit Vercel [Lambda Store Integration](https://vercel.com/integrations/lambdastore) page and click the `Add` button.

#### Step-2 Configure Integration

Integration requires [Developer API Key](howto/developerapi.md) which can be created from the [Lambda Store console](https://console.lambda.store).

Enter the API key and your registered email address in the integration setup page as below:

<img src="https://docs.lambda.store/img/vercel/vercel1.png" width="800" />

#### Step-3 Create Database

In next screen, your databases will be automatically listed.

New database can be created from the Vercel Integration page as well as the Lambda Store Console.

<img src="https://docs.lambda.store/img/vercel/vercel2.png" width="800" />

After clicking `New Database` button then create a database as below:

<img src="https://docs.lambda.store/img/vercel/vercel3.png" width="800" />

#### Step-4 Link Database to Your Project

Select your project from the dropdown menu then click `Link To Project` for any database.

`REDIS_URL` will be automatically set as environment variable for your application.

<img src="https://docs.lambda.store/img/vercel/vercel4.png" width="800" />

<img src="https://docs.lambda.store/img/vercel/vercel5.png" width="800" />

You need to re-deploy your application for the environment variable to be effective. We will do this in the next step.

#### Step-5 Customize and Deploy the Application

To customize the application, clone the code from your github repository (that is either created via Vercel Deploy or npx create-next-app). Then you can modify the code, for example replace `public/logo.png` with your project's own logo. Once you commit and push your changes, Vercel will deploy your application automatically. For more about deployment options see [Vercel Documentation](https://nextjs.org/docs/deployment)).

## Current Functionality

The current application has three functionality:

- Users can add new features. If you want to remove or edit any item, use lambda store console to connect your Redis database via Redis-cli. To find id of any feature item, click the vote button, you will see its id on the url. Using this id you edit the item via `hset <item_id> title "new title"`

- Users can upvote feature items. The backend records the ip-addresses of the voters, so it does not allow multiple votes on the same item from the same IP address.

- Users can enter their email addresses to be notified about the released items. You can get the email addresses using lambda store console to connect your Redis database via Redis-cli. Run `smembers emails` will give you the emails.
