import { CSSTransition } from "react-transition-group";
import { gsap } from "gsap";
import Home from "../components/Home";

export default function HomePage() {
  const onEnter = (node: any) => {
    gsap.from(
      [node.children[0].firstElementChild, node.children[0].lastElementChild],
      0.6,
      {
        y: 30,
        delay: 0.6,
        ease: "power3.InOut",
        opacity: 0,
        stagger: {
          amount: 0.6,
        },
      },
    );
  };
  const onExit = (node: any) => {
    gsap.to(
      [node.children[0].firstElementChild, node.children[0].lastElementChild],
      0.6,
      {
        y: -30,
        ease: "power3.InOut",
        stagger: {
          amount: 0.2,
        },
      },
    );
  };

  return (
    <>
      <div className="container">
        <CSSTransition
          in={true}
          timeout={1200}
          classNames="page"
          onExit={onExit}
          onEntering={onEnter}
          unmountOnExit
        >
          <div className="page">
            <Home />
          </div>
        </CSSTransition>
      </div>
    </>
  );
}
