'use server'

import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'

// Simple successful action
export async function successAction(value) {
  return { result: value + 1 }
}

// Action with multiple arguments
export async function multiArgAction(a, b, c) {
  return { sum: a + b + c }
}

// Action that redirects (should show 303 status)
export async function redirectAction(path) {
  redirect(path)
}

// Action that throws notFound (should show 404 status)
export async function notFoundAction() {
  notFound()
}

// Action that throws an error (should show 500 status)
export async function errorAction() {
  throw new Error('Intentional error for testing')
}

// Action with object argument
export async function objectArgAction(data) {
  return { received: data }
}

// Action with array argument
export async function arrayArgAction(items) {
  return { count: items.length }
}

// Inline action export for testing inline action display
export const inlineAction = async (value) => {
  return value * 2
}

// Action with promise argument
export async function promiseArgAction(promiseValue) {
  const resolved = await promiseValue
  return { resolved }
}
