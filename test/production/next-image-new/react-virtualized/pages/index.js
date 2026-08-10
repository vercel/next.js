import Image from 'next/image'
import img from '../public/test.jpg'
import { WindowScroller, List as VirtualizedList } from 'react-virtualized'

export default function Home() {
  return (
    <div>
      <WindowScroller serverHeight={800}>
        {({ height, isScrolling, onChildScroll, scrollTop }) => (
          <VirtualizedList
            autoHeight
            height={height}
            isScrolling={isScrolling}
            onScroll={onChildScroll}
            scrollTop={scrollTop}
            width={810}
            rowCount={5}
            estimatedRowSize={10}
            rowHeight={400}
            rowRenderer={() => {
              return (
                <div>
                  <Image src={img} placeholder="blur" className="thumbnail" />
                  <Image src={img} className="large" />
                </div>
              )
            }}
            overscanRowCount={0}
          />
        )}
      </WindowScroller>
    </div>
  )
}
