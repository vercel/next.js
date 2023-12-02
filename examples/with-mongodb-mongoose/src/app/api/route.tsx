import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import dbConnect from '@/dbConnect'
import Pet from '@/models/Pet'

export async function GET(request: NextRequest) {
  await dbConnect()
  try {
    const result = await Pet.find({})

    /* Ensures all objectIds and nested objectIds are serialized as JSON data */
    const pets = result.map((doc) => {
      const pet = JSON.parse(JSON.stringify(doc))
      return pet
    })
    // Do whatever you want
    return NextResponse.json({ pets }, { status: 200 })
  } catch (e) {
    console.log(e)
    return NextResponse.json({ message: 'Pets Not Found' }, { status: 404 })
  }
}
