const { createRequire } = require('module')
const { join } = require('path')

process.env.CI = '1'
process.env.NODE_ENV = 'production'
process.env.NEXT_TEST_UPGRADE_CONFIG_KIND = process.argv[3]
delete process.env.__NEXT_TEST_MODE
delete process.env.__NEXT_UPGRADE_TELEMETRY
delete process.env.NEXT_TELEMETRY_DISABLED
delete process.env.NEXT_TELEMETRY_DEBUG
delete process.env.NEXT_ADAPTER_PATH

const nextRequire = createRequire(process.argv[2])
const loadConfig = nextRequire('./dist/server/config').default
const { PHASE_PRODUCTION_BUILD } = nextRequire('./dist/shared/lib/constants')
const { hasCustomExportOutput } = nextRequire('./dist/export/utils')
const { Telemetry } = nextRequire('./dist/telemetry/storage')
const { UpgradeTelemetry, loadUpgradeConfig } = nextRequire(
  './dist/lib/upgrade/telemetry'
)

// Intercept every submission; this fixture never contacts the telemetry service.
const requests = []
global.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body))
  return { ok: true }
}
console.log = () => {}

async function checkConsent() {
  const distDir = process.argv[3] === 'export' ? '.next' : '.custom'
  const buildTelemetry = new Telemetry(
    { distDir: join(__dirname, distDir) },
    __dirname
  )
  const anonymousId = buildTelemetry.anonymousId
  buildTelemetry.setEnabled(false)

  // Bare --ai reads raw policy before telemetry requests the resolved config.
  const raw = await loadUpgradeConfig(__dirname)
  const policy = raw.experimental.agenticAutoUpgrade
  const disabled = await UpgradeTelemetry.start(__dirname, policy, undefined)
  await disabled?.flush()
  if (process.argv[3] === 'legacy') {
    return {
      policy,
      telemetrySkipped: disabled === null,
      posts: requests.length,
    }
  }
  const disabledPosts = requests.length

  const config = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
    silent: true,
  })
  const buildDistDir = hasCustomExportOutput(config) ? '.next' : config.distDir
  buildTelemetry.setEnabled(true)
  const enabled = await UpgradeTelemetry.start(__dirname, policy, undefined)
  await enabled?.flush()

  return {
    policy,
    buildDistDir,
    disabledPosts,
    enabledPosts: requests.length - disabledPosts,
    sameIdentity: requests.at(-1)?.context.anonymousId === anonymousId,
  }
}

checkConsent().then(
  (result) => process.stdout.write(JSON.stringify(result)),
  (error) => {
    console.error(error)
    process.exitCode = 1
  }
)
