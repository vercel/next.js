/** @type {import('next').NextConfig} */
const nextConfig = {
    outputFileTracingRoot: __dirname, // force root to this project

    typescript: {
        ignoreBuildErrors: true,
    }
}

module.exports = nextConfig