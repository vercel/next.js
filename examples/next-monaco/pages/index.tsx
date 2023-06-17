'use client'

import React, { useEffect, useRef } from 'react';
import loader from '@monaco-editor/loader';

const Editor = () => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loader.init().then((monaco) => {
      const editor = monaco.editor.create(editorRef.current!, {
        value: 'function hello() {\n\talert("Hello world!");\n}',
        language: 'javascript',
      });
    });
  }, []);

  return <div ref={editorRef} style={{ height: '100vh' }}></div>;
};

export default Editor;
