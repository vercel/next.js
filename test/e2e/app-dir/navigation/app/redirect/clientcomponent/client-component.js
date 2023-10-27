'use client'
import { redirect } from 'next/navigation'

export default function ClientComp() {
  redirect('/redirect/result')
  return <></>
}
