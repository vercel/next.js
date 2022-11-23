export default function HomePage({ searchParams }) {
  const titleByCountryCode = {
    lu: 'Moien',
    _: 'Hello',
  }
  return (
    <>
      <title>
        {titleByCountryCode[searchParams.countryCode] ||
          titleByCountryCode['_']}
      </title>
    </>
  )
}
