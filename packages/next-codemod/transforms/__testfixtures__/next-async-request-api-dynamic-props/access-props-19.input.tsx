function TableWrapper<D extends object = object>(
  props: TableProps<D> & { innerProps?: TableInstance<D> },
): JSX.Element {
  if (props.innerProps) {
    return <Table {...props} innerProps={props.innerProps} />;
  }

  return <UncontrolledTable {...props} />;
}