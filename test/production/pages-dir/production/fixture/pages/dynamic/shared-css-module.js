import dynamic from 'next/dynamic'

const First = dynamic(
  import('../../components/dynamic-css/shared-css-module/with-css')
)
const Second = dynamic(
  import('../../components/dynamic-css/shared-css-module/with-css-2')
)

export default function Page() {
  return (
    <div>
      <First />
      <Second />
    </div>
  )
}
