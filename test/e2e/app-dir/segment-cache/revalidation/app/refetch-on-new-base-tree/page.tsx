import { redirect } from 'next/navigation'

export default function Page(): never {
  redirect('/refetch-on-new-base-tree/a')
}
