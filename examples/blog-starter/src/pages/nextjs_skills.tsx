import React from 'react';
import ImageComponent from '@/components/ImageComponent';

const NextSkillsPage = () => {
  return (
    <div className='flex min-h-screen flex-col items-center justify-between p-24'>
      <h1>Next.js Skills</h1>
      <div>
        <h2>Responsive Image</h2>
        <ImageComponent />
      </div>
    </div>
  );
};

export default React.memo(NextSkillsPage);