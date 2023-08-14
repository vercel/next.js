import { ForceColorScheme, ColorSchemeType } from 'nextjs-themes'

export default function PageWithForcedColorScheme({
  params: { colorScheme },
}: {
  params: { colorScheme: ColorSchemeType }
}) {
  return (
    <>
      <ForceColorScheme colorScheme={colorScheme} />
      <p>Color scheme is forced to {colorScheme}</p>
      <p>Thus, default-{colorScheme}-theme is applied</p>
    </>
  )
}
