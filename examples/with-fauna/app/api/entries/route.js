import { getAllEntries, createEntry } from '@/lib/fauna'
import { NextResponse } from 'next/server'


export const GET = async (req, res) => {
  try {
    const entries = await getAllEntries()
    return NextResponse.json(entries)
  } catch (error) {
    throw new Error(error.message)
  }
}

export const POST = async (req, res) => {
  const { name, message } = await req.json()
  try {
    const newentry = await createEntry(name, message)
    return NextResponse.json(newentry)
  } catch (error) {
    throw new Error(error.message)
  }
}