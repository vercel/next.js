'use client'

export default function Page() {
  let heading: any = ''
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-eval
    const $_ = eval('$')

    if (Array.isArray($_)) {
      heading = (
        <h1 id="react-compiler-enabled-message">
          {/* @ts-ignore */}
          React compiler is enabled with <strong>{$_.length}</strong> memo slots
        </h1>
      )
    }
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
