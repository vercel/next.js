// /app/page.tsx (Server Component)
async function myAction(a, b, c) {
  "use action";
  console.log('a')
}

export default function Page() {
   return <Button action={myAction}>Delete</Button>;
}