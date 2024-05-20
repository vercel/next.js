import React from 'react';

const MicroInteractions = () => {
  // Example micro interaction for a button
  const handleButtonClick = () => {
    alert('Button clicked!');
  };

  return (
    <div>
      <button onClick={handleButtonClick}>Click Me</button>
    </div>
  );
};

export default MicroInteractions;
