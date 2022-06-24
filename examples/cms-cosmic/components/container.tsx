type ContainerProps = {
  children,
};

const Container = (props: ContainerProps) => {
  const { children } = props;
  return (
     <div className="container mx-auto px-5">{children}</div>
  )
}

export default Container;