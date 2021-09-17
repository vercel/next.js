import { themeClass, header, headingOne} from "./index.css.js";

const Home = () => { 
  return (
    <main>
      <header className={`${themeClass}`}>
        <div className={`${header}`}>
          <h1 className={`${headingOne}`}>
              This is a very basic example of using vanilla-extract in javascript with next.js
          </h1>
        </div>
      </header>
    </main>
  )
}

export default Home;
