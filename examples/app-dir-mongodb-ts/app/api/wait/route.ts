import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wait = Number(searchParams.get('wait'));

  // eslint-disable-next-line no-promise-executor-return
  await new Promise((resolve) => setTimeout(resolve, wait));

  return NextResponse.json(`waited ${wait}ms`);
}
