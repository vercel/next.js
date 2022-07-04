
import { NextResponse } from 'next/server'
import { basename } from "path"

export async function middleware(request) {
  basename()
  return NextResponse.next()
}