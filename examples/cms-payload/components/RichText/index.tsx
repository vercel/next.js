import React from 'react';
import serialize from './serialize';

import classes from './index.module.scss';

const RichText: React.FC<{ className?: string, content: any }> = ({ className, content }) => {
  if (!content) {
    return null;
  }

  return (
    <div className={[classes.richText, className].filter(Boolean).join(' ')}>
      {serialize(content)}
    </div>
  );
};

export default RichText;
