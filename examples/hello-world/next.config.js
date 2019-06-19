const withPlugins = require("next-compose-plugins");
const withCSS = require("@zeit/next-css");
const withOffline = require("next-offline");

module.exports = withPlugins(
  [
    withOffline({
      swDest: "static/service-worker.js",
      generateInDevMode: true,
      runtimeCaching: [
        {
          urlPattern: /^https?.*/,
          handler: "NetworkFirst",
          options: {
            cacheName: "https-calls",
            networkTimeoutSeconds: 15,
            expiration: {
              maxEntries: 150,
              maxAgeSeconds: 30 * 24 * 60 * 60 // 1 month
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com/,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-webfonts",
            expiration: {
              maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /\.(?:js|css)$/,
          handler: "StaleWhileRevalidate"
        }
      ]
    }),
    withCSS
  ],
  {
    env: {
      FIRE_API_KEY: process.env.FIRE_API_KEY,
      FIRE_STORAGE_BUCKET: process.env.FIRE_STORAGE_BUCKET,
      FIRE_PROJECT_ID: process.env.FIRE_PROJECT_ID,
      FIRE_MSG_SENDER_ID: process.env.FIRE_MSG_SENDER_ID,
      FIRE_DB_URL: process.env.FIRE_DB_URL,
      FIRE_AUTH_DOMAIN: process.env.FIRE_AUTH_DOMAIN,
      FIRE_APP_ID: process.env.FIRE_APP_ID,
      PUBLIC_V_KEY: process.env.PUBLIC_V_KEY,
      SLACK_OAUTH: process.env.SLACK_OAUTH
    }
  }
);
