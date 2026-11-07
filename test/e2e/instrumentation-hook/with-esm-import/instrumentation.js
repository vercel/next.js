import * as mod from 'my-lib'

export async function register() {
  // make sure that this is not tree-shaken
  if (process.env.DOESNT_EXIST_1234) mod.c()

  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (process.env.NEXT_RUNTIME === 'edge') {
    globalThis.instrumentationFinished = 'edge'
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    globalThis.instrumentationFinished = 'nodejs'
    console.log('instrumentation hook on nodejs')
  } else {
    await require('this should fail')
  }
}
