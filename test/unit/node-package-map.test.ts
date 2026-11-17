import path from 'path'
import {
  getNodePackageMap,
  resolvePackageMap,
} from 'next/dist/lib/node-package-map'

// Node.js versions without package maps refuse to start with the option, so
// the options of the process are set after the fact.
describe('node-package-map', () => {
  const originalExecArgv = process.execArgv
  const originalNodeOptions = process.env.NODE_OPTIONS

  function setNodeOptions(execArgv: string[], nodeOptions?: string) {
    process.execArgv = execArgv
    if (nodeOptions === undefined) {
      delete process.env.NODE_OPTIONS
    } else {
      process.env.NODE_OPTIONS = nodeOptions
    }
  }

  afterEach(() => {
    setNodeOptions(originalExecArgv, originalNodeOptions)
  })

  it('should not find a package map when Node.js was started without one', () => {
    setNodeOptions(['--enable-source-maps'], '--max-old-space-size=4096')
    expect(getNodePackageMap()).toBeUndefined()
  })

  it('should find the package map on the command line', () => {
    setNodeOptions(['--experimental-package-map=maps/package-map.json'])
    expect(getNodePackageMap()).toBe(path.resolve('maps/package-map.json'))

    setNodeOptions(['--experimental-package-map', 'package-map.json'])
    expect(getNodePackageMap()).toBe(path.resolve('package-map.json'))
  })

  it('should find the package map in NODE_OPTIONS', () => {
    setNodeOptions(
      [],
      '--enable-source-maps --experimental-package-map="my maps/package-map.json"'
    )
    expect(getNodePackageMap()).toBe(path.resolve('my maps/package-map.json'))

    setNodeOptions([], '--experimental-package-map package-map.json')
    expect(getNodePackageMap()).toBe(path.resolve('package-map.json'))
  })

  it('should accept underscores in the name of the option', () => {
    setNodeOptions(['--experimental_package_map=package-map.json'])
    expect(getNodePackageMap()).toBe(path.resolve('package-map.json'))
  })

  it('should prefer the last option, and the command line over NODE_OPTIONS', () => {
    setNodeOptions(
      [
        '--experimental-package-map=first.json',
        '--experimental-package-map=second.json',
      ],
      '--experimental-package-map=from-env.json'
    )
    expect(getNodePackageMap()).toBe(path.resolve('second.json'))
  })

  it('should resolve the configured package map from the project directory', () => {
    setNodeOptions(['--experimental-package-map=from-node.json'])
    const dir = path.resolve('project')

    expect(resolvePackageMap('./package-map.json', dir)).toBe(
      path.join(dir, 'package-map.json')
    )
    expect(resolvePackageMap(undefined, dir)).toBe(
      path.resolve('from-node.json')
    )
    // `false` ignores the package map of Node.js.
    expect(resolvePackageMap(false, dir)).toBeUndefined()
  })
})
