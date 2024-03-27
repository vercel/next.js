import React from 'react';

interface IPROPS {
    title: string;
    content: string;
}

const BlogPost = ({ title, content }: IPROPS) => {
  return (
    <div>
      <h2>{title}</h2>
      <p>{content}</p>
    </div>
  );
};

export default React.memo(BlogPost);