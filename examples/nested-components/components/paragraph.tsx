type ParagraphProps = {
  children: React.ReactNode;
};

export default function Paragraph({ children }: ParagraphProps) {
  return (
    <p>
      {children}
      <style jsx>{`
        p {
          font: 13px Helvetica, Arial;
          margin: 10px 0;
        }
      `}</style>
    </p>
  );
}
