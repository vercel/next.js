const examples = [{ name: 'ex1', url: 'https://google.fr/' }]

export default () => (
  <div>
    {examples.map(example => (
      <div key={example.name}>
        {example.name} - {example.url}
      </div>
    ))}
  </div>
)