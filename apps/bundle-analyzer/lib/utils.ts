import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function jsonFetcher<T>(url: string): Promise<T> {
  return fetch(url).then((res) => res.json())
}
