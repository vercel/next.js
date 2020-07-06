import { ErrorMessage, NestDataObject, FieldError } from 'react-hook-form'

type TFormError = {
  errors: NestDataObject<any, FieldError>
  name: string
}

type TMessage = {
  error?: string
  success?: string
}

export const FormErrorMessage = ({ errors, name }: TFormError) => {
  return (
    <ErrorMessage errors={errors} name={name}>
      {({ message }) => <p className="text-danger">{message}</p>}
    </ErrorMessage>
  )
}

export const Message = ({ error, success }: TMessage) => {
  return error ? (
    <p className="text-danger">{error}</p>
  ) : (
    <p className="text-success">{success}</p>
  )
}
