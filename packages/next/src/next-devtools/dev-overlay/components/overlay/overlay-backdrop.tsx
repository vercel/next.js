export type OverlayBackDropProps = {
  fixed?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export function OverlayBackdrop({ fixed, ...props }: OverlayBackDropProps) {
  return (
    <div
      data-nextjs-dialog-backdrop
      data-nextjs-dialog-backdrop-fixed={fixed ? true : undefined}
      {...props}
    />
  )
}
