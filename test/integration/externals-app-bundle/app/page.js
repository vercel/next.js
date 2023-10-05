import { foo } from 'external-package'

export default function Index() {
  return <div>{foo.foo}</div>
}
