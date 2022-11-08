import NextAuth from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import { UpstashRedisAdapter } from '@next-auth/upstash-redis-adapter'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export const authOptions = {
  adapter: UpstashRedisAdapter(redis),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async session(session) {
      return {
        ...session.session,
        user: {
          ...session.user,
          role:
            session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
              ? 'admin'
              : 'user',
        },
      }
    },
  },
}

export default NextAuth(authOptions)
