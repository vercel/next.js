import dynamic from "next/dynamic"

const Test = dynamic(() => import(`/components/test`))
