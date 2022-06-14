import { Box, Text, TextField } from '@skynexui/components'

export default function Index() {
  return (
    <Box
      styleSheet={{
        marginVertical: {
          xs: '16px',
          md: '32px',
        },
        marginHorizontal: 'auto',
        maxWidth: '50%',
      }}
    >
      <Text tag="h1" variant="heading2">
        @skynexui/components with Next.js!
      </Text>
      <Text
        tag="p"
        styleSheet={{
          marginBottom: '16px',
        }}
      >
        Change ./pages/_app.js to modify the default theme
      </Text>
      <Box
        styleSheet={{
          backgroundColor: '#EEEEEE',
          padding: '32px',
        }}
      >
        <TextField label="Sample Field" value="Initial Value" />
      </Box>
    </Box>
  )
}
