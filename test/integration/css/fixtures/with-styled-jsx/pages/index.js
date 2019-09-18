export default function Home () {
  return (
    <>
      <div className='my-text'>This text should be red.</div>
      <style jsx global>{`
        .my-text {
          color: green;
        }
      `}</style>
    </>
  )
}
