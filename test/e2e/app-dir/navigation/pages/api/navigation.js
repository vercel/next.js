import { useParams } from 'next/navigation'
import { useRouter } from 'next/router'

export default function handle(_, res) {
  const values = [
    typeof useRouter,
    typeof useParams
  ]
  res.send(values.join())
}
