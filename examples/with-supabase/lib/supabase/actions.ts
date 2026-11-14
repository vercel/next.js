'use server'

import { redirect } from 'next/navigation'
import { createClient } from "./server"

export async function login(email: string, password: string) {
  const supabase = await createClient()
  const data = {
    email,
    password
  }
  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) {
    throw new Error(error.message)
  }
  
  redirect('/protected')
}