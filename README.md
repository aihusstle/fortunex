# Amin's Auto Service — Production Website

Full Cloudflare Workers + D1 website with public booking/contact flows and a protected admin dashboard.

## Important
The requested phone number is configured as **+213674361675** in the project. This is intentionally used exactly as requested.

Before production handoff, verify the business phone/address/hours and replace any placeholder or incorrect business data in the admin settings and public copy.

## Deploy
1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npx wrangler login`.
4. Create a D1 database: `npx wrangler d1 create amins-auto-service`.
5. Put the returned database ID into `wrangler.toml`.
6. Set secrets:
   - `npx wrangler secret put JWT_SECRET`
   - `npx wrangler secret put ADMIN_PASSWORD`
7. Apply migrations: `npx wrangler d1 migrations apply DB --remote`.
8. Deploy: `npm run deploy`.
9. Open `/admin.html` and sign in with `ADMIN_EMAIL` and the `ADMIN_PASSWORD` secret.

## Included
- Responsive public website
- Service catalogue from D1
- Booking requests and collision protection
- Protected admin login with PBKDF2 password hashing + signed session token
- Booking accept/reject workflow
- Services CRUD
- Reviews management
- Contact request inbox
- Business settings
- Cloudflare Workers + D1 deployment configuration
- SEO metadata and local business structure ready for extension
