/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Writing the agent rules files would trigger an unrelated Fast Refresh.
  agentRules: false,
}

module.exports = nextConfig
