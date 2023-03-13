// Import react-foundation components
import { Grid, Cell } from 'react-foundation'
// Own custom component
import { Card } from './Card'

export const Article = () => {
  return (
    <Grid upOnSmall={1} upOnMedium={2} upOnLarge={2}>
      <Cell className="cell">
        <Card isColumn />
      </Cell>
      <Cell>
        <Card isColumn />
      </Cell>
    </Grid>
  )
}
