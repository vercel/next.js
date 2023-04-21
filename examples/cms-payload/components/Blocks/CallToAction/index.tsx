import React from 'react';
import { Cell, Grid } from '@faceless-ui/css-grid';
import { Page } from '../../../payload-types';
import { BackgroundColor } from '../../BackgroundColor';
import { Gutter } from '../../Gutter';
import { CMSLink } from '../../Link';
import RichText from '../../RichText';

import classes from './index.module.scss';

type Props = {
  ctaBackgroundColor?: 'white' | 'black';
  richText: {
    [k: string]: unknown;
  }[];
  links: {
    link: {
      type?: 'reference' | 'custom';
      newTab?: boolean;
      reference: {
        value: string | Page;
        relationTo: 'pages';
      };
      url: string;
      label: string;
    };
    id?: string;
  }[];
  id?: string;
  blockName?: string;
  blockType: 'cta';
}
export const CallToActionBlock: React.FC<Props> = ({ ctaBackgroundColor, links, richText }) => {
  const oppositeBackgroundColor = ctaBackgroundColor === 'white' ? 'black' : 'white';

  return (
    <Gutter>
      <BackgroundColor color={oppositeBackgroundColor}>
        <div
          className={classes.callToAction}
        >
          <Grid>
            <Cell cols={8} colsL={7} colsM={12}>
              <div>
                <RichText className={classes.richText} content={richText} />
              </div>
            </Cell>

            <Cell start={10} cols={3} startL={9} colsL={4} startM={1} colsM={12}>
              <div className={classes.linkGroup}>
                {(links || []).map(({ link }, i) => {
                  return (
                    <CMSLink
                      key={i}
                      {...link}
                    />
                  )
                })}
              </div>
            </Cell>
          </Grid>
        </div>
      </BackgroundColor>
    </Gutter>
  )
}
