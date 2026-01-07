const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const env = require('./env');

const configurePassport = () => {
    passport.use(
        new GoogleStrategy(
            {
                clientID: env.google.clientId,
                clientSecret: env.google.clientSecret,
                callbackURL: env.google.callbackUrl,
                passReqToCallback: true,
            },
            async (req, accessToken, refreshToken, profile, done) => {
                try {
                    // Check if user already exists
                    let user = await User.findOne({ googleId: profile.id });

                    if (user) {
                        // Update last login
                        user.lastLogin = new Date();
                        user.loginAttempts = 0; // Reset login attempts on successful login
                        await user.save();
                        return done(null, user);
                    }

                    // Check if email already exists (user might have registered differently)
                    const existingEmailUser = await User.findOne({
                        email: profile.emails[0].value,
                    });

                    if (existingEmailUser) {
                        // Link Google account to existing user
                        existingEmailUser.googleId = profile.id;
                        existingEmailUser.isEmailVerified = true;
                        existingEmailUser.lastLogin = new Date();
                        if (!existingEmailUser.avatar && profile.photos[0]) {
                            existingEmailUser.avatar = profile.photos[0].value;
                        }
                        await existingEmailUser.save();
                        return done(null, existingEmailUser);
                    }

                    // Create new user
                    user = await User.create({
                        googleId: profile.id,
                        email: profile.emails[0].value,
                        name: profile.displayName,
                        avatar: profile.photos[0]?.value || null,
                        isEmailVerified: true, // Google emails are verified
                        lastLogin: new Date(),
                        role: 'buyer', // Default role for new users
                    });

                    return done(null, user);
                } catch (error) {
                    return done(error, null);
                }
            }
        )
    );

    // Serialize user for session (we use JWT, but this is required for passport)
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });
};

module.exports = configurePassport;
