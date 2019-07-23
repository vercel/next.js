# AWS Amplify with NextJS

[![amplifybutton](https://oneclick.amplifyapp.com/button.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/zeit/next.js/tree/canary/examples/with-aws-amplify)

## Setup

### Using `create-next-app`

Execute [`create-next-app`](https://open.segment.com/create-next-app/) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-aws-amplify nextjs-aws-amplify-app
# or
yarn create next-app --example with-aws-amplify nextjs-aws-amplify-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-aws-amplify
cd with-aws-amplify
```

### Initialize and deploy the Amplify project

<details>
  <summary>If you've never used amplify before </summary>
    
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

  
```bash
$ amplify init

? Enter a name for the environment: dev (or whatever you would like to call this env)
? Choose your default editor: <YOUR_EDITOR_OF_CHOICE>
? Do you want to use an AWS profile? Y

$ amplify push

? Are you sure you want to continue? Y
? Do you want to generate code for your newly created GraphQL API? Y

> We already have the GraphQL code generated for this project, so generating it here is not necessary.

```

### Install & Run

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Edit GraphQL Schema

1. Open [`amplify/backend/api/nextjswithawsamplify/schema.graphql`](amplify/backend/api/nextjswithawsamplify/schema.graphql) and change what you need to.
2. Run `amplify push`
3. 👍 

### Use with new Amplify project

Make sure to commit your changes before doing this.

<details>
  <summary>Detailed version</summary>
   
   ```sh
      $ mv amplify/backend/api/nextjswithamplifyts/schema.graphql ./schema.graphql
      $ rm -rf amplify/ src/
      $ amplify init 

      ? Enter a name for the project <MY_PROJECT_NAME>
      ? Enter a name for the environment prod
      ? Choose your default editor: <MY_CODE_EDITOR>
      ? Choose the type of app that you're building javascript
      ? What javascript framework are you using react
      ? Source Directory Path: src
      next export outputs the project to the out directory
      ? Distribution Directory Path: out
      ? Build Command: default
      ? Start Command: default
      ? Do you want to use an AWS profile? (Y/n) Y
      ...
      Your project has been successfully initialized and connected to the cloud!

      $ amplify add api
      ? Please select from one of the below mentioned services
      GraphQL
      ? Provide API name: <MY_API_NAME>
      ? Choose an authorization type for the API (Use arrow keys)
      API key
      ? Do you have an annotated GraphQL schema? (y/N) y
      ? Provide your schema file path: ./schema.graphql

      $ rm ./schema.graphql
      $ amplify push
      ? Are you sure you want to continue? Yes
      ? Do you want to generate code for your newly created GraphQL API Yes
      ? Choose the code generation language target javascript
      ? Enter the file name pattern of graphql queries, mutations and subscriptions src/graphql/**/*.ts
      ? Do you want to generate/update all possible GraphQL operations - queries, mutations and subscriptions Yes
      ? Enter maximum statement depth [increase from default if your schema is deeply nested] 2
      ? Enter the file name for the generated code src/API.ts
   ```
</details>

```sh
mv amplify/backend/api/nextjswithawsamplify/schema.graphql ./schema.graphql
rm -rf amplify/ src/
amplify init 
amplify add api 
rm ./schema.graphql
amplify push
```

## The idea behind the example

This example shows how to build a server rendered web application with NextJS and AWS Amplify.

We use AWS Amplify to generate code and to manage and consume the AWS cloud resources needed for our app.

The NextJS app has dynamic and static routes to demonstrate how to load data on the server based on the incoming request.

Two routes are implemented : 

- `/` : A static route that uses getInitialProps to load data from AppSync and renders it on the server (Code in [pages/index.tsx](/pages/index.tsx))

- `/todo/[id]` : A dynamic route that uses getInitialProps and the id from the provided context to load a single todo from AppSync and render it on the server. (Code in [pages/todo/:[id].tsx](/pages/todo/[id].tsx))


