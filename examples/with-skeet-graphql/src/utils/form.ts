import { z } from 'zod'

export const emailSchema = z.string().email()
export const passwordSchema = z.string().min(8)
export const usernameSchema = z.string().min(1).max(20)
export const privacySchema = z.boolean().refine((v) => v === true)

export type GPTModel = 'gpt-3.5-turbo' | 'gpt-4'
export const allowedGPTModel: GPTModel[] = ['gpt-3.5-turbo', 'gpt-4']
export const gptModelSchema = z.union([
  z.literal('gpt-3.5-turbo'),
  z.literal('gpt-4'),
])

export const maxTokensSchema = z.number().int().min(100).max(4096)
export const temperatureSchema = z.number().min(0).max(2)
export const systemContentSchema = z.string().min(1).max(1000)
export const chatContentSchema = z.string().min(1).max(100000)
