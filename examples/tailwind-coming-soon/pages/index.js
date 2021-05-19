import React, { useState } from 'react'
import Image from "next/image" 

function Index() {

  const [days,setDays]=useState("00")
  const [hours,setHours]=useState("00")
  const [minutes,setMinutes]=useState("00")
  const [seconds,setSeconds]=useState("00")
  const [launching,setLaunching]=useState(false)



  /* put your launching date here in the same format */
  
  const countDate=new Date("December 17, 2021 19:00:00").getTime()

  const now = new Date().getTime()
 

  const gap=countDate-now
  


 


let x =setTimeout(()=>{
  setDays(Math.floor(gap / (1000 * 60 * 60 * 24)));
  setHours(Math.floor((gap % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
   setMinutes(Math.floor((gap % (1000 * 60 * 60)) / (1000 * 60)));
   setSeconds(Math.floor((gap % (1000 * 60)) / 1000));

if(gap < 0){
  clearTimeout(x)
  setLaunching(true)
  return ;

}

},1000)


if(launching){
  return <div className="text-2xl flex justify-center items-center h-screen">

wohoooo we are launching in a few.....

  </div>
}

  return (
    <div className="flex flex-col text-center justify-center items-center min-h-screen">
      <div>


        <h2 className="text-7xl  font-bold pb-11">Coming soon</h2>
        <div className="flex justify-center  gap-x-10 sm:gap-x-14 lg:gap-x-20 pb-11">
          {/* day */}
          <div>
            <h3 className="text-4xl">{days}</h3>
            <h3>Day</h3>

          </div>

          {/* hour */}
          <div>
            <h3 className="text-4xl">{hours}</h3>
            <h3>Hour</h3>

          </div>
          {/* minute */}
          <div>
            <h3 className="text-4xl">{minutes}</h3>
            <h3>Minute</h3>

          </div>
          {/* second */}
          <div>
            <h3 className="text-4xl" >{seconds}</h3>
            <h3>Second</h3>

          </div>


        </div>
      </div>
{/* put your image here */}
      <Image src="/count.png" width="600" height="400" />
      
    </div>
  )
}

export default Index
