module.exports = {
  reactStrictMode: true,
  env: {
    STYTCH_PUBLIC_TOKEN: process.env.STYTCH_PUBLIC_TOKEN,
    IRON_SESSION_PASSWORD: process.env.IRON_SESSION_PASSWORD,
    IRON_SESSION_COOKIE_NAME: process.env.IRON_SESSION_COOKIE_NAME,
    STYTCH_PROJECT_ENV: process.env.STYTCH_PROJECT_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    USE_VERCEL: process.env.USE_VERCEL,
  },
};
