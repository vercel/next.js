export default function Home() {
  return (
    <div data-test-id="1" data-custom="1a">
      <div data-custom="2">
        <h1 data-testid="3" nested={() => <div data-testid="4">nested</div>}>
          Hello World!
        </h1>
      </div>
    </div>
  )
}
