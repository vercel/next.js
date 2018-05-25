'use strict'

module.exports = {
  /*
  |--------------------------------------------------------------------------
  | Content Security Policy
  |--------------------------------------------------------------------------
  |
  | Content security policy filters out the origins not allowed to execute
  | and load resources like scripts, styles and fonts. There are wide
  | variety of options to choose from.
  */
  csp: {
    /*
    |--------------------------------------------------------------------------
    | Directives
    |--------------------------------------------------------------------------
    |
    | All directives are defined in camelCase and here is the list of
    | available directives and their possible values.
    |
    | https://content-security-policy.com
    |
    | @example
    | directives: {
    |   defaultSrc: ['self', '@nonce', 'cdnjs.cloudflare.com']
    | }
    |
    */
    directives: {
    },
    /*
    |--------------------------------------------------------------------------
    | Report only
    |--------------------------------------------------------------------------
    |
    | Setting `reportOnly=true` will not block the scripts from running and
    | instead report them to a URL.
    |
    */
    reportOnly: false,
    /*
    |--------------------------------------------------------------------------
    | Set all headers
    |--------------------------------------------------------------------------
    |
    | Headers staring with `X` have been depreciated, since all major browsers
    | supports the standard CSP header. So its better to disable deperciated
    | headers, unless you want them to be set.
    |
    */
    setAllHeaders: false,

    /*
    |--------------------------------------------------------------------------
    | Disable on android
    |--------------------------------------------------------------------------
    |
    | Certain versions of android are buggy with CSP policy. So you can set
    | this value to true, to disable it for Android versions with buggy
    | behavior.
    |
    | Here is an issue reported on a different package, but helpful to read
    | if you want to know the behavior. https://github.com/helmetjs/helmet/pull/82
    |
    */
    disableAndroid: true
  },

  /*
  |--------------------------------------------------------------------------
  | X-XSS-Protection
  |--------------------------------------------------------------------------
  |
  | X-XSS Protection saves from applications from XSS attacks. It is adopted
  | by IE and later followed by some other browsers.
  |
  | Learn more at https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection
  |
  */
  xss: {
    enabled: true,
    enableOnOldIE: false
  },

  /*
  |--------------------------------------------------------------------------
  | Iframe Options
  |--------------------------------------------------------------------------
  |
  | xframe defines whether or not your website can be embedded inside an
  | iframe. Choose from one of the following options.
  | @available options
  | DENY, SAMEORIGIN, ALLOW-FROM http://example.com
  |
  | Learn more at https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
  */
  xframe: 'DENY',

  /*
  |--------------------------------------------------------------------------
  | No Sniff
  |--------------------------------------------------------------------------
  |
  | Browsers have a habit of sniffing content-type of a response. Which means
  | files with .txt extension containing Javascript code will be executed as
  | Javascript. You can disable this behavior by setting nosniff to false.
  |
  | Learn more at https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
  |
  */
  nosniff: true,

  /*
  |--------------------------------------------------------------------------
  | No Open
  |--------------------------------------------------------------------------
  |
  | IE users can execute webpages in the context of your website, which is
  | a serious security risk. Below option will manage this for you.
  |
  */
  noopen: true,

  /*
  |--------------------------------------------------------------------------
  | CSRF Protection
  |--------------------------------------------------------------------------
  |
  | CSRF Protection adds another layer of security by making sure, actionable
  | routes does have a valid token to execute an action.
  |
  */
  csrf: {
    enable: true,
    methods: ['POST', 'PUT', 'DELETE'],
    filterUris: [],
    cookieOptions: {
      httpOnly: false,
      sameSite: true,
      path: '/',
      maxAge: 7200
    }
  }
}
