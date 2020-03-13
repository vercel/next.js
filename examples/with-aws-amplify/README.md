# AWS Amplify with NextJS

[![amplifybutton](https://oneclick.amplifyapp.com/button.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/zeit/next.js/tree/canary/examples/with-aws-amplify)

This example shows how to build a server rendered web application with NextJS and AWS Amplify. We use AWS Amplify to generate code and to manage and consume the AWS cloud resources needed for our app. The NextJS app has dynamic and static routes to demonstrate how to load data on the server based on the incoming request.

Two routes are implemented :

- `/` : A static route that uses getInitialProps to load data from AppSync and renders it on the server (Code in [pages/index.js](/pages/index.js))
- `/todo/[id]` : A dynamic route that uses getInitialProps and the id from the provided context to load a single todo from AppSync and render it on the server. (Code in [pages/todo/:[id].js](/pages/todo/[id].js))

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-aws-amplify nextjs-aws-amplify-app
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
? Distribution Directory Path: out
? Build Command:  (npm run-script build)
? Start Command: (npm run-script start)
? Do you want to use an AWS profile? Y

# </Interactive>
```

#### Add the API

```sh
$ amplify add api
# <Interactive>
? Please select from one of the below mentioned services (Use arrow keys)
❯ GraphQL
  REST
? Provide API name: <API_NAME>
? Choose an authorization type for the API (Use arrow keys)
❯ API key
  Amazon Cognito User Pool
? Do you have an annotated GraphQL schema? (y/N) y
? Provide your schema file path: ./schema.graphql
# </Interactive>
```

#### Deploy infrastructure

```sh
$ amplify push
# <Interactive>
? Are you sure you want to continue? Y
? Do you want to generate code for your newly created GraphQL API? Y
? Choose the code generation language target (Use arrow keys)
❯ javascript
  typescript
  flow
? Enter the file name pattern of graphql queries, mutations and subscriptions (src/graphql/**/*.js)
? Do you want to generate/update all possible GraphQL operations - queries, mutations and subscriptions (Y/n) Y
? Enter maximum statement depth [increase from default if your schema is deeply nested] (2)

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

### Edit GraphQL Schema

1. Open `amplify/backend/api/projectname/schema.graphql` and change what you need to.
2. Run `amplify push`
3. 👍

### Use with new Amplify project

Make sure to commit your changes before doing this.

```sh
mv amplify/backend/api/nextjswithawsamplify/schema.graphql ./schema.graphql
rm -rf amplify/ src/
amplify init
amplify add api
rm ./schema.graphql
amplify push
```
