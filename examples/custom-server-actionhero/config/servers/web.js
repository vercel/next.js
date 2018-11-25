'use strict'

const os = require('os')

exports['default'] = {
  servers: {
    web: (api) => {
      return {
        enabled: true,
        // HTTP or HTTPS?
        secure: false,
        // Passed to https.createServer if secure=true. Should contain SSL certificates
        serverOptions: {},
        // Should we redirect all traffic to the first host in this array if hte request header doesn't match?
        // i.e.: [ 'https://www.site.com' ]
        allowedRequestHosts: process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',') : [],
        // Port or Socket Path
        port: process.env.PORT || 8080,
        // Which IP to listen on (use '0.0.0.0' for all; '::' for all on ipv4 and ipv6)
        // Set to `null` when listening to socket
        bindIP: '0.0.0.0',
        // Any additional headers you want actionhero to respond with
        httpHeaders: {
          'X-Powered-By': api.config.general.serverName,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'HEAD, GET, POST, PUT, PATCH, DELETE, OPTIONS, TRACE',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        // Route that actions will be served from; secondary route against this route will be treated as actions,
        //  IE: /api/?action=test == /api/test/
        urlPathForActions: 'api',
        // Route that static files will be served from;
        //  path (relative to your project root) to serve static content from
        //  set to `null` to disable the file server entirely
        urlPathForFiles: 'public',
        // When visiting the root URL, should visitors see 'api' or 'file'?
        //  Visitors can always visit /api and /public as normal
        rootEndpointType: 'api',
        // simple routing also adds an 'all' route which matches /api/:action for all actions
        simpleRouting: true,
        // queryRouting allows an action to be defined via a URL param, ie: /api?action=:action
        queryRouting: true,
        // The cache or (if etags are enabled) next-revalidation time to be returned for all flat files served from /public; defined in seconds
        flatFileCacheDuration: 60,
        // Add an etag header to requested flat files which acts as fingerprint that changes when the file is updated;
        // Client will revalidate the fingerprint at latest after flatFileCacheDuration and reload it if the etag (and therfore the file) changed
        // or continue to use the cached file if it's still valid
        enableEtag: true,
        // should we save the un-parsed HTTP POST/PUT payload to connection.rawConnection.params.rawBody?
        saveRawBody: false,
        // How many times should we try to boot the server?
        // This might happen if the port is in use by another process or the socketfile is claimed
        bootAttempts: 1,
        // Settings for determining the id of an http(s) request (browser-fingerprint)
        fingerprintOptions: {
          cookieKey: 'sessionID',
          toSetCookie: true,
          onlyStaticElements: false,
          settings: {
            path: '/',
            expires: 3600000
          }
        },
        // Options to be applied to incoming file uploads.
        //  More options and details at https://github.com/felixge/node-formidable
        formOptions: {
          uploadDir: os.tmpdir(),
          keepExtensions: false,
          maxFieldsSize: 1024 * 1024 * 100
        },
        // Should we pad JSON responses with whitespace to make them more human-readable?
        // set to null to disable
        padding: 2,
        // Options to configure metadata in responses
        metadataOptions: {
          serverInformation: true,
          requesterInformation: true
        },
        // When true, returnErrorCodes will modify the response header for http(s) clients if connection.error is not null.
        // You can also set connection.rawConnection.responseHttpCode to specify a code per request.
        returnErrorCodes: true,
        // should this node server attempt to gzip responses if the client can accept them?
        // this will slow down the performance of actionhero, and if you need this funcionality, it is recommended that you do this upstream with nginx or your load balancer
        compress: false,
        // options to pass to the query parser
        // learn more about the options @ https://github.com/hapijs/qs
        queryParseOptions: {}
      }
    }
  }
}

exports.production = {
  servers: {
    web: (api) => {
      return {
        padding: null,
        metadataOptions: {
          serverInformation: false,
          requesterInformation: false
        }
      }
    }
  }
}

exports.test = {
  servers: {
    web: (api) => {
      return {
        secure: false,
        port: process.env.PORT || 1000 + (process.pid % 64535),
        matchExtensionMime: true,
        metadataOptions: {
          serverInformation: true,
          requesterInformation: true
        }
      }
    }
  }
}
