import React, { useState, useEffect, useCallback } from 'react';

interface IImage {
  albumId: number;
  id: number;
  thumbnailUrl: string;
  title: string;
  url: string;
}

const ImageComponent: React.FC = () => {
  const [images, setImages] = useState<IImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<IImage | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const response = await fetch('https://jsonplaceholder.typicode.com/albums/1/photos');
        const data = await response.json();
        setImages(data);
      } catch (error) {
        console.error('Error fetching images:', error);
      }
    };

    fetchImages();
  }, []);

  useEffect(() => {
    if (images.length > 0 && !selectedImage) {
      // Select a random image initially
      const randomIndex = Math.floor(Math.random() * images.length);
      setSelectedImage(images[randomIndex]);
    }
  }, [images, selectedImage]);

  const handleButtonClick = useCallback(() => {
    if (images.length > 0) {
      // Select a random image when button is clicked
      const randomIndex = Math.floor(Math.random() * images.length);
      setSelectedImage(images[randomIndex]);
    }
  }, [images]);

  return (
    <div>
      {selectedImage && <img src={selectedImage.thumbnailUrl} alt="Random Image" />}
      <button onClick={handleButtonClick}>Next Image</button>
    </div>
  );
};

export default React.memo(ImageComponent);