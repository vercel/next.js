import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/dbConnect'
import Pet from '@/models/Pet'

export async function handler(req: NextRequest, res: NextResponse) {
  const id = req.nextUrl.searchParams.get('id')
  const method = req.nextUrl.searchParams.get('method')

  await dbConnect()

  switch (method) {
    case 'GET' /* Get a model by its ID */:
      try {
        const pet = await Pet.findById(id)
        if (!pet) {
          return NextResponse.json({ success: false }, { status: 400 })
        }
        NextResponse.json({ success: true, data: pet }, { status: 200 })
      } catch (error) {
        NextResponse.json({ success: false }, { status: 400 })
      }
      break

    case 'PUT' /* Edit a model by its ID */:
      try {
        const pet = await Pet.findByIdAndUpdate(id, req.json(), {
          new: true,
          runValidators: true,
        })
        if (!pet) {
          return NextResponse.json({ success: false }, { status: 400 })
        }
        NextResponse.json({ success: true, data: pet }, { status: 200 })
      } catch (error) {
        NextResponse.json({ success: false }, { status: 400 })
      }
      break

    case 'DELETE' /* Delete a model by its ID */:
      try {
        const deletedPet = await Pet.deleteOne({ _id: id })
        if (!deletedPet) {
          return NextResponse.json({ success: false }, { status: 400 })
        }
        NextResponse.json({ success: true, data: {} }, { status: 200 })
      } catch (error) {
        NextResponse.json({ success: false }, { status: 400 })
      }
      break

    default:
      NextResponse.json({ success: false }, { status: 400 })
      break
  }
}
