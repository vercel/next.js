/**
 * Integration test for #46078
 * Tests that TypeScript with moduleResolution=nodenext can resolve Next.js modules
 */

import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import Router from 'next/router'
import type { NextPage } from 'next'

// This file should compile without errors when using:
// - "type": "module" in package.json
// - "moduleResolution": "NodeNext" in tsconfig.json

const Page: NextPage = () => {
  // Type-checking validates module resolution works
  const modules = {
    Head,
    Image,
    Link,
    Router
  }
  
  return null
}

export default Page
