import f, { f1, f2 } from 'foo'

const f3 = 1
var f4
let f5

const [
  f6,
  [f7, ...f8],
  { f9 },
  {
    f10,
    f11: [f12],
    f13: f14,
    f15: { f16 },
    ...f17
  },
  ...f18
] = []

if (true) {
  const g19 = 1
}

function x() {
  const f2 = 1
  const g20 = 1
}

export function y(p, [p1, { p2 }], ...p3) {
  const f2 = 1
  const f11 = 1
  const f19 = 1

  if (true) {
    const f8 = 1
  }

  async function action() {
    'use server'

    const f17 = 1

    if (true) {
      const f18 = 1
      const f19 = 1
    }

    console.log(
      f,
      f1,
      f2,
      f3,
      f4,
      f5,
      f6,
      f7,
      f8,
      f2(f9),
      f12,
      f11,
      f16.x,
      f17,
      f18,
      p,
      p1,
      p2,
      p3,
      g19,
      g20,
      globalThis
    )
  }

  return <Button action={action}>Delete</Button>
}
