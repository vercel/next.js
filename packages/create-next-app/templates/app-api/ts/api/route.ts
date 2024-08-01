import { type NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      { message: "Hello World" },
      {
        headers: { 
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal Server Error" },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    return NextResponse.json(
      { message: "Data received", data },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal Server Error" },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    return NextResponse.json(
      { message: "Data updated", data },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal Server Error" },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    return NextResponse.json(
      { message: "Data deleted" },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal Server Error" },
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    headers: {
      Allow: "GET, POST, PUT, DELETE, OPTIONS",
      "Content-Length": "0",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
