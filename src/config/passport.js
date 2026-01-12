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
                console.log('\n🔐 === PASSPORT GOOGLE STRATEGY ===');
                console.log('Profile ID:', profile.id);
                console.log('Email:', profile.emails?.[0]?.value);
                console.log('Name:', profile.displayName);

                try {
                    // Check if user already exists
                    console.log('🔍 Checking if user exists with Google ID...');
                    let user = await User.findOne({ googleId: profile.id });

                    if (user) {
                        console.log('✅ User found:', user.email);
                        // Update last login
                        user.lastLogin = new Date();
                        user.loginAttempts = 0;
                        await user.save();
                        console.log('✅ User updated and returning');
                        console.log('=== END PASSPORT STRATEGY ===\n');
                        return done(null, user);
                    }

                    // Check if email already exists (user might have registered differently)
                    console.log('🔍 User not found by Google ID, checking by email...');
                    const existingEmailUser = await User.findOne({
                        email: profile.emails[0].value,
                    });

                    if (existingEmailUser) {
                        console.log('✅ Found existing user by email, linking Google account...', existingEmailUser.email);
                        // Link Google account to existing user
                        existingEmailUser.googleId = profile.id;
                        existingEmailUser.isEmailVerified = true;
                        existingEmailUser.lastLogin = new Date();
                        if (!existingEmailUser.avatar && profile.photos[0]) {
                            existingEmailUser.avatar = profile.photos[0].value;
                        }
                        await existingEmailUser.save();
                        console.log('✅ Linked and returning existing user');
                        console.log('=== END PASSPORT STRATEGY ===\n');
                        return done(null, existingEmailUser);
                    }

                    // Create new user
                    console.log('📝 Creating new user...');
                    console.log('Data:', {
                        googleId: profile.id,
                        email: profile.emails[0].value,
                        name: profile.displayName,
                        role: 'buyer'
                    });

                    user = await User.create({
                        googleId: profile.id,
                        email: profile.emails[0].value,
                        name: profile.displayName,
                        avatar: profile.photos[0]?.value || null,
                        isEmailVerified: true,
                        lastLogin: new Date(),
                        role: 'buyer',
                    });

                    console.log('✅ User created successfully!', { id: user.id, email: user.email });
                    console.log('=== END PASSPORT STRATEGY ===\n');
                    return done(null, user);
                } catch (error) {
                    console.error('❌ === PASSPORT STRATEGY ERROR ===');
                    console.error('Error:', error);
                    console.error('Stack:', error.stack);
                    console.error('=== END ERROR ===\n');
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
