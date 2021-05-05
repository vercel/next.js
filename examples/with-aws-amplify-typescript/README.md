# AWS Amplify and Typescript with NextJS

[![amplifybutton](https://oneclick.amplifyapp.com/button.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/vercel/next.js/tree/canary/examples/with-aws-amplify-typescript)

This example shows how to build a server rendered web application with NextJS and AWS Amplify. We use AWS Amplify to generate code and to manage and consume the AWS cloud resources needed for our app. The NextJS app has dynamic and static routes to demonstrate how to load data on the server based on the incoming request.

Two routes are implemented :

- `/` : A server-rendered route that uses `getServersideProps` to load data from AppSync and renders it on the server (Code in [pages/index.tsx](src/pages/index.tsx))

- `/todo/[id]` : A dynamic route that uses `getStaticPaths`, `getStaticProps` and the id from the provided context to load a single todo from AppSync and render it on the server. (Code in [pages/todo/[id].tsx](src/pages/todo/[id].tsx))

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-aws-amplify-typescript nextjs-aws-amplify-typescript-app
# or
yarn create next-app --example with-aws-amplify-typescript nextjs-aws-amplify-typescript-app
```

### Initialize and deploy the Amplify project

<details>
  <summary>If you've never used amplify before </summary>

#### Install & Configure Amplify

1. [Sign up](https://portal.aws.amazon.com/billing/signup#/start) for an AWS account
2. Install the AWS Amplify cli:

```sh
npm install -g @aws-amplify/cli
```

3. Configure the Amplify cli

```sh
amplify configure
```

[Read More](https://aws-amplify.github.io/docs/cli-toolchain/quickstart?sdk=js)

</details>

#### Initialize Amplify

```bash
$ amplify init

# <Interactive>
? Enter a name for the project <PROJECT_NAME>
? Enter a name for the environment: dev (or whatever you would like to call this env)
? Choose your default editor: <YOUR_EDITOR_OF_CHOICE>
? Choose the type of app that you're building (Use arrow keys)
  android
  ios
❯ javascript
? What javascript framework are you using react
? Source Directory Path:  src
? Distribution Directory Path: build
? Build Command:  npm run build
? Start Command: npm run start
? Do you want to use an AWS profile? Y
? Select the authentication method you want to use: AWS Profile
? Please choose the profile you want to use: <Your profile

# </Interactive>
```

#### Add the API and the Auth

```sh
$ amplify add api
# <Interactive>
? Please select from one of the below mentioned services (Use arrow keys)
❯ GraphQL
  REST
? Provide API name: <API_NAME>
? Choose the default authorization type for the API (Use arrow keys)
❯ API key
  Amazon Cognito User Pool
  IAM
  OpenID Connect
? Enter a description for the API key: <API_DESCRIPTION>
? After how many days from now the API key should expire (1-365): 7
? Do you want to configure advanced settings for the GraphQL API:
  No, I am done.
❯ Yes, I want to make some additional changes.
? Configure additional auth types? y
? Choose the additional authorization types you want to configure for the API
❯(*) Amazon Cognito User Pool
 ( ) IAM
 ( ) OpenID Connect
Do you want to use the default authentication and security configuration? (Use arrow keys)
❯ Default configuration
  Default configuration with Social Provider (Federation)
  Manual configuration
  I want to learn more.
How do you want users to be able to sign in? (Use arrow keys)
  Username
❯ Email
  Phone Number
  Email or Phone Number
  I want to learn more.
Do you want to configure advanced settings? (Use arrow keys)
❯ No, I am done.
  Yes, I want to make some additional changes.
? Enable conflict detection? N
? Do you have an annotated GraphQL schema? N
? Choose a schema template: (Use arrow keys)
❯ Single object with fields (e.g., “Todo” with ID, name, description)
  One-to-many relationship (e.g., “Blogs” with “Posts” and “Comments”)
  Objects with fine-grained access control (e.g., a project management app with owner-based authorization)
? Do you want to edit the schema now? Y
# </Interactive>
```

#### Edit GraphQL Schema

Open [`amplify/backend/api/nextjswithamplifyts/schema.graphql`](amplify/backend/api/nextjswithamplifyts/schema.graphql) and change it to the following:

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
? Do you want to generate code for your newly created GraphQL API? Y
? Choose the code generation language target (Use arrow keys)
  javascript
❯ typescript
  flow
? Enter the file name pattern of graphql queries, mutations and subscriptions (src/graphql/**/*.ts)
? Do you want to generate/update all possible GraphQL operations - queries, mutations and subscriptions (Y/n) Y
? Enter maximum statement depth [increase from default if your schema is deeply nested] (2)
? Enter the file name for the generated code: src\API.ts
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
