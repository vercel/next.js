import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ message: "Hello World" }, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  return NextResponse.json({ message: "Data received", data }, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  return NextResponse.json({ message: "Data updated", data }, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ message: "Data deleted" }, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    headers: {
      'Allow': 'GET, POST, PUT, DELETE, OPTIONS',
      'Content-Length': '0',
    },
  });
}
