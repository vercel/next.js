module Viewer =[%relay.query {|
  query Query_Query {
    viewer {
      ...BlogPosts_fragment
    }
  }
|}];
 
