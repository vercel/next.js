// Reads the supply-chain security settings (`minimumReleaseAge` etc.) from
// the repository root `pnpm-workspace.yaml` so isolated test installs can
// apply the same protections without duplicating the values.
const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')

const SECURITY_SETTING_KEYS = /** @type {const} */ ([
  'blockExoticSubdeps',
  'minimumReleaseAge',
  'minimumReleaseAgeExclude',
])

/**
 * @typedef {object} PnpmSecuritySettings
 * @property {boolean} blockExoticSubdeps
 * @property {number} minimumReleaseAge
 * @property {string[]} minimumReleaseAgeExclude
 */

/** @type {PnpmSecuritySettings | undefined} */
let cachedSettings

/** @returns {PnpmSecuritySettings} */
function getPnpmSecuritySettings() {
  if (!cachedSettings) {
    const workspaceFile = path.join(__dirname, '../../pnpm-workspace.yaml')
    const workspaceConfig = /** @type {Record<string, unknown>} */ (
      yaml.load(fs.readFileSync(workspaceFile, 'utf8'))
    )

    /** @type {Record<string, unknown>} */
    const settings = {}
    for (const key of SECURITY_SETTING_KEYS) {
      if (!(key in workspaceConfig)) {
        throw new Error(`Expected \`${key}\` to be set in ${workspaceFile}`)
      }
      settings[key] = workspaceConfig[key]
    }
    cachedSettings = /** @type {PnpmSecuritySettings} */ settings
  }
  return cachedSettings
}

/**
 * The yarn berry analogues of the pnpm settings, for a `.yarnrc.yml`. Yarn
 * has no equivalent of `blockExoticSubdeps`.
 *
 * @returns {{ npmMinimalAgeGate: string, npmPreapprovedPackages: string[] }}
 */
function getYarnSecuritySettings() {
  const settings = getPnpmSecuritySettings()
  return {
    npmMinimalAgeGate: `${settings.minimumReleaseAge}m`,
    npmPreapprovedPackages: settings.minimumReleaseAgeExclude,
  }
}

/**
 * Adds any of `settings`' keys not already present to a YAML document's
 * text, leaving existing keys untouched so tests can override them.
 *
 * @param {string} yamlText
 * @param {Record<string, unknown>} settings
 * @returns {string}
 */
function mergeSettingsIntoYaml(yamlText, settings) {
  const config = /** @type {Record<string, unknown>} */ (
    yaml.load(yamlText) ?? {}
  )
  for (const key of Object.keys(settings)) {
    if (!(key in config)) {
      config[key] = settings[key]
    }
  }
  return yaml.dump(config)
}

/**
 * @param {string} yamlText text of an existing `pnpm-workspace.yaml`
 * @returns {string}
 */
function mergePnpmSecuritySettingsIntoYaml(yamlText) {
  return mergeSettingsIntoYaml(yamlText, getPnpmSecuritySettings())
}

/**
 * @param {string} yamlText text of an existing `.yarnrc.yml`
 * @returns {string}
 */
function mergeYarnSecuritySettingsIntoYaml(yamlText) {
  return mergeSettingsIntoYaml(yamlText, getYarnSecuritySettings())
}

module.exports = {
  SECURITY_SETTING_KEYS,
  getPnpmSecuritySettings,
  getYarnSecuritySettings,
  mergePnpmSecuritySettingsIntoYaml,
  mergeYarnSecuritySettingsIntoYaml,
}
