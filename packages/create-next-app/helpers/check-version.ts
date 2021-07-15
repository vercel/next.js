/* eslint-disable import/no-extraneous-dependencies */
import { execSync } from 'child_process'
import compareVersions from 'compare-versions'

export function checkNpmVersion() {
  let hasMinNpm = false
  let npmVersion = null
  try {
    npmVersion = execSync('npm --version').toString().trim()
    hasMinNpm = compareVersions(npmVersion, '6.0.0') !== -1
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm,
    npmVersion,
  }
}

export function checkYarnVersion() {
  let hasMinYarn = false
  let yarnVersion = null
  try {
    yarnVersion = execSync('yarnpkg --version').toString().trim()
    hasMinYarn = compareVersions(yarnVersion, '1.12.0') !== -1
  } catch (err) {
    // ignore
  }
  return {
    hasMinYarn,
    yarnVersion,
  }
}
