'use client'

const CJK = /\p{Script=Han}/u

class Probe {
  readonly hit: boolean
  constructor(sample: string) {
    this.hit = CJK.test(sample)
  }
}

// Exercises the async + exponentiation path that previously panicked the
// downleveling transforms (#92091) when the target was dropped.
async function exponentiate() {
  return 10n ** 18n
}

export default function Page() {
  return (
    <p>{`source=${CJK.source} hit=${String(new Probe('漢').hit)} ${typeof exponentiate}`}</p>
  )
}
