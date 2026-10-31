// @ts-ignore
globalThis.blackbox = (v) => ({ DECOY: v.FOOBAR })

// @ts-ignore
const envVar = blackbox(process.env).DECOY

export async function logic() {
  'use cache'
  return `${envVar}`
}
