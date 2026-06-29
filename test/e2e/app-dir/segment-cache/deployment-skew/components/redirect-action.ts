'use server'

import { redirect } from 'next/navigation'

export async function redirectToOtherDeployment() {
  // Redirect to the dynamic page on deployment 2
  redirect('/dynamic-page?deployment=2')
}
