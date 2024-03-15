import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { ErrorMessage } from "./error"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}