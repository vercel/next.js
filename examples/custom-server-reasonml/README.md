# Custom server REASONML

# Install it and run:
```bash
npm install
npm run dev
# or
yarn
yarn dev
```

# Build the app
```bash
yarn next:build
npm run next:build
```

# Run the production app
Run this command after yarn build.
```bash
yarn start
```

# The idea behind this example
ReasonML is an exciting new language and since it can compile directly to JS via bucklescript
that means that we can power our backend server with REASONML and also have the frontend built with 
reasonreact, which is covered in another [example](https://github.com/zeit/next.js/tree/canary/examples/with-reasonml).
This example shows how powerful & helpful it can be to build a next js custom server with a typesafe language.

The example has been built off the `custom-server` example that uses pure `nodejs` to build the custom server.