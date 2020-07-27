## Roadmap Voting Application - Example app using Lambda Store

[Lambda Store](https://lambda.store/) is a Serverless Redis cloud service. Redis enables you keep state with low latency and a simple API. With Lambda Store, you can use Redis with just paying what you use thanks to serverless pricing. 

Roadmap Voting application is an example of how you can develop dynamic applications using Lambda Store integrating with Vercel platform. In this application, the frontend, which is implemented with Next.js, fetches the data from Redis (Lambda Store) via Vercel functions.  Following the below steps, you can build your own roadmap voting app like we did for Lambda Store [here](https://roadmap.lambda.store/)


## Step-1: Deploy the application

You can deploy the example application to your [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) account using:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/svenanderson/next.js/tree/canary/examples/with-lambda-store)

## Step-2 Integrate Lambda Store
Your application is running but its backend is not configured. Now we will integrate Lambda Store.

#### Add Integration to Your Vercel Account

Visit Vercel [Lambda Store Integration](https://vercel.com/integrations/lambdastore) page and click the `Add` button.

#### Configure Integration

Integration requires [Developer API Key](howto/developerapi.md) which can be created from the [Lambda Store console](https://console.lambda.store).

Enter the API key and your registered email address in the integration setup page as below:

<img src="https://docs.lambda.store/img/vercel/vercel1.png" width="800" />


#### Integration Dashboard

In next screen, your databases will be automatically listed.

New database can be created from the Vercel Integration page as well as the Lambda Store Console.

<img src="https://docs.lambda.store/img/vercel/vercel2.png" width="800" />

#### Create Database

After clicking `New Database` button then create a database as below:

<img src="https://docs.lambda.store/img/vercel/vercel3.png" width="800" />


#### Connect Database to Your Project

Select your project from the dropdown menu then click `Link To Project` for any database.

`REDIS_URL` will be automatically set as environment variable for your application. 

<img src="https://docs.lambda.store/img/vercel/vercel4.png" width="800" />

<img src="https://docs.lambda.store/img/vercel/vercel5.png" width="800" />

You need to re-deploy your application for the environment variable to be effective. We will do this in the next step.

## Step-3 Customize The Application

To customize the application, clone the code from your github repository that is created in step-1. Then you can modify the code, for example replace `public/logo.png` with your project's own logo. Once you commit and push your changes, Vercel will deploy your application automatically. Now you can test your application, you should be able to add new features.

This application has three functionality:
- Users can add new features. If you want to remove or edit any item, use lambda store console to connect your Redis database via Redis-cli. To find id of any feature item, click the vote button, you will see its id on the url. Using this id you edit the item via `hset <item_id> title "new title"`

- Users can upvote feature items. The backend records the ip-addresses of the voters, so it does not allow multiple votes on the same item from the same IP address.

- Users can enter their email addresses to be notified about the released items. You can get the email addresses using lambda store console to connect your Redis database via Redis-cli. Run `smembers emails` will give you the emails.



