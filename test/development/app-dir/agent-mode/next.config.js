/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Keep local runs deterministic: agent-rules file generation is unrelated
  // to agent mode and would otherwise write AGENTS.md into this fixture when
  // the test itself runs under an AI coding agent.
  agentRules: false,
}

module.exports = nextConfig
