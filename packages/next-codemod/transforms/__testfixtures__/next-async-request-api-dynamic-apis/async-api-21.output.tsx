const nextHeaders = /* @next-codemod-error The APIs under 'next/headers' are async now, need to be manually awaited. */
import('next/headers')

function myFunc() {
  nextHeaders.cookies()
}

const nextHeaders2 = /* @next-codemod-error The APIs under 'next/headers' are async now, need to be manually awaited. */ import('next/headers')