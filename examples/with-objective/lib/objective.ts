import { ObjectiveClient } from "objective-sdk"

export const objective = new ObjectiveClient({
  apiKey: process.env.OBJECTIVE_API_KEY
})