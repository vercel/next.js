import dynamic from 'next/dynamic'
import somethingElse from 'something-else'

const DynamicComponent = dynamic(() => import('../components/hello'))
somethingElse.dynamic('should not be transformed')
