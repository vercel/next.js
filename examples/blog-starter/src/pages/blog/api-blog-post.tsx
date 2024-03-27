import React, { useState, useEffect } from 'react';
import { notFound } from 'next/navigation';
import BlogPost from '../../components/BlogPost';

interface IALBUMDATA {
    id: number;
    title: string;
    userId: number;
}

const ApiBlogPostPage = () => {
  const [albumData, setAlbumData] = useState<IALBUMDATA[] | null>(null);

  useEffect(() => {
    const fetchAlbumData = async () => {
      try {
        const response = await fetch('https://jsonplaceholder.typicode.com/users/1/albums');
        const data = await response.json();
        setAlbumData(data);
      } catch (error) {
        console.error('Error fetching album data:', error);
      }
    };

    fetchAlbumData();
  }, []);

  if(albumData?.length === 0){
    return notFound();
  }

  return (
    <div>
      <h1>API Blog Post</h1>
      {albumData?.map((album: IALBUMDATA) => (
        <BlogPost key={album.id} title={album.title} content={`User ID: ${album.userId}`} />
      ))}
    </div>
  );
};

export default React.memo(ApiBlogPostPage);