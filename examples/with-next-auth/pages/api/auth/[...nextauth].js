import NextAuth from 'next-auth'
import Providers from 'next-auth/providers'

const options = {
  site: process.env.SITE,
  providers: [
    Providers.Email({
      // SMTP connection string or nodemailer configuration object https://nodemailer.com/
      server: process.env.EMAIL_SERVER, 
      // Email services often only allow sending email from a valid/verified address
      from: process.env.EMAIL_FROM,
    }),
    // When configuring oAuth providers make sure you enabling requesting
    // permission to get the users email address (required to sign in)
    Providers.Google({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET
    }),
    Providers.Facebook({
      clientId: process.env.FACEBOOK_ID,
      clientSecret: process.env.FACEBOOK_SECRET
    }),
    Providers.Twitter({
      clientId: process.env.TWITTER_ID,
      clientSecret: process.env.TWITTER_SECRET
    }),
    Providers.GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET
    })
  ],
  // The 'database' option should be a connection string or TypeORM
  // configuration object https://typeorm.io/#/connection-options
  //
  // Notes:
  // * You need to install an appropriate node_module for your database!
  // * The email sign in provider requires a database but OAuth providers do not
  database: process.env.DATABASE_URL,

  session: {
    // Use JSON Web Tokens for session instead of database sessions.
    // This option can be used with or without a database for users/accounts.
    // Note: `jwt` is automatically set to `true` if no database is specified.
    // jwt: false, 
    
    // Seconds - How long until an idle session expires and is no longer valid.
    // maxAge: 30 * 24 * 60 * 60, // 30 days
    
    // Seconds - Throttle how frequently to write to database to extend a session.
    // Use it to limit write operations. Set to 0 to always update the database.
    // Note: This option is ignored if using JSON Web Tokens 
    // updateAge: 24 * 60 * 60, // 24 hours
    
    // Easily add custom properties to response from `/api/auth/session`.
    // Note: This should not return any sensitive information.
    /*
    get: async (session) => {
      session.customSessionProperty = "ABC123"
      return session
    }
    */
  },

  // JSON Web Token options
  jwt: {
    // secret: 'my-secret-123', // Recommended (but auto-generated if not specified)
      
    // Custom encode/decode functions for signing + encryption can be specified.
    // if you want to override what is in the JWT or how it is signed.
    // encode: async ({ secret, key, token, maxAge }) => {},
    // decode: async ({ secret, key, token, maxAge }) => {},
  
    // Easily add custom to the JWT. It is updated every time it is accessed.
    // This encrypted and signed by default and may contain sensitive information
    // as long as a reasonable secret is defined.
    /*
    set: async (token) => { 
      token.customJwtProperty = "ABC123"
      return token
    }
    */
  },

  // Control which users / accounts can sign in
  // You can use this option in conjuction with OAuth and JWT to control which
  // accounts can sign in without having to use a database.
  allowSignin: async (user, account) => {
    // Return true if user / account is allowed to sign in.
    // Return false to display an access denied message.
    return true
  },

  // You can define custom pages to override the built-in pages
  // The routes shown here are the default URLs that will be used.
  pages: {
    // signin: '/api/auth/signin',  // Displays signin buttons
    // signout: '/api/auth/signout', // Displays form with sign out button
    // error: '/api/auth/error', // Error code passed in query string as ?error=
    // verifyRequest: '/api/auth/verify-request', // Used for check email page
    // newUser: null // If set, new users will be directed here on first sign in
  },

  // Additional options
  // secret: 'abcdef123456789' // Recommended (but auto-generated if not specified)
  // debug: true, // Use this option to enable debug messages in the console
}

export default (req, res) => NextAuth(req, res, options)
