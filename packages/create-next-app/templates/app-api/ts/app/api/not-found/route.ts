import { NextResponse } from 'next/server';
//404
export async function GET() {
  return NextResponse.json(
    { message: 'Resource not found' },
    { status: 404 }
  );
}