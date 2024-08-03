import { NextResponse } from 'next/server';

export async function GET() {
  // Internal Server Error
  const error = new Error('Internal Server Error');
  console.error(error);

  return NextResponse.json(
    { message: 'Internal Server Error' },
    { status: 500 }
  );
}