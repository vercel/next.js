import React from 'react';
import BlogPost from '../../components/BlogPost';

const BlogPostPage = () => {

  const postData = {
    title: 'New Blog Post',
    content: 'This is the content of the new blog post.',
  };

  return (
    <div>
      <h1>Blog Post</h1>
      {postData && <BlogPost title={postData.title} content={postData.content} />}
    </div>
  );
};

export default BlogPostPage;
