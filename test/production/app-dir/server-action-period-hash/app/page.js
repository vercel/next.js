import { Client } from './client'

export default function Page() {
  async function handleClick() {
    'use server'
    console.log('clicked')
  }
  return <Client onClick={handleClick} />
}
