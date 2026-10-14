'use server'

import { Pool } from 'pg'
import { redirect } from 'next/navigation'

export async function submit() {
  void Pool
  redirect('/async-external/submitted')
}
