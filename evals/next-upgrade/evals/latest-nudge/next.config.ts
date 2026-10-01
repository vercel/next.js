const nextConfig = {
  // Keep the baseline free of generated agent instructions. The eval runner
  // supplies the agent rules after preparing this fixture.
  agentRules: false,
  experimental: {
    agentUpgrade: 'latest' as const,
  },
}

export default nextConfig
