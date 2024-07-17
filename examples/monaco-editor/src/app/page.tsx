"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { type Language } from "../components/editor";
import { ProgrammingLanguageSelector } from "@/components/programming-language-selector";

// The Editor component can only be rendered in the browser environment
const Editor = dynamic(() => import("../components/editor"), {
  ssr: false,
});

const initialCodes = {
  php: '<?php echo "Hello world!";',
  javascript: 'console.log("Hello world!")',
  typescript: 'console.log("Hello world!")',
  python: 'print("Hello world!")',
} as const;

export default function Home() {
  const [language, setLanguage] = useState<Language>("php");
  const [initialCode, setInitialCode] = useState<string>(
    initialCodes[language]
  );
  const [code, setCode] = useState<string>("");

  function onSelectLanguageChange(language: Language) {
    setLanguage(language);
    setInitialCode(initialCodes[language]);
  }

  return (
    <>
      <main className="min-h-dvh flex flex-col">
        <ProgrammingLanguageSelector
          selectedLanguage={language}
          onSelectLanguageChange={onSelectLanguageChange}
        ></ProgrammingLanguageSelector>
        <Editor
          language={language}
          initialValue={initialCode}
          onChange={(value, event) => setCode(value)}
        />
      </main>
    </>
  );
}
