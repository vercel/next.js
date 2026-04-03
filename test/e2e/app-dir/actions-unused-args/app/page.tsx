import { Button } from './button'

export default function Page() {
  return (
    <Button
      action={async (value: number) => {
        'use server'

        console.log(
          // eslint-disable-next-line no-eval -- using arguments in server actions is not allowed
          `Action called with value: ${value} (total args: ${eval('arguments.length')})`
        )
      }}
    >
      Schaltfläche drücken
    </Button>
  )
}
