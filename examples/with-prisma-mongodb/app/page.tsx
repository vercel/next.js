import { prisma } from "@/lib/prisma";
// Please ensure you import it as follows for database operations to work correctly:
// import { prisma } from "@/lib/prisma";




export default async function Home() {

  const [
    userCount,
    postCount
  ] = await Promise.all([
    getUserCount(),
    getPostCount()
  ])

  return (
    <div>
      <label>
        <b>User Count:</b> {userCount}
      </label>
      <br/>
      <label>
        <b>Post Count:</b> {postCount}
      </label>
    </div>
  );
}

async function getPostCount(): Promise<number> {

  try {
    
    const postCount = await prisma.post.count()

    return postCount
  } catch (error) {
    console.log('Error: ', error)

    return 0
  }
}

async function getUserCount(): Promise<number> {
  try {
    
    const userCount = await prisma.user.count()

    return userCount
  } catch (error) {
    console.log('Error: ', error)

    return 0
  }
}
