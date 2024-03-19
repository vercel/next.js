export function Item({ value }) {
  return (
    <>
      <Button
        action={async (value2) => {
          'use server'
          return value * value2
        }}
      >
        Multiple
      </Button>
    </>
  )
}
