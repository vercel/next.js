/**
 * Configure Passport Strategies
 */
'use strict'

const passport = require('passport')

exports.configure = ({
    app = null, // Next.js App
    server = null, // Express Server
    user: User = null, // User model
    path = '/auth' // URL base path for authentication routes
  } = {}) => {
  if (app === null) {
    throw new Error('app option must be a next server instance')
  }

  if (server === null) {
    throw new Error('server option must be an express server instance')
  }

  if (User === null) {
    throw new Error('user option must be a User model')
  }

  // Tell Passport how to seralize/deseralize user accounts
  passport.serializeUser(function (user, done) {
    done(null, user.id)
  })

  passport.deserializeUser(function (id, done) {
    User.get(id, function (err, user) {
      // Note: We don't return all user profile fields to the client, just ones
      // that are whitelisted here to limit the amount of users' data we expose.
      done(err, {
        id: user.id,
        name: user.name,
        email: user.email
      })
    })
  })

  let providers = []

  // IMPORTANT! If you add a provider, be sure to add a property to the User
  // model with the name of the provider or you won't be able to log in!

  if (process.env.FACEBOOK_ID && process.env.FACEBOOK_SECRET) {
    providers.push({
      provider: 'facebook',
      Strategy: require('passport-facebook').Strategy,
      strategyOptions: {
        clientID: process.env.FACEBOOK_ID,
        clientSecret: process.env.FACEBOOK_SECRET
      },
      scope: ['email', 'user_location'],
      getUserFromProfile (profile) {
        return {
          id: profile.id,
          name: profile.displayName,
          email: profile._json.email
        }
      }
    })
  }

  if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
    providers.push({
      provider: 'google',
      Strategy: require('passport-google-oauth').OAuth2Strategy,
      strategyOptions: {
        clientID: process.env.GOOGLE_ID,
        clientSecret: process.env.GOOGLE_SECRET
      },
      scope: 'profile email',
      getUserFromProfile (profile) {
        return {
          id: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value
        }
      }
    })
  }

  if (process.env.TWITTER_KEY && process.env.TWITTER_SECRET) {
    providers.push({
      provider: 'twitter',
      Strategy: require('passport-twitter').Strategy,
      strategyOptions: {
        consumerKey: process.env.TWITTER_KEY,
        consumerSecret: process.env.TWITTER_SECRET
      },
      scope: null,
      getUserFromProfile (profile) {
        return {
          id: profile.id,
          name: profile.displayName,
          email: profile.username + '@twitter'
        }
      }
    })
  }

  // Define a Passport strategy for provider
  providers.forEach(({provider, Strategy, strategyOptions, getUserFromProfile}) => {
    strategyOptions.callbackURL = path + '/oauth/' + provider + '/callback'
    strategyOptions.passReqToCallback = true

    passport.use(new Strategy(strategyOptions, (req, accessToken, refreshToken, profile, done) => {
      try {
        // Normalise the provider specific profile into a User object
        profile = getUserFromProfile(profile)

        // See if we have this oAuth account in the database associated with a user
        User.one({[provider]: profile.id}, function (err, user) {
          if (err) {
            return done(err)
          }

          if (req.user) {
            // If the current session is signed in

            // If the oAuth account is not linked to another account, link it and exit
            if (!user) {
              return User.get(req.user.id, function (err, user) {
                if (err) {
                  return done(err)
                }
                user.name = user.name || profile.name
                user[provider] = profile.id
                user.save(function (err) {
                  return done(err, user)
                })
              })
            }

            // If oAuth account already linked to the current user, just exit
            if (req.user.id === user.id) {
              return done(null, user)
            }

            // If the oAuth account is already linked to different account, exit with error
            if (req.user.id !== user.id) {
              return done(new Error('This account is already associated with another login.'))
            }
          } else {
            // If the current session is not signed in

            // If we have the oAuth account in the db then let them sign in as that user
            if (user) {
              return done(null, user)
            }

            // If we don't have the oAuth account in the db, check to see if an account with the
            // same email address as the one associated with their oAuth acccount exists in the db
            return User.one({email: profile.email}, function (err, user) {
              if (err) {
                return done(err)
              }
              // If we already have an account associated with that email address in the databases, the user
              // should sign in with that account instead (to prevent them creating two accounts by mistake)
              // Note: Automatically linking them here could expose a potential security exploit allowing someone
              // to create an account for another users email address in advance then hijack it, so don't do that.
              if (user) {
                return done(new Error('There is already an account associated with the same email address.'))
              }

              // If account does not exist, create one for them and sign the user in
              User.create({name: profile.name, email: profile.email, [provider]: profile.id}, function (err, user) {
                if (err) {
                  return done(err)
                }
                return done(null, user)
              })
            })
          }
        })
      } catch (err) {
        done(err)
      }
    }))
  })

  // Initialise Passport
  server.use(passport.initialize())
  server.use(passport.session())

  // Add routes for provider
  providers.forEach(({provider, scope}) => {
    server.get(path + '/oauth/' + provider, passport.authenticate(provider, {scope: scope}))
    server.get(path + '/oauth/' + provider + '/callback', passport.authenticate(provider, {failureRedirect: path + '/signin'}), function (req, res) {
      // Redirect to the sign in success, page which will force the client to update it's cache
      res.redirect(path + '/success')
    })
  })

  // A catch all for providers that are not configured
  server.get(path + '/oauth/:provider', function (req, res) {
    res.redirect(path + '/not-configured')
  })

  return passport
}
