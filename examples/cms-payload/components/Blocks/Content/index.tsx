import React from 'react';
import { Grid, Cell } from '@faceless-ui/css-grid'
import { Page } from '../../../payload-types';
import RichText from '../../RichText';
import { Gutter } from '../../Gutter';
import { CMSLink } from '../../Link';
import classes from './index.module.scss';

type Props = Extract<Page['layout'][0], { blockType: 'content' }>

const Columns: React.FC<Props> = ({
  layout,
  columnOne,
  columnTwo,
  columnThree,
}) => {

  switch (layout) {
    case 'oneColumn': {
      return (
        <Cell cols={9} colsM={4}>
          <RichText content={columnOne.richText} />
          {columnOne.enableLink && (
            <CMSLink className={classes.link} {...columnOne.link} />
          )}
        </Cell>
      )
    }

    case 'halfAndHalf':
    case 'twoThirdsOneThird': {
      let col1Cols = 6;
      let col2Cols = 6;

      if (layout === 'twoThirdsOneThird') {
        col1Cols = 8;
        col2Cols = 4;
      }

      return (
        <React.Fragment>
          <Cell cols={col1Cols} colsM={4}>
            <RichText content={columnOne.richText} />
            {columnOne.enableLink && (
              <CMSLink className={classes.link} {...columnOne.link} />
            )}
          </Cell>
          <Cell cols={col2Cols} colsM={4}>
            <RichText content={columnTwo.richText} />
            {columnTwo.enableLink && (
              <CMSLink className={classes.link} {...columnTwo.link} />
            )}
          </Cell>
        </React.Fragment>
      )
    }

    case 'threeColumns': {
      return (
        <React.Fragment>
          <Cell cols={4} colsM={4}>
            <RichText content={columnOne.richText} />
            {columnOne.enableLink && (
              <CMSLink className={classes.link} {...columnOne.link} />
            )}
          </Cell>
          <Cell cols={4} colsM={4}>
            <RichText content={columnTwo.richText} />
            {columnTwo.enableLink && (
              <CMSLink className={classes.link} {...columnTwo.link} />
            )}
          </Cell>
          <Cell cols={4} colsM={4}>
            <RichText content={columnThree.richText} />
            {columnThree.enableLink && (
              <CMSLink className={classes.link} {...columnThree.link} />
            )}
          </Cell>
        </React.Fragment>
      )
    }
  }
  
  return null
}

export const ContentBlock: React.FC<Props> = (props) => {
  return (
    <Gutter className={classes.mediaBlock}>
      <Grid>
        <Columns {...props} />
      </Grid>
    </Gutter>
  )
}