import { func } from 'prop-types'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import ReactMarkdown from 'react-markdown'
import ReactMde from 'react-mde'

const validations = {
  nickname: {
    required: 'Nickname should be defined',
    minLength: {
      value: 1,
      message: 'Nickname should not be empty',
    },
    maxLength: {
      value: 24,
      message: 'Nickname should be less than 24 characters',
    },
  },
  body: {
    required: 'Comment should be defined',
    minLength: {
      value: 1,
      message: 'Comment should not be empty',
    },
  },
}
const CreateComment = ({ onCreateComment }) => {
  const [selectedTab, setSelectedTab] = useState('write')
  const {
    control,
    errors,
    formState,
    handleSubmit,
    register,
    reset,
  } = useForm()

  return (
    <form
      onSubmit={handleSubmit((comment) => {
        onCreateComment(comment)
        reset({ nickname: '', body: '' })
      })}
    >
      <div className="form-group">
        <label htmlFor="nicknameTxt">Nickname</label>
        <input
          type="text"
          id="nicknameTxt"
          className={`form-control${errors.nickname ? ' is-invalid' : ''}`}
          name="nickname"
          ref={register(validations.nickname)}
        />
        {errors.nickname && (
          <small className="invalid-feedback">{errors.nickname.message}</small>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="bodyTxt">Comment</label>
        <Controller
          name="body"
          rules={validations.body}
          control={control}
          as={
            <ReactMde
              selectedTab={selectedTab}
              onTabChange={setSelectedTab}
              textAreaProps={{ id: 'bodyTxt' }}
              generateMarkdownPreview={(markdown) =>
                Promise.resolve(<ReactMarkdown source={markdown} />)
              }
            />
          }
        />
        {errors.body && (
          <small className="text-danger">{errors.body.message}</small>
        )}
      </div>
      <button
        type="submit"
        className="btn btn-primary float-right"
        disabled={formState.isSubmitting}
      >
        Add comment
      </button>
    </form>
  )
}
CreateComment.propTypes = {
  onCreateComment: func.isRequired,
}

export default CreateComment
