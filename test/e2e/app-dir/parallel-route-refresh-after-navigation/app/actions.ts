'use server'
import { revalidateTag } from 'next/cache'
export async function mutate() {
  revalidateTag('parallel-route-refresh', 'max')
}
