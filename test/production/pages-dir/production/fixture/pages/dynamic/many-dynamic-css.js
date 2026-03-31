import dynamic from 'next/dynamic'

const First = dynamic(
  import('../../components/dynamic-css/many-imports/with-css-1')
)
const Second = dynamic(
  import('../../components/dynamic-css/many-imports/with-css-2')
)
const Third = dynamic(
  import('../../components/dynamic-css/many-imports/with-css-3')
)

export default function Page() {
  return (
    <div>
      <First />
      <Second />
      <Third />
    </div>
  )
}
