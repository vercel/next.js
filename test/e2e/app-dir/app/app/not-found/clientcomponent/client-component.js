'use client'
import { NotFound } from 'next/navigation'

export default function ClientComp() {
  throw new NotFound()
}
