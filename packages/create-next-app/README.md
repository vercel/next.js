# Create Next App

The easiest way to get started with Next.js is by using `create-next-app`. This simple CLI tool enables you to quickly start building a new Next.js application, with everything set up for you. You can quickly create a new app using the default Next.js template, or choose from one of the <a aria-label="Next.js Starter Templates" href="https://github.com/vercel/next.js/tree/canary/examples">templates available here.</a> 

The following command will start the interactive experience for using `create-next-app`. The interactive experience will walk you through the process of creating the new app, and you can choose from the available templates directly from the command line:

```
npx create-next-app
```

To create a new app in a specified folder, you can start the command with the name of your new application. For example, the following command will create a new Next.js app called `blog-app` in a subdirectory called `blog-app`. 

```
npx create-next-app blog-app
```

## Options

`create-next-app` comes with the following options:

* **-e, --example [name]|[github-url]** You can specify a template to use when creating a new Next.js app. You can specify a name of an example from the [official Next.js repository](https://github.com/vercel/next.js/tree/master/examples), or directly link to the template using this command. Example: `npx create-next-app -e with-passport`. This will then ask for the name of your app, and create a new Next.js app using the [`with-passport`](https://github.com/vercel/next.js/tree/master/examples/with-passport) example.
* **--example-path &lt;path-to-example&gt;** In a rare case, your GitHub URL might contain a branch name with a slash (e.g. bug/fix-1) and the path to the example (e.g. foo/bar). In this case, you must specify the path to the example separately: `--example-path foo/bar`

## Why use Create Next App?

`create-next-app` is the easiest way to get started with Next.js. The CLI tool enables you to create a new Next.js app within minutes. It is officially maintained by the creators of Next.js, and includes a number of benefits:

* **Interactive Experience**: Running `npx create-next-app` (with no arguments) launches an interactive experience that guides you through setting up a project.
* **Zero Dependencies**: Initializing a project is as quick as one second. Create Next App has zero dependencies. 
* **Offline Support**: Create Next App will automatically detect if you're offline and bootstrap your project using your local package cache.
* **Support for Examples**: Create Next App can bootstrap your application using an example from the Next.js examples collection (e.g. `npx create-next-app --example api-routes`).
* **Tested**: The package is part of the Next.js monorepo and tested using the same integration test suite as Next.js itself, ensuring it works as expected with every release.
