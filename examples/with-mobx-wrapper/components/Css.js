import React from 'react'

const Css = () => (
  <div>
    <style jsx global>
      {`
        * {
          box-sizing: border-box;
        }

        #nprogress {
          pointer-events: none;
        }

        #nprogress .bar {
          background: #29d;

          position: fixed;
          z-index: 1031;
          top: 0;
          left: 0;

          width: 100%;
          height: 2px;
        }

        /* Fancy blur effect */
        #nprogress .peg {
          display: block;
          position: absolute;
          right: 0px;
          width: 100px;
          height: 100%;
          box-shadow: 0 0 10px #29d, 0 0 5px #29d;
          opacity: 1;

          -webkit-transform: rotate(3deg) translate(0px, -4px);
          -ms-transform: rotate(3deg) translate(0px, -4px);
          transform: rotate(3deg) translate(0px, -4px);
        }

        /* Remove these to get rid of the spinner */
        #nprogress .spinner {
          display: block;
          position: fixed;
          z-index: 1031;
          top: 15px;
          right: 15px;
        }

        #nprogress .spinner-icon {
          width: 18px;
          height: 18px;
          box-sizing: border-box;

          border: solid 2px transparent;
          border-top-color: #29d;
          border-left-color: #29d;
          border-radius: 50%;

          -webkit-animation: nprogress-spinner 400ms linear infinite;
          animation: nprogress-spinner 400ms linear infinite;
        }

        .nprogress-custom-parent {
          overflow: hidden;
          position: relative;
        }

        .nprogress-custom-parent #nprogress .spinner,
        .nprogress-custom-parent #nprogress .bar {
          position: absolute;
        }

        @-webkit-keyframes nprogress-spinner {
          0% {
            -webkit-transform: rotate(0deg);
          }
          100% {
            -webkit-transform: rotate(360deg);
          }
        }
        @keyframes nprogress-spinner {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .users {
          display: grid;
          gap: 0.5rem 0.5rem;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }
        .users > section {
          background: #f7f7f7;
          border-radius: 10px;
          padding: 18px;
          cursor: pointer;
          position: relative;
          border: 1px solid #e7e7e7;
        }
        .users > section h4 {
          margin: 0;
        }
        .users > section:after {
          content: '❯';
          position: absolute;
          top: 50%;
          right: 10px;
          transform: translateY(-50%);
        }

        .users a {
          color: inherit;
          text-decoration: none;
        }

        .wrapper-detail {
          display: flex;
          flex-wrap: wrap;
        }
        .wrapper-detail .basic,
        .repository {
          flex: 0 0 300px;
          border: 1px solid #e7e7e7;
          border-radius: 5px;
          margin-right: 20px;
          padding: 15px;
          background: #f7f7f7;
          margin-bottom: 20px;
          max-width: 100%;
        }

        .wrapper-detail .basic img {
          border-radius: 5px;
          max-width: 100%;
        }
        .wrapper-detail .repositories {
          flex: 1;
          min-width: 320px;
          max-width: 100%;
        }
        .repository {
          margin-bottom: 20px;
        }
      `}
    </style>
  </div>
)

export default Css
