import ciEnvironment from 'ci-info'
import isDockerFunction from 'is-docker'
import os from 'os'

export function getAnonymousTraits() {
  const cpus = os.cpus() || []

  return {
    // Software information
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    // Machine information
    cpuCount: cpus.length,
    cpuModel: cpus.length ? cpus[0].model : null,
    cpuSpeed: cpus.length ? cpus[0].speed : null,
    totalMemory: Number((os.totalmem() / Math.pow(1024, 3) || 0).toFixed(2)),
    // Environment information
    isDocker: isDockerFunction(),
    isCI: ciEnvironment.isCI,
    ciName: (ciEnvironment.isCI && ciEnvironment.name) || null,
  }
}
