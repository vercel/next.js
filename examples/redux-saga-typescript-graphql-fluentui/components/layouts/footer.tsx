import * as React from 'react'
import { getTheme, Text } from 'office-ui-fabric-react'

const theme = getTheme()

const renderDetailsRowStyles = {
  root: {
    backgroundColor: theme.palette.themePrimary,
    color: theme.palette.white,
    lineHeight: '50px',
    padding: '0 20px',
  },
}

export const Footer: React.FunctionComponent = () => (
  <Text as="h2" nowrap block styles={renderDetailsRowStyles}>
    this is a Footer
  </Text>
)
