type ParagraphProps = {
  children: React.ReactNode;
};

export default function Paragraph({ children }: ParagraphProps) {
  return <p>{children}</p>;
}
