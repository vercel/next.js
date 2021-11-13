# Serverless Cloud TypeScript API

This is a scaffolding project for building a TypeScript API on Serverless Cloud! Type `cloud` to enter the cloud shell and connect to your personal development instance. Just play with the code and watch changes sync and deploy in less than a second.

## APIs

There are some sample endpoints defined using the `api` object in `index.js`. More information about APIs can be found [here](https://serverless.com/cloud/docs/apps/api).

## Serverless Data

Serverless Data is super-fast (single-digit miliseconds response time), automatically scalable datastore that is capable of storing simple K/V items, or massive collections of complex objects that can be queried on multiple dimensions, sorted, and paginated. Serveless Data is backed by AWS DynamoDB Global Tables, so you don't need to think about maintenance and capacity planning.

Serverless Data is just there as a part of the runtime, so you don't need to provide credentials, connection strings, or additional SDKs. All you need to do is to write code to get, set, or remove data. Serverless Data makes API calls in order to set and retrieve data, so any route/function that calls a Serverless Data method must use `async/await`. There's already a data in your sample application seeded from `data.json` file in this directory.

You can import and export data to/from your personal development instance by typing `import` and `export` while you're in Cloud Shell, or when you're in a project directory, you can type `cloud import` or `cloud export` without starting the Cloud Shell.

More information about Serverless Data can be found [here](https://serverless.com/cloud/docs/apps/data).

## Schedules

Serverless Cloud lets you create scheduled tasks using either `.every()` or `.cron()` methods. This allows you to build and schedule automated tasks like batch processing, ETLs, etc.

More information about Schedules can be found [here](https://serverless.com/cloud/docs/apps/schedule).

## Testing

Serverless Cloud has built-in support for automated unit and integration testing. By convention, tests should be contained within your project's `tests` folder. You can write tests based on the [Jest testing framework](https://jestjs.io/){:target="\_blank"}.
Just type `test` when you're in Cloud Shell to run tests directly on your personal instance, or type `cloud test` from your terminal to run the tests in an isolated test instance.

More information about testing can be found [here](https://www.serverless.com/cloud/docs/workflows/testing).

## Static Websites and Assets

Serverless Cloud allows you to serve files from your application URL. This is useful for serving static assets such as images, CSS, and JavaScript, allowing you to host front-end apps and websites. By convention, static assets must be stored in the static directory at the root of your application.

More information about static assets can be found [here](https://www.serverless.com/cloud/docs/apps/static-assets).

## CLI and Cloud Shell

Serverless Cloud provides a seamless CLI experience to manage the app you built on Serverless Cloud. Type `cloud` when you are in the root directory of a Serverless Cloud project to open the cloud shell. When in the cloud shell, any changes to your local code will be automatically synced and deployed to your personal development instance. Type `help` from Cloud Shell or `cloud help` from your terminal to see all the available commands.

More information about the CLI can be found [here](https://serverless.com/cloud/docs/cli).

## Development Workflows

Serverless Cloud provides you with an isolated personal development environment that's only accessible to you. When you need to share your work for others to review, or you want to deploy your application for all the world to see, here are some handy CLI commands:

- Type `share` from Cloud Shell when you need to share a preview copy that contains both **code and data** with your colleagues. This allows you to continue working in your personal development environment without affecting the preview version.
- Type `deploy <stage>` when you need to deploy your code to a permanent stage and make it accessible to the world or for final review. You can have multiple stages like `dev`, `qa-test`, and `prod`, all of which can be tied to a [CI/CD process](https://www.serverless.com/cloud/docs/workflows/cicd).
- Type `clone <instance>` when you need to copy both code and data from another instance to your personal development instance. This allows you to quickly copy other's work to debug code, make changes, or just sync to the latest version.

More information about development workflows can be found [here](https://serverless.com/cloud/docs/workflows).

## Feedback

Please log any [issues](https://github.com/serverless/cloud/issues) and send additional feedback to cloud@serverless.com.
