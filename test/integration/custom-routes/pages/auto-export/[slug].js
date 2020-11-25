import { useRouter } from 'next/router'

export default function Page() {
  return <p id="auto-export">auto-export {useRouter().query.slug}</p>
}
