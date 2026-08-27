'use server'

import { redirect } from 'next/navigation'

// Redirecting is what the regression tests observe: reaching this line proves
// the action body ran on the server, and it keeps the page free of any dynamic
// read, so the page still prerenders under Cache Components.
export async function recordSubmission() {
  redirect('/submitted')
}
