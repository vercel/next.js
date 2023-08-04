import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai'
import { IncomingMessage } from 'http'

export const chat = async (
  createChatCompletionRequest: CreateChatCompletionRequest,
  organization: string,
  apiKey: string
) => {
  const configuration = new Configuration({
    organization,
    apiKey,
  })
  const openai = new OpenAIApi(configuration)
  const completion = await openai.createChatCompletion(
    createChatCompletionRequest
  )
  return completion.data.choices[0].message
}

export const streamChat = async (
  createChatCompletionRequest: CreateChatCompletionRequest,
  organization: string,
  apiKey: string
) => {
  const configuration = new Configuration({
    organization,
    apiKey,
  })
  const openai = new OpenAIApi(configuration)
  try {
    const result = await openai.createChatCompletion(
      createChatCompletionRequest,
      {
        responseType: 'stream',
      }
    )

    const stream = result.data as unknown as IncomingMessage
    return stream
  } catch (error) {
    throw new Error(`streamChat error: ${error}`)
  }
}
