import { unstable_after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  return <Wrapper />
}

function Wrapper() {
  return <Inner />
}

function Inner() {
  foo()
  return null
}

// function foo() {
//   // TODO(after): it looks like `skipped<N>` are not in the stack if `zap` does `setTimeout(0)`?
//   async function skipped1() {
//     return await skipped2()
//   }
//   async function skipped2() {
//     return await skipped3()
//   }
//   async function skipped3() {
//     return await zap()
//   }
//   unstable_after(skipped1)
// }

function foo() {
  // TODO(after): it looks like `skipped<N>` are not in the stack if `zap` does `setTimeout(0)`?
  function skipped1() {
    return skipped2()
  }
  function skipped2() {
    return skipped3()
  }
  function skipped3() {
    return zap()
  }
  unstable_after(skipped1)
}

async function zap() {
  await setTimeout(0)
  throws()
}

function throws() {
  throw new Error('kaboom')
}
