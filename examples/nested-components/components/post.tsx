type PostProps = {
  title: string;
  children: React.ReactNode;
};

export default function Post({ title, children }: PostProps) {
  return (
    <div className="main">
      <h1>{title}</h1>
      {children}
      <style jsx>{`
        .main {
          font: 15px Helvetica, Arial;
          border: 1px solid #eee;
          padding: 0 10px;
        }

        h1 {
          font-size: 16px;
          font-weight: bold;
          margin: 10px 0;
        }
      `}</style>
    </div>
  );
}
