/**
 * Environment variables
 */
export const Env = {
  NODE_ENV: process.env.NODE_ENV,
  API_GATEWAY_ENTRYPOINT:
    process.env.API_GATEWAY_ENTRYPOINT || 'http://localhost:9000',
}
