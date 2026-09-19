# Lilliput Play School – Data Management System (Bhavesh Sangwan)

Custom internal application for managing attendance follow-up, fees, parent communication and child records.

Built from the research findings of the qualitative case study at Lilliput Play School, Charkhi Dadri.

---

## What this solves

| Research Problem | How the app solves it |
|------------------|-----------------------|
| Data fragmented across paper, Excel, WhatsApp | Single shared system |
| Delayed updates & unclear ownership | Clear status + “Action By” field |
| Informal workarounds | Shared follow-up log visible to all staff |
| Need for simple tools | Clean, mobile-friendly screens |

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Database + Auth**: Supabase (PostgreSQL + Auth)
- **Hosting**: Vercel (frontend) + Supabase Cloud (backend)

You fully own the code and the data.

---

## Setup Instructions (Step by Step)

### 1. Create a free Supabase project

1. Go to [https://supabase.com](https://supabase.com) → Sign up / Login
2. Click **New Project**
3. Give it a name (e.g. `lilliput-school`)
4. Set a strong database password (save it)
5. Choose a region close to you
6. Wait for the project to be ready

### 2. Run the database schema

1. In Supabase Dashboard go to **SQL Editor**
2. Open the file `supabase/schema.sql` from this project
3. Copy the entire content and paste into the SQL Editor
4. Click **Run**
5. You should see “Success”

### 3. Get your API keys

1. In Supabase go to **Project Settings → API**
2. Copy:
   - **Project URL**
   - **anon public** key

### 4. Configure the application

```bash
cd lilliput-school
cp .env.local.example .env.local
```

Open `.env.local` and paste your keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

### 5. Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Create the first staff account

1. Go to `/login`
2. Click **Sign Up**
3. Enter name, role, email, password
4. Login

### 7. Add children

Go to **Children** page → Add the students of the school.

---

## Deploying to the internet (optional)

### Frontend (Vercel – free)

1. Push the code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import the repository
3. Add the same two environment variables
4. Deploy

### Database

Already running on Supabase Cloud (free tier is enough for a preschool).

---

## Project Structure

```
lilliput-school/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Dashboard
│   │   ├── login/page.tsx        ← Login / Sign up
│   │   ├── attendance/page.tsx   ← Core module
│   │   ├── fees/page.tsx
│   │   ├── communication/page.tsx
│   │   └── children/page.tsx
│   ├── components/
│   │   └── AppShell.tsx
│   ├── lib/supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── middleware.ts             ← Protects routes
├── supabase/
│   └── schema.sql                ← Database tables
└── .env.local.example
```

---

## Next improvements (can be added later)

- Add form for Fees and Communication
- Child Progress Notes module
- Daily Handover module
- Role-based permissions (Director sees everything, Teacher sees limited)
- Weekly Review screen
- Export to Excel

---

## Support

This is the first production-ready version.  
You can now host it yourself and fully control the data.
