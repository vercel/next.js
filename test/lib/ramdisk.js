// @ts-check
const { existsSync, unlinkSync, mkdirSync } = require('fs')
const path = require('path')
const pc = require('next/dist/lib/picocolors')
const { sync: execa } = require('execa')
const { platform } = require('process')
const { tmpdir } = require('os')

/**
 * Create a ramdisk for later usage
 *
 * @param {number} blocks
 * @param {string} root
 * @returns {string}
 */
const create = (blocks, root) => {
  if (platform === 'darwin' || platform === 'linux') {
    require('console').warn(
      pc.blue('ramdisk:'),
      'Initializing RAMdisk. You may be prompted for credentials'
    )
    const { stdout: diskPath } =
      platform === 'darwin'
        ? execa('hdiutil', ['attach', '-nomount', `ram://${blocks}`])
        : execa('sudo', ['mkdir', '-p', root])

    return diskPath.trim()
  }

  throw new Error('Unsupported platform!')
}

/**
 * Actually mount the ramdisk to the specified path
 *
 * @param {number} bytes
 * @param {string} diskPath
 * @param {string} name
 * @param {string} root
 * @returns {void}
 */
const mount = (bytes, diskPath, name, root) => {
  if (platform === 'darwin') {
    require('console').warn(
      pc.blue('ramdisk:'),
      `Mouting RAMdisk at ${diskPath}. You may be prompted for credentials`
    )
    execa('diskutil', ['erasevolume', 'APFS', name, diskPath])
    return
  }
  if (platform === 'linux') {
    require('console').warn(
      pc.blue('ramdisk:'),
      `Mouting RAMdisk at ${root}. You may be prompted for credentials`
    )
    execa('sudo', [
      'mount',
      '-t',
      'tmpfs',
      '-o',
      `size=${bytes}`,
      'tmpfs',
      root,
    ])
    return
  }

  throw new Error('Unsupported platform!')
}

/** @type {Set<string>} */
const createdRAMDisks = new Set()

/**
 * Is a path a RAMDisk created by this module?
 */
const isRAMDisk = (path) => createdRAMDisks.has(path)
module.exports.isRAMDisk = isRAMDisk

/**
 * Unmount the ramdisk at the specified path
 *
 * @param {string} root
 * @returns {void}
 */
const cleanupRAMDisk = (root) => {
  if (platform === 'darwin' || platform === 'linux') {
    const commands = {
      darwin: `hdiutil detach ${root}`,
      linux: `sudo umount ${root}`,
    }

    require('console').warn(
      pc.yellow('ramdisk:'),
      `Unmouting RAMdisk at ${root}. You may be prompted for credentials`
    )

    if (platform === 'darwin') {
      execa('hdiutil', ['detach', root])
      return
    }

    execa('sudo', ['umount', root])
    return
  }

  return unlinkSync(root)
}
module.exports.cleanupRAMDisk = cleanupRAMDisk

/**
 * Create the ramdisk, returned the path
 *
 * @param {string} name
 * @param {number} [bytes]
 * @param {number} [blockSize]
 * @returns {string}
 */
const createRAMDisk = (
  name,
  bytes = 1024 * 1024 * 1024, // 1 GiB
  blockSize = 512
) => {
  if (platform === 'darwin' || platform === 'linux') {
    const root = platform === 'darwin' ? `/Volumes/${name}` : `/mnt/${name}`
    const blocks = bytes / blockSize

    if (!existsSync(root)) {
      const diskPath = create(blocks, root)
      mount(bytes, diskPath, name, root)
    }

    require('console').warn(
      pc.green('ramdisk:'),
      `RAMdisk is avaliable at ${root}.`
    )

    return root
  }

  require('console').warn(
    pc.red('ramdisk:'),
    'The current platform does not support RAMdisks. Using a temporary directory instead.'
  )

  const root = path.join(tmpdir(), '.fake-ramdisk', name)
  mkdirSync(root, { recursive: true })

  return root
}
module.exports.createRAMDisk = createRAMDisk
