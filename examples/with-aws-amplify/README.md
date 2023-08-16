# AWS Amplify and TypeScript with Next.js

[![amplifybutton](https://oneclick.amplifyapp.com/button.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/vercel/next.js/tree/canary/examples/with-aws-amplify)

This example shows how to build a server rendered web application with NextJS and AWS Amplify. We use AWS Amplify to generate code and to manage and consume the AWS cloud resources needed for our app. The NextJS app has dynamic and static routes to demonstrate how to load data on the server based on the incoming request.

Two routes are implemented :

- `/` : A server-rendered route that uses `getServerSideProps` to load data from AppSync and renders it on the server (Code in [pages/index.tsx](src/pages/index.tsx))

- `/todo/[id]` : A dynamic route that uses `getStaticPaths`, `getStaticProps` and the id from the provided context to load a single todo from AppSync and render it on the server. (Code in [pages/todo/[id].tsx](src/pages/todo/[id].tsx))

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-aws-amplify nextjs-aws-amplify-app
# or
yarn create next-app --example with-aws-amplify nextjs-aws-amplify-app
# or
pnpm create next-app --example with-aws-amplify nextjs-aws-amplify-app
```

### Initialize and deploy the Amplify project

<details>
  <summary>If you've never used amplify before </summary>

#### Install Amplify

1. [Sign up](https://aws.amazon.com/free/) for an AWS account
2. Install the AWS Amplify cli:

```sh
npm install -g @aws-amplify/cli
```

[Read More](https://docs.amplify.aws/cli/)

#### Configure Amplify

1. Configure the Amplify cli

```bash
$ amplify configure

# <Interactive>
Follow these steps to set up access to your AWS account:

Sign in to your AWS administrator account:
https://console.aws.amazon.com/
Press Enter to continue

Specify the AWS Region
? region:  <AWS_REGION>

Specify the username of the new IAM user:
? user name:  <NEW_AWS_IAM_USERNAME>

Complete the user creation using the AWS console
Press Enter to continue

Enter the access key of the newly created user:
? accessKeyId:  <ACCESS_KEY_ID>

? secretAccessKey:  <SECRET_ACCESS_KEY>

This would update/create the AWS Profile in your local machine
? Profile Name:  <LOCAL_PROFILE_NAME>

Successfully set up the new user.
# </Interactive>
```

</details>

#### Initialize Amplify

```bash
$ amplify init

# <Interactive>
? Enter a name for the project <PROJECT_NAME>

Project information
| Name: <PROJECT_NAME>
| Environment: dev
| Default editor: Visual Studio Code
| App type: javascript
| Javascript framework: react
| Source Directory Path: src
| Distribution Directory Path: build
| Build Command: npm run-script build
| Start Command: npm run-script start

? Initialize the project with the above configuration? Yes

Using default provider awscloudformation
? Select the authentication method you want to use: AWS profile

or more information on AWS Profiles, see:
https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html

? Please choose the profile you want to use: <LOCAL_PROFILE_NAME>

Deployment completed.

? Help improve Amplify CLI by sharing non sensitive configurations on failures (y/N): y/N

Deployment bucket fetched.
Initialized provider successfully.
Initialized your environment successfully.

Your project has been successfully initialized and connected to the cloud!
# </Interactive>
```

#### Add the API

```sh
$ amplify add api
# <Interactive>
? Select from one of the below mentioned services: (Use arrow keys)
❯ GraphQL
  REST

? Here is the GraphQL API that we will create. Select a setting to edit or continue
  Name: <PROJECT_NAME>
  Authorization modes: API key (default, expiration time: 7 days from now)
  Conflict detection (required for DataStore): Disabled
❯ Continue


? Choose a schema template: (Use arrow keys)
❯ Single object with fields (e.g., “Todo” with ID, name, description)
  One-to-many relationship (e.g., “Blogs” with “Posts” and “Comments”)
  Blank Schema

GraphQL schema compiled successfully.

? Do you want to edit the schema now? (Y/n): n

Successfully added resource <PROJECT_NAME> locally
# </Interactive>
```

#### Edit GraphQL Schema

Open [`amplify/backend/api/<PROJECT_NAME>/schema.graphql`](amplify/backend/api/<PROJECT_NAME>/schema.graphql) and change it to the following:

```
type Todo
  @model
  @auth(
    rules: [
      { allow: owner } # Allow the creator of a todo to perform Create, Update, Delete operations.
      { allow: public, operations: [read] } # Allow public (guest users without an account) to Read todos.
      { allow: private, operations: [read] } # Allow private (other signed in users) to Read todos.
    ]
  ) {
  id: ID!
  name: String!
  description: String
}

```

#### Deploy infrastructure

```sh
$ amplify push
# <Interactive>
? Are you sure you want to continue? Y
Cognito UserPool configuration
Using service: Cognito, provided by: awscloudformation

 The current configured provider is Amazon Cognito.

? Do you want to use the default authentication and security configuration? (Use arrow keys)
❯ Default configuration
  Default configuration with Social Provider (Federation)
  Manual configuration
  I want to learn more.

Warning: you will not be able to edit these selections.

? How do you want users to be able to sign in?
  Username
❯ Email
  Phone Number
  Email or Phone Number
  I want to learn more.

? Do you want to configure advanced settings?
❯ No, I am done.
  Yes, I want to make some additional changes.

GraphQL schema compiled successfully.

? Do you want to generate code for your newly created GraphQL API: Yes

? Choose the code generation language target:
  javascript
❯ typescript
  flow

? Enter the file name pattern of graphql queries, mutations and subscriptions: (src/graphql/**/*.ts): Enter

? Do you want to generate/update all possible GraphQL operations - queries, mutations and subscriptions: Yes

? Enter maximum statement depth [increase from default if your schema is deeply nested] (2)

? Enter the file name for the generated code (src/API.ts) : Enter

Generated GraphQL operations successfully and saved at src/graphql

Code generated successfully and saved in file src/API.ts
# </Interactive>
```

### Install & Run

```bash
npm install
npm run dev
# or
yarn
yarn dev
```
