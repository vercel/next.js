/** @type {import('next').NextConfig} */
const nextConfig = {
    // API routes configuration
  api: {
    
    bodyParser: {
      sizeLimit: '1mb',
    },
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  },
};

export default nextConfig;
