export const ROOT_URL =
  process.env.NODE_ENV === 'production'
    ? process.env.ROOT_URL
    : 'http://localhost:3000'
