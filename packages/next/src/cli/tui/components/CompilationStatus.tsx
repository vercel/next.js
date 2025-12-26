import * as React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { CompilationState } from '../types'

interface CompilationStatusProps {
  compilationState: CompilationState | null
  isReady: boolean
  readyTime?: string
}

export function CompilationStatus({
  compilationState,
  isReady,
  readyTime,
}: CompilationStatusProps) {
  if (!isReady) {
    return (
      <Box gap={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text dimColor>starting</Text>
      </Box>
    )
  }

  if (compilationState?.loading) {
    const trigger = compilationState.trigger
    return (
      <Box gap={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor>compiling{trigger ? ` ${trigger}` : ''}</Text>
      </Box>
    )
  }

  if (compilationState?.errors?.length) {
    return (
      <Text color="red" bold>
        {compilationState.errors.length} error
        {compilationState.errors.length > 1 ? 's' : ''}
      </Text>
    )
  }

  return (
    <Box gap={1}>
      <Text color="green">ready</Text>
      {readyTime && <Text dimColor>in {readyTime}</Text>}
    </Box>
  )
}
