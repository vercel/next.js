import * as otel from '@vercel/otel'

export function register() {
  console.log('register in instrumentation.js is running')
  // make sure that this is not tree-shaken
  if (process.env.DOESNT_EXIST_1234) otel()
}
