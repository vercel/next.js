import { useRouter } from 'next/router'

export default function Page() {
  return `auto-export ${useRouter().query.slug}`
}
