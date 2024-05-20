import React, { useState } from 'react';

const InteractiveGlossary = () => {
  const [selectedTerm, setSelectedTerm] = useState(null);
  const glossaryTerms = {
    'Cognitive Learning': 'The process of acquiring new understanding, knowledge, behaviors, skills, values, attitudes, and preferences.',
    'Curiosity': 'A quality related to inquisitive thinking such as exploration, investigation, and learning, evident by observation in humans and other animals.',
    'Mind Map': 'A diagram used to visually organize information, showing relationships among pieces of the whole.',
  };

  return (
    <div>
      <h2>Interactive Glossary</h2>
      <ul>
        {Object.keys(glossaryTerms).map((term) => (
          <li key={term} onClick={() => setSelectedTerm(term)}>
            {term}
          </li>
        ))}
      </ul>
      {selectedTerm && (
        <div>
          <h3>{selectedTerm}</h3>
          <p>{glossaryTerms[selectedTerm]}</p>
        </div>
      )}
    </div>
  );
};

export default InteractiveGlossary;
