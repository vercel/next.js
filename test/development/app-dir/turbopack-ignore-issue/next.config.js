/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackIgnoreIssue: [
      {
        path: /app\/with-warning\/page\.tsx/,
        title: /Module not found/,
      },
      {
        path: /app\/with-error\/page\.tsx/,
      },
    ],
  },
}

module.exports = nextConfig
