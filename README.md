# VeloxWebStudio — Requirements Form + Supabase Backend

Responsive multi-step website requirements form, Vercel serverless submission endpoint, private Supabase Storage, PostgreSQL schema, and a Supabase-authenticated admin dashboard.

## Project structure

```text
veloxwebstudio-frontend/
├── index.html
├── admin.html
├── package.json
├── vercel.json
├── .env.example
├── api/
│   └── submit.js
├── src/
│   ├── styles/
│   │   ├── styles.css
│   │   └── admin.css
│   └── scripts/
│       ├── app.js
│       ├── config.js
│       └── admin.js
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## Changes in this version
- Removed preferred project start date, expected launch date and project urgency.
- Added currencies for Oman (OMR), UAE (AED), France/Eurozone (EUR), and additional international currencies.
- Removed company mission and values, main strengths and expertise, team size, preferred contact method and best time to contact.
- Removed the “Frontend preview mode” notice; the final review now explains that submitted information is handled by the configured backend.
- Form submission now posts to `/api/submit`.
- API saves client details, all form answers, website requirements, projects and image metadata in Supabase.
- Logo, team photos, project images and before/after images are uploaded to a private Storage bucket.
- Protected admin login can review enquiries and update status/internal notes.

## 1. Create Supabase project
1. Create a project in the Supabase dashboard.
2. Open **SQL Editor**.
3. Run `supabase/migrations/001_initial_schema.sql`.
4. In **Project Settings → API**, copy the Project URL and publishable/anon key.
5. In **Authentication → Users**, create an admin user with email and password.
6. Copy that user's UUID, then run this query in SQL Editor, replacing the UUID:
   ```sql
   insert into public.admin_users (user_id)
   values ('PASTE-ADMIN-AUTH-USER-UUID-HERE');
   ```
7. Keep the `client-uploads` bucket private. The migration creates it and its admin read policy.

## 2. Configure the admin frontend
Edit `src/scripts/config.js`:
```js
window.VELOX_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```
The publishable/anon key is intended for browser use with RLS enabled. **Never put the service-role key here.**

## 3. Configure Vercel
1. Push the project to a GitHub repository.
2. Import the repository in Vercel.
3. Add these environment variables in Vercel Project Settings → Environment Variables:
   - `SUPABASE_URL` — Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role/secret key (server only)
4. Deploy. Vercel installs the dependencies in `package.json`.
5. Open `/` for the client form and `/admin.html` for the admin login.

Do not commit `.env` files, service-role keys, or other secrets to GitHub.

## 4. Local development
- Install Node.js 20 or later.
- Run `npm install`.
- Set server variables in a local `.env` file (do not commit it).
- Use Vercel CLI (`npx vercel dev`) to test API routes locally; opening `index.html` through a static Live Server will not run `/api/submit`.
- Add Supabase URL and publishable key to `src/scripts/config.js` for admin UI.

## 5. Data and upload behavior
- Required client details, all selected website requirements, budget/currency, design details and additional answers are stored in `clients.website_requirements` related records and `raw_answers`.
- Projects are stored in `projects`, with their images in `project_images`.
- Team images and logo metadata are saved separately.
- Uploaded files are stored as objects in the private `client-uploads` bucket; only storage paths and metadata are stored in PostgreSQL.
- The backend validates required fields, email, budget, project details, file types and sizes. It includes a basic in-memory rate guard and compensating cleanup for failed submissions.
- Admin dashboard uses Supabase Auth and RLS; only users listed in `admin_users` can read enquiries or update status/notes.
- Admins can request short-lived signed URLs to open private uploaded files; URLs expire after 60 seconds.

## Important production notes
- The server-side API uses the service-role key to accept public submissions, so keep that key secret.
- The in-memory rate guard is best-effort and may reset across serverless instances. For higher-volume production, add a durable rate limiter and CAPTCHA/Turnstile.
- File validation is repeated server-side. For SVG logos, consider adding SVG sanitization or convert SVGs to raster before displaying them.
- The admin dashboard can open private uploads using short-lived signed URLs after the authenticated admin passes the Storage RLS policy. The bucket remains private; these links expire after 60 seconds.
- This package was generated but not connected to your real Supabase project. You must run the SQL, set keys, deploy, and test a real submission before using it with clients.
