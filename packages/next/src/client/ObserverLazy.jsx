import { useState, useEffect, useRef } from 'react';
import Proptypes from 'prop-types';

/**
 * @description: Observer lazy load component, currently create a new observer for each component, not recommended for mass use
 * @param {ReactNode} children The react child elements
 * @return {ReactNode}
 */
function ObserverLazy({ children }) {
  const [childVisible, setChildVisible] = useState(false); // Show empty or real elements
  const emptyDiv = useRef(null); // Get the empty element

  useEffect(() => {
    try {
      const observer = new IntersectionObserver( // New Observer
        (changes) => {
          if (changes[0].isIntersecting && !childVisible) {
            setChildVisible(true);
            observer.disconnect(); // Close observer
          }
        },
        { rootMargin: '500px 0px' }
      );
      observer.observe(emptyDiv.current); // Observing empty elements
    } catch (err) {
      console.info('ObserverLazy IntersectionObserver error');
      console.error(err);
      setChildVisible(true);
    }
  }, []);

  return childVisible ? children : <div ref={emptyDiv} style={{ height: '30vh' }} />;
}

ObserverLazy.propTypes = {
  children: Proptypes.element,
};

export default ObserverLazy;
