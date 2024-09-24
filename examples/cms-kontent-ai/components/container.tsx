type ContainerProps = {
  children: JSX.Element[] | JSX.Element;
};

export default function Container({ children }: ContainerProps) {
  return <div className="container mx-auto px-5">{children}</div>;
}
