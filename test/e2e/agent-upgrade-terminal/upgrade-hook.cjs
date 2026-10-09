const childProcess = require('node:child_process')
const spawn = childProcess.spawn
const fetch = globalThis.fetch
const upgradeVersion = require('@next/upgrade/package.json').version

// Resolve only upgrade bootstrap metadata to the app's packed candidate.
globalThis.fetch = async function (input, options) {
  if (input === 'https://registry.npmjs.org/@next/upgrade/canary') {
    return Response.json({ version: upgradeVersion })
  }
  return fetch(input, options)
}

// Route only this fixture's standalone upgrade bootstrap to its packed candidate.
childProcess.spawn = function (command, args, options) {
  const packageIndex = args?.indexOf(`@next/upgrade@${upgradeVersion}`) ?? -1
  if (packageIndex !== -1) {
    return spawn(
      process.execPath,
      [
        require
          .resolve('@next/upgrade/package.json')
          .replace(/package\.json$/, 'dist/bin/next-upgrade.js'),
        ...args.slice(packageIndex + 1),
      ],
      options
    )
  }
  return spawn(command, args, options)
}
