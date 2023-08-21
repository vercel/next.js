import React from 'react';

interface ButtonProps {
  text: string;
  onClick?: () => void;
  backgroundColor: String;
}

const Button: React.FC<ButtonProps> = ({ text, onClick , backgroundColor }) => {
  return (
    <button
      onClick={onClick}
      className={`bg-${backgroundColor} rounded-3xl py-5 px-5 text-white border-2 border-${backgroundColor}`}
    >
      {text}
    </button>
  );
};

export default Button;
