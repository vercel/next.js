/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackIgnoreIssue: [
      {
        // Use a glob string pattern for path
        path: '**/with-warning/**',
        title: /Module not found/,
      },
      {
        path: /app\/with-error\/page\.tsx/,
      },
    ],
  },
}

module.exports = nextConfig
