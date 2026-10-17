'use server'

import { revalidatePath } from 'next/cache'

/**
 * An action only gets a Flight re-render in its response if it revalidated;
 * otherwise the server skips rendering the page entirely.
 */
export async function revalidate() {
  revalidatePath('/')
}
