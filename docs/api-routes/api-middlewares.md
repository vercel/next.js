# API Middlewares

API routes provide built in middlewares which parse the incoming request (`req`). Those middlewares are:

- `req.cookies` - An object containing the cookies sent by the request. Defaults to `{}`
- `req.query` - An object containing the [query string](https://en.wikipedia.org/wiki/Query_string). Defaults to `{}`
- `req.body` - An object containing the body parsed by `content-type`, or `null` if no body was sent

## Custom config

Every API route can export a `config` object to change the default configs, which are the following:

```js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
```

The `api` object includes all configs available for API routes.

`bodyParser` Enables body parsing, you can disable it if you want to consume it as a `Stream`:

```js
export const config = {
  api: {
    bodyParser: false,
  },
}
```

`bodyParser.sizeLimit` is the maximum size allowed for the parsed body, in any format supported by [bytes](https://github.com/visionmedia/bytes.js), like so:

```js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500kb',
    },
  },
}
```

## Micro support

As an added bonus, you can also use any [Micro](https://github.com/zeit/micro) compatible middleware.

For example, [configuring CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) for your API endpoint can be done leveraging [micro-cors](https://github.com/possibilities/micro-cors).

First, install `micro-cors`:

```bash
npm i micro-cors
# or
yarn add micro-cors
```

Now, let's add `micro-cors` to the API route:

```js
import Cors from 'micro-cors'

const cors = Cors({
  allowMethods: ['GET', 'HEAD'],
})

function handler(req, res) {
  res.json({ message: 'Hello Everyone!' })
}

export default cors(handler)
```
