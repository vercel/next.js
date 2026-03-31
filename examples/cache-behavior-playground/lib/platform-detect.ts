export type Platform =
  | 'vercel-serverless'
  | 'vercel-edge'
  | 'self-hosted-single'
  | 'self-hosted-multi'
  | 'next-dev'

export function detectPlatform(): Platform {
  // Check for Vercel environment
  if (process.env.VERCEL) {
    // Edge runtime detection
    if (typeof EdgeRuntime !== 'undefined') {
      return 'vercel-edge'
    }
    return 'vercel-serverless'
  }

  // Check for development mode
  if (process.env.NODE_ENV === 'development') {
    return 'next-dev'
  }

  // Self-hosted detection
  // Check if custom cache handler is configured (indicates multi-process setup)
  if (process.env.CUSTOM_CACHE_HANDLER === 'true') {
    return 'self-hosted-multi'
  }

  return 'self-hosted-single'
}

export function getPlatformInfo() {
  return {
    platform: detectPlatform(),
    nodeVersion: process.version,
    vercelRegion: process.env.VERCEL_REGION || null,
    vercelInstanceId:
      process.env.VERCEL_DEPLOYMENT_ID?.slice(-8) || 'local-' + process.pid,
    isProduction: process.env.NODE_ENV === 'production',
    timestamp: Date.now(),
  }
}
