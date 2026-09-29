import { createNeonAuth } from '@neondatabase/auth/next/server';

if (!process.env.NEON_AUTH_BASE_URL) {
  throw new Error(
    'NEON_AUTH_BASE_URL est absente.'
  );
}

if (!process.env.NEON_AUTH_COOKIE_SECRET) {
  throw new Error(
    'NEON_AUTH_COOKIE_SECRET est absente.'
  );
}

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET,
    sessionDataTtl: 300,
  },
});