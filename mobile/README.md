# SCCS Mobile

Expo React Native app for iOS and Android. It uses the existing SCCS Supabase project, RLS policies, and Vercel APIs.

## Local setup

1. Install Node.js 22.13 or newer.
2. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable key. Never put the service-role key in the app.
3. Run `npm install` and `npx expo start`.
4. Run `npm run typecheck` and `npx expo-doctor` before committing.

Remote push notifications require a physical device and an Expo development build. Run `npx eas-cli@latest init` once to connect the project and add the EAS project ID, then run `npx eas-cli@latest build --profile development --platform all`.

## Features

- Shared family and teacher sign-in through Supabase Auth
- Family profile and student management
- Course browsing and registration
- Tuition calculation, Waterford discounts, and secure Stripe Checkout
- Teacher attendance for Sunday class dates
- Audience-based school announcements and Expo push token registration
- Admin Team notification publishing
