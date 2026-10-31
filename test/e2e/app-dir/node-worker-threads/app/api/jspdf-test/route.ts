import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    doc.text('Hello world!', 10, 10)
    const pdfData = doc.output('arraybuffer')

    return NextResponse.json({
      success: true,
      size: pdfData.byteLength,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
