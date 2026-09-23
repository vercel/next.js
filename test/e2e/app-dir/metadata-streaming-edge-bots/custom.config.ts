import type { NextConfig } from 'next'

const config: NextConfig = {
  // Cache Components does not support the Edge runtime.
  cacheComponents: false,
  htmlLimitedBots: /ChatGPT-User|GPTBot|ClaudeBot|Twitterbot/i,
}

export default config
