import { Anchor, Text } from '@mantine/core'

type Props = {
  title: string
  description: string
  link: string
}

const Card = (props: Props) => {
  return (
    <Anchor
      href={props.link}
      target="_blank"
      sx={{
        border: '1px solid #eaeaea',
        margin: '1rem',
        padding: '1.5rem',
        borderRadius: '10px',
        textAlign: 'left',
        color: 'black',
        maxWidth: '300px',
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          borderColor: '#0070f3',
          color: '#0070f3',
        },
      }}
    >
      <Text
        component="h2"
        sx={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          textAlign: 'left',
        }}
      >
        {props.title}
      </Text>
      <Text
        component="p"
        sx={{
          fontSize: '1rem',
          textAlign: 'left',
        }}
      >
        {props.description}
      </Text>
    </Anchor>
  )
}

export default Card
