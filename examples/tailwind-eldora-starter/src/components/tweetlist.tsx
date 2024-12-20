"use client";
import React, { useState } from 'react';
import ClientTweetCard from './tweet';

import { Button } from './ui/button';

const TweetList = () => {
  // Array of tweet IDs
  const tweets = [
    "1815138485440803034",
    "1814496850134946210",
    "1823274177639440741",
    "1816926458863820880",
    "1817794180447621617",
    "1815624153707229558",
    "1816272881438892282",
  ];
  const [visibleCount, setVisibleCount] = useState(3);
  const handleShowMore = () => {
    setVisibleCount(prevCount => (prevCount === tweets.length ? 3 : tweets.length));
  };

  return (
    <div className="my-8 flex w-full flex-col space-y-4">
      {tweets.slice(0, visibleCount).map((id, index) => (
        <div key={id} >
          <ClientTweetCard 
            id={id} 
            className={`h-full w-72 min-w-72 ${index < 2 ? 'hidden md:block' : ''}`}
          />
        </div>
      ))}

      {visibleCount < tweets.length && (
        <div className='flex items-center justify-center -mt-32'>
          <Button onClick={handleShowMore} variant="secondary">Show More</Button>
        </div>
      )}
    </div>
  );
};

export default TweetList;
