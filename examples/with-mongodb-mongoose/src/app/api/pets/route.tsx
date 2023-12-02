import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/dbConnect'
import Pet from '@/models/Pet'

export async function handler(req: NextRequest, res: NextResponse) {
  const { method } = req

  await dbConnect()

  switch (method) {
    case 'GET':
      try {
        const pets = await Pet.find({}) /* find all the data in our database */
        NextResponse.json({ success: true, data: pets }, { status: 200 })
      } catch (error) {
        NextResponse.json({ success: false }, { status: 400 })
      }
      break
    case 'POST':
      try {
        const pet = await Pet.create(
          req.body
        ) /* create a new model in the database */
        NextResponse.json({ success: true, data: pet }, { status: 201 })
      } catch (error) {
        NextResponse.json({ success: false }, { status: 400 })
      }
      break
    default:
      NextResponse.json({ success: false }, { status: 400 })
      break
  }
}
