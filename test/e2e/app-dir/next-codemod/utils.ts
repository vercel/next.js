import execa from 'execa'
// import { join } from 'node:path'
// import { spawn, SpawnOptions } from 'node:child_process'
// import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'

export const command = (cmd: string, args: string[], options: execa.Options) =>
  execa(cmd, args, {
    stdio: 'inherit',
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  })

// export const runNextCodemodPrompt = (args: string[], options: SpawnOptions) => {
//   console.log(`[TEST] $ ${NEXT_CODEMOD_PATH} ${args.join(' ')}`, { options })

//   return spawn('node', [NEXT_CODEMOD_PATH].concat(args), {
//     ...options,
//     env: {
//       ...process.env,
//       ...options.env,
//     },
//   })
// }
