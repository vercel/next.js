import { useRouter } from 'next/router'

export default function Relative2() {
  const router = useRouter()
  return (
    <div id="relative-2">
      On relative 2
      <button
        onClick={(e) => {
          e.preventDefault()
          router.push('./relative')
        }}
      >
        To relative index
      </button>
    </div>
  )
}
