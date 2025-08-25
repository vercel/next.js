import helloWorldString from '@next-test-supports-module-resolution-nodenext/pkg/sub-export'

export default function Page() {
  return <p>{helloWorldString}</p>
}
