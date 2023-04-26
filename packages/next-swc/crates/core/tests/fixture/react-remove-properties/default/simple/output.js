export default function Home() {
    return <div data-custom="1a">

      <div data-custom="2">

        <h1 nested={()=><div>nested</div>}>

          Hello World!

        </h1>

      </div>

    </div>;
}
