import { useEffect, useRef, useState } from 'react'
import { editor } from 'monaco-editor'

export type Language = 'javascript' | 'typescript' | 'php' | 'python'

export default function Editor(props: {
  initialValue: string
  language: Language
  onChange?: (value: string, event: editor.IModelContentChangedEvent) => void
  theme?: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
}) {
  const { initialValue, language, onChange, theme } = props
  const editorRef = useRef<HTMLDivElement>(null)

  const [monacoEditor, setMonacoEditor] =
    useState<editor.IStandaloneCodeEditor>()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [monacoModel, setMonacoModel] = useState<editor.ITextModel>()

  // Create the models & editors
  useEffect(() => {
    if (!editorRef.current) {
      throw new Error('the ref.current is null')
    }
    const model = editor.createModel(initialValue, language)
    const codeEditor = editor.create(editorRef.current, {
      theme: theme ?? 'vs-dark',
      model,
      smoothScrolling: true,
    })
    setMonacoModel(model)
    setMonacoEditor(codeEditor)
    return () => {
      codeEditor.dispose()
      model.dispose()
    }
  }, [language, initialValue, theme])

  useEffect(() => {
    if (monacoEditor && onChange) {
      monacoEditor.onDidChangeModelContent((event) => {
        onChange(monacoEditor.getValue(), event)
      })
    }
  }, [monacoEditor, onChange])

  return <div ref={editorRef} className="flex-grow" />
}
