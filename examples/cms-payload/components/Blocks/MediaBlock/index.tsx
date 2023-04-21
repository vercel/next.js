import React from 'react';
import { Gutter } from '../../Gutter';
import { Media } from '../../Media';
import { Media as MediaType } from '../../../payload-types';
import RichText from '../../RichText';
import classes from './index.module.scss';

export const MediaBlock: React.FC<{
  media?: MediaType
  caption?: string
  position?: 'default' | 'fullscreen'
  mediaBackgroundColor?: string
}> = (props) => {
  const {
    media,
    caption,
    position = 'default',
  } = props;

  return (
    <div className={classes.mediaBlock}>
      {position === 'fullscreen' && (
        <div>
          <Media
            resource={media}
          />
        </div>
      )}
      {position === 'default' && (
        <Gutter>
          <div>
            <Media
              resource={media}
            />
          </div>
        </Gutter>
      )}
      {caption && (
        <Gutter className={classes.caption}>
          <RichText content={caption} />
        </Gutter>
      )}
    </div>
  )
}
