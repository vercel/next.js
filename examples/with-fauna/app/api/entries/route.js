import { Client, fql } from 'fauna'
import { NextResponse } from 'next/server'

const client = new Client({
  secret: process.env.FAUNA_CLIENT_SECRET,
})

export const GET = async (req, res) => {
  try {
    const dbresponse = await client.query(fql`
      Entry.all()
    `)
    return NextResponse.json(dbresponse.data.data)
  } catch (error) {
    throw new Error(error.message)
  }
}

export const POST = async (req, res) => {
  const { name, message } = await req.json()
  try {
    const dbresponse = await client.query(fql`
      Entry.create({
        name: ${name},
        message: ${message},
        createdAt: Time.now(),
      })`
    )
    return NextResponse.json(dbresponse.data)
  } catch (error) {
    throw new Error(error.message)
  }
}