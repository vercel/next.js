'use strict'

const Env = use('Env')

module.exports = {
  /*
  |--------------------------------------------------------------------------
  | App Key
  |--------------------------------------------------------------------------
  |
  | App key is a randomly generated 16 or 32 characters long string required
  | to encrypted cookies, sessions and other sensitive data.
  |
  */
  appKey: Env.get('APP_KEY'),

  http: {
    /*
    |--------------------------------------------------------------------------
    | Allow Method Spoofing
    |--------------------------------------------------------------------------
    |
    | Method spoofing allows to make requests by spoofing the http verb.
    | Which means you can make a GET request but instruct the server to
    | treat as a POST or PUT request. If you want this feature, set the
    | below value to true.
    |
    */
    allowMethodSpoofing: true,

    /*
    |--------------------------------------------------------------------------
    | Trust Proxy
    |--------------------------------------------------------------------------
    |
    | Trust proxy defines whether X-Forwaded-* headers should be trusted or not.
    | When your application is behind a proxy server like nginx, these values
    | are set automatically and should be trusted. Apart from setting it
    | to true or false Adonis supports handful or ways to allow proxy
    | values. Read documentation for that.
    |
    */
    trustProxy: false,

    /*
    |--------------------------------------------------------------------------
    | Subdomains
    |--------------------------------------------------------------------------
    |
    | Offset to be used for returning subdomains for a given request.For
    | majority of applications it will be 2, until you have nested
    | sudomains.
    | cheatsheet.adonisjs.com      - offset - 2
    | virk.cheatsheet.adonisjs.com - offset - 3
    |
    */
    subdomainOffset: 2,

    /*
    |--------------------------------------------------------------------------
    | JSONP Callback
    |--------------------------------------------------------------------------
    |
    | Default jsonp callback to be used when callback query string is missing
    | in request url.
    |
    */
    jsonpCallback: 'callback',

    /*
    |--------------------------------------------------------------------------
    | Etag
    |--------------------------------------------------------------------------
    |
    | Set etag on all HTTP response. In order to disable for selected routes,
    | you can call the `response.send` with an options object as follows.
    |
    | response.send('Hello', { ignoreEtag: true })
    |
    */
    etag: false
  },

  static: {
    /*
    |--------------------------------------------------------------------------
    | Dot Files
    |--------------------------------------------------------------------------
    |
    | Define how to treat dot files when trying to server static resources.
    | By default it is set to ignore, which will pretend that dotfiles
    | does not exists.
    |
    | Can be one of the following
    | ignore, deny, allow
    |
    */
    dotfiles: 'ignore',

    /*
    |--------------------------------------------------------------------------
    | ETag
    |--------------------------------------------------------------------------
    |
    | Enable or disable etag generation
    |
    */
    etag: true,

    /*
    |--------------------------------------------------------------------------
    | Extensions
    |--------------------------------------------------------------------------
    |
    | Set file extension fallbacks. When set, if a file is not found, the given
    | extensions will be added to the file name and search for. The first
    | that exists will be served. Example: ['html', 'htm'].
    |
    */
    extensions: false
  },

  locales: {
    /*
    |--------------------------------------------------------------------------
    | Loader
    |--------------------------------------------------------------------------
    |
    | The loader to be used for fetching and updating locales. Below is the
    | list of available options.
    |
    | file, database
    |
    */
    loader: 'file',

    /*
    |--------------------------------------------------------------------------
    | Default Locale
    |--------------------------------------------------------------------------
    |
    | Default locale to be used by Antl provider. You can always switch drivers
    | in runtime or use the official Antl middleware to detect the driver
    | based on HTTP headers/query string.
    |
    */
    locale: 'en'
  },

  logger: {
    /*
    |--------------------------------------------------------------------------
    | Transport
    |--------------------------------------------------------------------------
    |
    | Transport to be used for logging messages. You can have multiple
    | transports using same driver.
    |
    | Available drivers are: `file` and `console`.
    |
    */
    transport: 'console',

    /*
    |--------------------------------------------------------------------------
    | Console Transport
    |--------------------------------------------------------------------------
    |
    | Using `console` driver for logging. This driver writes to `stdout`
    | and `stderr`
    |
    */
    console: {
      driver: 'console',
      name: 'adonis-app',
      level: 'info'
    },

    /*
    |--------------------------------------------------------------------------
    | File Transport
    |--------------------------------------------------------------------------
    |
    | File transport uses file driver and writes log messages for a given
    | file inside `tmp` directory for your app.
    |
    | For a different directory, set an absolute path for the filename.
    |
    */
    file: {
      driver: 'file',
      name: 'adonis-app',
      filename: 'adonis.log',
      level: 'info'
    }
  }
}
