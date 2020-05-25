module Fragment = [%relay.fragment
  {|
  fragment BlogPostPreview_fragment on BlogPost {
    id
    title
  }
|}
];

[@react.component]
let make = (~post) => {
  let fragment = Fragment.use(post);
  <li> {React.string(fragment.title)} </li>;
};
