# SCCS Mobile

Expo React Native app for iOS and Android. It uses the existing SCCS Supabase project, RLS policies, and Vercel APIs.

## Local setup

1. Install Node.js 22.13 or newer.
2. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable key. Never put the service-role key in the app.
3. Run `npm install` and `npx expo start`.
4. Run `npm run typecheck` and `npx expo-doctor` before committing.

The app is linked to the `@ywang9/sccs-mobile` EAS project. Development, preview, and production builds each use the matching EAS environment; the three public client variables in `.env.example` are configured remotely for all three environments.

Push notifications are enabled for Android production builds. The app requests notification permission after sign-in, registers the device with Expo Push Service, and sends notifications when an administrator publishes a school notice. Android uses the configured FCM V1 credentials and `google-services.json` client configuration.

## Features

- Shared family and teacher sign-in through Supabase Auth
- Family profile and student management
- Course browsing and registration
- Tuition calculation, Waterford discounts, and secure Stripe Checkout
- Teacher attendance for Sunday class dates
- Audience-based school announcements and Expo push token registration
- Admin Team notification publishing
