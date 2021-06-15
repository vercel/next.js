import { useFormik } from 'formik'
import * as yup from 'yup'

const initialValue = {
  email: '',
  password: '',
}

export const useForm = () => {
  const validationSchema = yup.object().shape({
    email: yup
      .string()
      .email('Incorrect format.')
      .required('Email is required.'),
    password: yup
      .string()
      .required('Password is required')
      .min(8, 'Please enter at least 8 characters.'),
  })

  const formik = useFormik({
    initialValues: initialValue,
    validationSchema,
    validateOnChange: false,
    validateOnBlur: true,
    onSubmit: async (values) => {
      console.info(values)
    },
  })

  return {
    formik,
    disabled: !formik.isValid || formik.isSubmitting,
  }
}

const IndexPage = () => {
  const { formik, disabled } = useForm()

  return (
    <div className="container">
      <form onSubmit={formik.handleSubmit}>
        <div className="row">
          <h3 className="form-header">LOGIN</h3>
        </div>
        <div className="row">
          <input
            type={'email'}
            onChange={(e) => {
              formik.setFieldValue('email', e.target.value, true)
            }}
            onBlur={formik.handleBlur}
            name={'email'}
            value={formik.values.email}
            placeholder={'Email Address'}
            className={'form-field' + (formik.errors.email ? ' error' : '')}
          />
          {formik.errors.email && (
            <p className="error-label">{formik.errors.email}</p>
          )}
        </div>
        <div className="row">
          <input
            type={'password'}
            onChange={(e) => {
              formik.setFieldValue('password', e.target.value, true)
            }}
            onBlur={formik.handleBlur}
            name={'password'}
            value={formik.values.password}
            placeholder={'Password'}
            className={'form-field' + (formik.errors.password ? ' error' : '')}
          />
          {formik.errors.password && (
            <p className="error-label">{formik.errors.password}</p>
          )}
        </div>
        <div className="row">
          <button type={'submit'} disabled={disabled} className="btn">
            Login
          </button>
        </div>
      </form>
    </div>
  )
}

export default IndexPage
