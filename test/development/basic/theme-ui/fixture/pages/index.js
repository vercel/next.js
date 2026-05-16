export default function Home() {
  return (
    <div
      id="hello"
      sx={{
        fontWeight: 'bold',
        fontSize: 4, // picks up value from `theme.fontSizes[4]`
        color: 'primary', // picks up value from `theme.colors.primary`
      }}
    >
      Hello
    </div>
  )
}
