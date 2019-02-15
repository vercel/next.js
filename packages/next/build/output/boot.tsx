import React from 'react'
import { render, Color, Text } from 'ink'

export let lastAppUrl: string | null = null

export function startingDevelopmentServer(appUrl: string) {
  lastAppUrl = appUrl

  render(<Color cyan>Starting the development server ...</Color>)
}
