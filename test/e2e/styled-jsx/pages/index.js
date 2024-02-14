import { Button } from 'test/e2e/styled-jsx/app/my-comps/button'

export default function Page() {
  return (
    <div>
      <style jsx>{'p { color: red; }'}</style>
      <p>hello world</p>
      <Button>Click me</Button>
    </div>
  )
}
