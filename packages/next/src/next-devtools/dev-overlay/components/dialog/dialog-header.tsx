type DialogHeaderProps = React.HTMLAttributes<HTMLDivElement>

export function DialogHeader(props: DialogHeaderProps) {
  return (
    <div data-nextjs-dialog-header {...props}>
      {props.children}
    </div>
  )
}
