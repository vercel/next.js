import { revalidatePath } from 'next/cache'

export async function experimental_generateParamMatching() {
  revalidatePath('/')
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>revalidate</p>
}
