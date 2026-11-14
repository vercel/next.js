export async function foo() {
  if (true) {
    'use server'
  }
}

export async function bar() {
  try {
    'use cache'
  } catch (e) {
    'use server'
  } finally {
    'use client'
  }
}

export async function baz() {
  while (true) {
    'use cache: remote'
  }
}
