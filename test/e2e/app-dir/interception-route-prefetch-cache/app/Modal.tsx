interface ModalProps {
  title: string
  context: string
}

export function Modal({ title, context }: ModalProps) {
  return (
    <div>
      <div className="modal">
        <h1>{title}</h1>
        <h2>{context}</h2>
      </div>
    </div>
  )
}
