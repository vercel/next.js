type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function Button({ children, ...otherProps }: ButtonProps) {
  return (
    <>
      <button {...otherProps}>{children}</button>
      <style jsx>{`
        button {
          padding: 16px 16px;
          border-radius: 4px;
          font-size: 22px;
          background-image: linear-gradient(
            to right,
            rgb(255, 61, 48),
            rgb(255, 43, 97)
          );
          color: white;
          line-height: 22px;
          border: none;
          cursor: pointer;
        }
        button:hover {
          background-image: linear-gradient(
            to left,
            rgb(253, 95, 85),
            rgb(255, 85, 128)
          );
        }
      `}</style>
    </>
  );
}
