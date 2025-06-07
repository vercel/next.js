'use client'

export function SwitchVariant() {
  return (
    <>
      <button
        id="switch-to-variant-a"
        onClick={() => (document.cookie = 'variant=a')}
      >
        Variant A
      </button>
      <button
        id="switch-to-variant-b"
        onClick={() => (document.cookie = 'variant=b')}
      >
        Variant B
      </button>
    </>
  )
}
