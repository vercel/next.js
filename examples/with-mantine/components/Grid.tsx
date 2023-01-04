import { Box } from '@mantine/core'
import { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

const Grid = (props: Props) => {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(200px, 1fr))',
        gridGap: '1rem',
        justifyContent: 'center',
        alignItems: 'center',
        '@media (max-width: 800px)': {
          gridTemplateColumns: 'repeat(1, minmax(200px, 1fr))',
          gridGap: '0.2rem',
        },
      }}
    >
      {props.children}
    </Box>
  )
}

export default Grid
