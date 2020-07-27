## Roadmap Voting Application - Example app using Lambda Store

[Lambda Store](https://lambda.store/) is a Serverless Redis cloud service. Redis enables you keep state with low latency and a simple API. With Lambda Store, you can use Redis with just paying what you use thanks to serverless pricing. 

Roadmap Voting application is an example of how you can develop dynamic applications using Lambda Store integrating with Vercel platform. 


## Step-1: Deploy the application

You can deploy the example application to your [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) account using:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/svenanderson/next.js/tree/canary/examples/with-lambda-store)

## Step-2 Integrate Lambda Store
You have a running application but its backend is not configured. Now we will integrate Lambda Store as backend.

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

You can clone the application code from your own github repository that is created in step-1. Then you can modify the code, for example you can replace `public/logo.png` with your project's own logo. Now run `vercel` in the project folder to re-deploy your application. 