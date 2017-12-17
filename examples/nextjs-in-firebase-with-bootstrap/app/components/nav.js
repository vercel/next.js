import Head from './head'

const Nav = () => (
  <nav className="navbar navbar-expand-lg navbar-dark fixed-top navbar-shrink" id="mainNav">
       <div className="container">
         <a className="navbar-brand js-scroll-trigger" href="#top">NextJS in Firebase with Bootstrap</a>
         <button className="navbar-toggler navbar-toggler-right" type="button" data-toggle="collapse" data-target="#navbarResponsive" aria-controls="navbarResponsive" aria-expanded="false" aria-label="Toggle navigation">
           Menu
           <i className="fa fa-bars"></i>
         </button>
         <div className="collapse navbar-collapse" id="navbarResponsive">
           <ul className="navbar-nav text-uppercase ml-auto">
             <li className="nav-item">
               <a className="nav-link js-scroll-trigger" href="/#start">Getting Started</a>
             </li>
             <li className="nav-item">
               <a className="nav-link js-scroll-trigger" href="/#use">How to use?</a>
             </li>
             <li className="nav-item">
               <a className="nav-link js-scroll-trigger" href="/#refs">References</a>
             </li>
             <li className="nav-item">
               <a className="nav-link js-scroll-trigger" href="https://github.com/ananddayalan/nextjs-in-firebase-with-bootstrap/issues">Issues</a>
             </li>
           </ul>
           <form className="form-inline mt-2 mt-md-0">
            <input className="form-control mr-sm-2" type="text" placeholder="Search" aria-label="Search" />
          </form>
         </div>
       </div>
    <style jsx>{`

    `}</style>
  </nav>
)

export default Nav
