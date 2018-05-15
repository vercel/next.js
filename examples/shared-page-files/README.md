[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/shared-page-files)
# Example app using shared page files

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example shared-page-files shared-page-files-app
# or
yarn create next-app --example shared-page-files shared-page-files-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/shared-page-files
cd shared-page-files
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

If your organization has standard static files or page components, including `_document.js`, `_app.js`, or `_error.js`, and you'd like to easily share these among multiple apps, you can publish these as a partial app-like format.
  
```
@myorg/shared-app-files
  pages
    _app.js
    _document.js
    _error.js
    privacy.js
  static
    logo.png
```  
  
Now your applications can install this as a dependency, and you can consume the shared files by referencing the directory using the `rootPaths` configuration setting:

```
module.exports = {
  rootPaths: ['.', 'node_modules/@myorg/shared-app-files']
}
```

Files in additional `rootPaths` are merged together, with earlier paths taking priority over later. For example, if the application directory has the following files:

```
app-project
  pages
    _error.js
    index.js
    privacy.js
```

...the end result will function as though you had merged these directories into:

```
app-project
  pages
    _app.js         (shared)
    _document.js    (shared)
    _error.js       (local)
    index.js        (local)
    privacy.js      (shared)
  static
    logo.png        (shared)
```

Due to technical limitations, this example places the shared app files outside of `node_modules`, but in practice that would be the typical way to make these files available.
