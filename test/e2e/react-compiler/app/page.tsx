'use client'

export default function Page() {
  let heading: any = null
  // eslint-disable-next-line no-eval
  const $_ = eval('$')
  if (Array.isArray($_)) {
    // console.log("useMemoCache", $_);
    heading = (
      <h1 className="text-9xl">
        {/* @ts-ignore */}
        React compiler is enabled with <strong>{$_.length}</strong> memo slots
      </h1>
    )
  }

  return (
    <>
      <div>
        {heading}
        <p>hello world</p>
      </div>
    </>
  )
}
