import React from 'react';
import { Cell, Grid } from '@faceless-ui/css-grid';
import { Page } from '../../../payload-types';
import { Gutter } from '../../Gutter';
import RichText from '../../RichText';
import { VerticalPadding } from '../../VerticalPadding';

import classes from './index.module.scss'

export const LowImpactHero: React.FC<Page['hero']> = ({ richText }) => {
  return (
    <Gutter>
      <Grid>
        <Cell cols={8} colsL={10}>
          <VerticalPadding>
            <RichText className={classes.richText} content={richText} />
          </VerticalPadding>
        </Cell>
      </Grid>
    </Gutter>
  )
}