# DocShare

A minimal private document sharing app for two people.
No accounts, no database setup UI — just one shared password and a clean file dashboard.

---

## What it does

- Password-protected dashboard (one shared password for both users)
- Upload PDFs, Word docs, text files, and images (up to 10 MB)
- View all uploaded files with name and date
- Download any file
- Delete files
- Fully mobile-responsive

## Tech Stack

| Layer       | Technology                     |
|-------------|--------------------------------|
| Frontend    | HTML, CSS, Vanilla JavaScript  |
| Backend     | Vercel Serverless Functions    |
| Database    | MongoDB Atlas (metadata)       |
| File Storage| Cloudinary (actual files)      |

---

## Folder Structure

```
docshare/
├── public/                  ← Static frontend files (served by Vercel)
│   ├── index.html           ← Main page (login + dashboard)
│   ├── css/
│   │   └── style.css        ← All styles
│   └── js/
│       └── app.js           ← All frontend JavaScript
│
├── api/                     ← Serverless functions (Vercel runs these)
│   ├── auth.js              ← POST /api/auth   — check password, return token
│   ├── upload.js            ← POST /api/upload — upload file
│   ├── files.js             ← GET  /api/files  — list all files
│   ├── delete.js            ← DELETE /api/delete — delete a file
│   └── _utils.js            ← Shared helpers (token verify, MongoDB connect)
│
├── .env.example             ← Template for environment variables
├── .gitignore
├── package.json
├── vercel.json              ← Vercel routing config
└── README.md
```

---

## Setup Instructions

### Step 1 — Get your accounts ready

You need three free accounts:

1. **Vercel** — [vercel.com](https://vercel.com) (hosts the app)
2. **MongoDB Atlas** — [cloud.mongodb.com](https://cloud.mongodb.com) (stores file metadata)
3. **Cloudinary** — [cloudinary.com](https://cloudinary.com) (stores actual files)

---

### Step 2 — Set up MongoDB Atlas

1. Create a free account at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Click **"Build a Database"** → choose **Free (M0)**
3. Choose a cloud provider and region, click **Create**
4. Create a database user (remember the username & password)
5. Under **Network Access**, click **"Add IP Address"** → choose **"Allow Access from Anywhere"** (`0.0.0.0/0`)
   - This is required for Vercel's serverless functions to connect
6. Click **Connect** → **Drivers** → copy the connection string
   - It looks like: `mongodb+srv://username:password@cluster.mongodb.net/`
   - Replace `<password>` with your actual database user password

---

### Step 3 — Set up Cloudinary

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. From the dashboard, copy:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

---

### Step 4 — Configure environment variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in your values:
   ```
   DOCSHARE_PASSWORD=your-chosen-password
   DOCSHARE_SECRET=any-long-random-string
   MONGODB_URI=mongodb+srv://...
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```

3. To generate a secure `DOCSHARE_SECRET`:
   ```bash
   openssl rand -hex 32
   ```

---

### Step 5 — Run locally

```bash
# Install dependencies
npm install

# Install Vercel CLI (if you don't have it)
npm install -g vercel

# Log in to Vercel
vercel login

# Start local dev server (reads .env.local automatically)
vercel dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Step 6 — Deploy to Vercel

1. Push your code to a GitHub repository (make sure `.env.local` is in `.gitignore`)

2. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repo

3. Before clicking **Deploy**, go to **Environment Variables** and add all 6 variables:
   - `DOCSHARE_PASSWORD`
   - `DOCSHARE_SECRET`
   - `MONGODB_URI`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

4. Click **Deploy** — Vercel will build and publish your app

5. Share the URL and password with the other person!

---

## How it works (for beginners)

```
User enters password
       ↓
Browser sends POST /api/auth
       ↓
Server checks password matches DOCSHARE_PASSWORD env var
       ↓
Server returns a signed token (like a temporary key)
       ↓
Browser stores token in sessionStorage
       ↓
Every future API call includes this token in a header
       ↓
Server checks the token before doing anything
```

For uploads:
```
User picks a file
       ↓
Browser sends file to POST /api/upload
       ↓
Server uploads file to Cloudinary → gets back a URL
       ↓
Server saves {fileName, fileUrl, uploadedAt} to MongoDB
       ↓
Browser refreshes the file list
```

---

## Customisation

- **Change the app name**: Edit "DocShare" in `index.html` and `style.css`
- **Change file size limit**: Edit `10 * 1024 * 1024` in `api/upload.js`
- **Change allowed file types**: Edit the `allowedTypes` array in `api/upload.js` and `accept` in `index.html`
- **Change colours**: Edit the CSS variables at the top of `style.css`
