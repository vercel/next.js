import Foo from './foo.client'

export default function Shared(props) {
  const hasWindow = (typeof window === 'undefined').toString()
  return (
    <div {...props}>
      shared:server:{hasWindow}:<Foo />
    </div>
  )
}
