'use server'

export async function inc(value) {
  return value + 1
}

export async function dec(value) {
  return value - 1
}

export default async function (value) {
  return value * 2
}
