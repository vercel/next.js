# With Cloud 9 (c9.io)

## Install NVM and set node to the latest version

Cloud 9 environment comes with a preinstalled nvm, but its better to use the latest
version - follow the install instructions from the [NVM GitHub page](https://github.com/creationix/nvm)

Then download nvm package for the latest available node version and set it as default.
For example, if the latest is 10.12.0, use the following commands:

```bash
nvm install 10.12.0
nvm alias default 10.12.0
nvm use node
```

## Create a custom 'server.js' in the project root directory

    // This file doesn't go through babel or webpack transformation.
    // Make sure the syntax and sources this file requires are compatible with the current node version you are running
    // See https://github.com/zeit/next.js/issues/1245 for discussions on Universal Webpack or universal Babel
    const { createServer } = require('http')
    const { parse } = require('url')
    const next = require('next')

    const dev = process.env.NODE_ENV !== 'production'
    const app = next({ dev })
    const handle = app.getRequestHandler()

    app.prepare().then(() => {
      let server = createServer((req, res) => {
        // Be sure to pass `true` as the second argument to `url.parse`.
        // This tells it to parse the query portion of the URL.
        const parsedUrl = parse(req.url, true)
        const { pathname, query } = parsedUrl

        handle(req, res, parsedUrl)
      }).listen(process.env.PORT, process.env.IP || "0.0.0.0", err => {
        if (err) throw err
        let addr = server.address();
        console.log("> Ready on http://", addr.address + ":" + addr.port);
      })
    })

## Change 'package.json' scripts to use that file

    "scripts": {
        "dev": "node server.js",
        "build": "next build",
        "start": "NODE_ENV=production node server.js"
    }

## Use dev preview within the Cloud9 VM IDE

After starting up the server (by using 'Run' button while having server.js open
in the IDE editor or by using "npm run dev" in terminal) you should be able to access web server by
clicking on "Preview" -> "Preview running application" next to 'Run' button in
the top menu in Cloud9 IDE.
