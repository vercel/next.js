import * as React from 'react'
import { Container, Typography, Box, Link } from '@mui/joy'
import ProTip from './ProTip'

function Copyright() {
  return (
    <Typography
      textAlign="center"
      sx={{
        color: 'text.secondary',
      }}
    >
      {'Copyright © '}
      <Link href="https://mui.com/">Your Website</Link>{' '}
      {new Date().getFullYear()}.
    </Typography>
  )
}

export default function App() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography level="h4" component="h1" sx={{ mb: 2 }}>
          Material UI Vite.js example in TypeScript
        </Typography>
        <ProTip />
        <Copyright />
      </Box>
    </Container>
  )
}
