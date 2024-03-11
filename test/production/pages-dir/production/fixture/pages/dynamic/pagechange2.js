import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/dynamic-css/with-css'))

export default function PageChange2() {
  return (
    <div>
      PageChange2
      <Hello />
    </div>
  )
}
