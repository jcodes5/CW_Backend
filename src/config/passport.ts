import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import { findByProvider, findByEmail, createOAuthUser, updateLastLogin } from '@/models/auth.model'
import { execute } from '@/config/database'

// ── Google OAuth Strategy ──────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/api/v1/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) {
          return done(new Error('No email provided by Google'))
        }

        // Check if user exists with this OAuth provider
        let user = await findByProvider('google', profile.id)

        if (user) {
          // Update last login
          await updateLastLogin(user.id)
          return done(null, user)
        }

        // Check if email already exists with any provider (including local)
        const existingUser = await findByEmail(email)

        if (existingUser) {
          // PRODUCTION: Link OAuth provider to existing account
          // Update the existing user with OAuth provider info
          await execute(
            'UPDATE users SET provider = ?, provider_id = ?, is_verified = 1 WHERE id = ?',
            ['google', profile.id, existingUser.id]
          )

          // Update avatar if not set
          if (!existingUser.avatar && profile.photos?.[0]?.value) {
            await execute(
              'UPDATE users SET avatar = ? WHERE id = ?',
              [profile.photos[0].value, existingUser.id]
            )
          }

          await updateLastLogin(existingUser.id)
          return done(null, { ...existingUser, provider: 'google', provider_id: profile.id })
        }

        // Create new OAuth user
        user = await createOAuthUser({
          firstName: profile.name?.givenName || profile.displayName.split(' ')[0] || 'Unknown',
          lastName: profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' ') || 'User',
          email: email,
          provider: 'google',
          providerId: profile.id,
          avatar: profile.photos?.[0]?.value,
        })

        await updateLastLogin(user.id)
        return done(null, user)
      } catch (err) {
        return done(err)
      }
    }
  )
)

// ── Facebook OAuth Strategy ────────────────────────────────────
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/api/v1/auth/facebook/callback`,
      profileFields: ['id', 'emails', 'name', 'picture'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) {
          return done(new Error('No email provided by Facebook'))
        }

        // Check if user exists with this OAuth provider
        let user = await findByProvider('facebook', profile.id)

        if (user) {
          // Update last login
          await updateLastLogin(user.id)
          return done(null, user)
        }

        // Check if email already exists with any provider (including local)
        const existingUser = await findByEmail(email)

        if (existingUser) {
          // PRODUCTION: Link OAuth provider to existing account
          // Update the existing user with OAuth provider info
          await execute(
            'UPDATE users SET provider = ?, provider_id = ?, is_verified = 1 WHERE id = ?',
            ['facebook', profile.id, existingUser.id]
          )

          // Update avatar if not set
          if (!existingUser.avatar && profile.photos?.[0]?.value) {
            await execute(
              'UPDATE users SET avatar = ? WHERE id = ?',
              [profile.photos[0].value, existingUser.id]
            )
          }

          await updateLastLogin(existingUser.id)
          return done(null, { ...existingUser, provider: 'facebook', provider_id: profile.id })
        }

        // Create new OAuth user
        user = await createOAuthUser({
          firstName: profile.name?.givenName || profile.displayName.split(' ')[0] || 'Unknown',
          lastName: profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' ') || 'User',
          email: email,
          provider: 'facebook',
          providerId: profile.id,
          avatar: profile.photos?.[0]?.value,
        })

        await updateLastLogin(user.id)
        return done(null, user)
      } catch (err) {
        return done(err)
      }
    }
  )
)

// Note: We don't use passport sessions since we use JWT tokens
// The serialize/deserialize functions are not needed for our OAuth flow

export default passport