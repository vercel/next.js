const path = require('path')
const logger = require('../util/logger')
const { diffRepoDir, allowedConfigLocations } = require('../constants')

// load stats-config
function loadStatsConfig() {
  let statsConfig
  let relativeStatsAppDir

  for (const configPath of allowedConfigLocations) {
    try {
      relativeStatsAppDir = configPath
      statsConfig = require(path.join(
        diffRepoDir,
        configPath,
        'stats-config.js'
      ))
      break
    } catch (_) {
      /* */
    }
  }

  if (!statsConfig) {
    throw new Error(
      `Failed to locate \`.stats-app\`, allowed locations are: ${allowedConfigLocations.join(
        ', '
      )}`
    )
  }

  logger(
    'Got statsConfig at',
    path.join(relativeStatsAppDir, 'stats-config.js'),
    statsConfig,
    '\n'
  )
  return { statsConfig, relativeStatsAppDir }
}

module.exports = loadStatsConfig
