const nextHeaders = /* The APIs under 'next/headers' are async now, need to be manually awaited. */
import('next/headers')

function myFunc() {
  nextHeaders.cookies()
}

const nextHeaders2 = /* The APIs under 'next/headers' are async now, need to be manually awaited. */ import('next/headers')