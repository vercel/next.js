// TODO
// import React, { Component } from 'react'

// export default class Index extends Component {
//   static getInitialProps() {
//     return { color: 'aquamarine' }
//   }

//   render() {
//     return (
//       <div>
//         {[1, 2].map(idx => (
//           <div key={idx}>
//             {[3, 4].map(idx2 => (
//               <div key={idx2}>{this.props.color}</div>
//             ))}
//           </div>
//         ))}
//         {[1, 2].map(idx => (
//           <div key={idx}>
//             <div>
//               {this.props.color}
//               <div className="something">
//                 <React.Fragment>
//                   <div>
//                     <div>{this.props.color} hello there</div>
//                   </div>
//                 </React.Fragment>
//               </div>
//             </div>
//           </div>
//         ))}
//         <style jsx>{`
//           div {
//             background: ${this.props.color};
//           }
//         `}</style>
//       </div>
//     )
//   }
// }
