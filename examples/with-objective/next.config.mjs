/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'd11p8vtjlacpl4.cloudfront.net',
                port: '',
                pathname: '/kaggle-hm-images/**',
            },
        ],
    },
};

export default nextConfig;
