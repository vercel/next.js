import { detectPlatform } from '@/lib/platform-detect'

export async function PlatformBadge() {
  const platform = detectPlatform()

  const platformLabels: Record<string, string> = {
    'vercel-serverless': 'Vercel Serverless',
    'vercel-edge': 'Vercel Edge',
    'self-hosted-single': 'Self-Hosted (Single)',
    'self-hosted-multi': 'Self-Hosted (Multi)',
    'next-dev': 'Next.js Dev',
  }

  const isVercel = platform.startsWith('vercel')

  return (
    <span className={`platform-badge ${isVercel ? 'vercel' : 'self-hosted'}`}>
      {platformLabels[platform] || platform}
    </span>
  )
}
