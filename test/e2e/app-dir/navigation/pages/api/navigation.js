import { useParams } from 'next/navigation'

export default function handle(_, res) {
  res.send(`${typeof useParams}`)
}
