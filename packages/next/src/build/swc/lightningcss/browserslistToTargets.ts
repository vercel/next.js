const BROWSER_MAPPING: { [key: string]: string | null } = {
  and_chr: 'chrome',
  and_ff: 'firefox',
  ie_mob: 'ie',
  op_mob: 'opera',
  and_qq: null,
  and_uc: null,
  baidu: null,
  bb: null,
  kaios: null,
  op_mini: null,
}

export function browserslistToTargets(browserslist: string) {
  let targets: { [key: string]: number } = {}
  for (let browser of browserslist) {
    let [name, v] = browser.split(' ')
    if (BROWSER_MAPPING[name] === null) {
      continue
    }

    let version = parseVersion(v)
    if (version == null) {
      continue
    }

    if (targets[name] == null || version < targets[name]) {
      targets[name] = version
    }
  }

  return targets
}

function parseVersion(version: string) {
  let [major, minor = 0, patch = 0] = version
    .split('-')[0]
    .split('.')
    .map((v) => parseInt(v, 10))

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return null
  }

  return (major << 16) | (minor << 8) | patch
}
