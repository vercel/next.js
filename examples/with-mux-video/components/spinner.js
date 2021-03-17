export default function Spinner({ size = 6, color = '#999' }) {
  return (
    <>
      <div className="spinner" />
      <style jsx>{`
        .spinner,
        .spinner:after {
          border-radius: 50%;
          width: 10em;
          height: 10em;
        }
        .spinner {
          margin: 60px auto;
          font-size: ${size}px;
          position: relative;
          text-indent: -9999em;
          border-top: 1.1em solid ${color};
          border-right: 1.1em solid ${color};
          border-bottom: 1.1em solid ${color};
          border-left: 1.1em solid transparent;
          -webkit-transform: translateZ(0);
          -ms-transform: translateZ(0);
          transform: translateZ(0);
          -webkit-animation: load8 1.1s infinite linear;
          animation: load8 1.1s infinite linear;
        }
        @-webkit-keyframes load8 {
          0% {
            -webkit-transform: rotate(0deg);
            transform: rotate(0deg);
          }
          100% {
            -webkit-transform: rotate(360deg);
            transform: rotate(360deg);
          }
        }
        @keyframes load8 {
          0% {
            -webkit-transform: rotate(0deg);
            transform: rotate(0deg);
          }
          100% {
            -webkit-transform: rotate(360deg);
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  )
}
