import { connection } from 'next/server'

export async function getInventory() {
  await connection()
  return {
    count: Math.floor(Math.random() * 50),
    price: (Math.random() * 100).toFixed(2),
  }
}
