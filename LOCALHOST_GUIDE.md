# Zuboc VMS - Pure Localhost Guide (Without Firebase)

This application can run **100% locally on your computer** without Firebase, cloud databases, or external quotas. All orders, packing recordings, operator accounts, and settings are saved directly to a local JSON file on your machine (`vms_data.json`).

---

## ⚡ Quick Start (3 Steps)

### 1. Install Dependencies
In your terminal inside the project directory, run:
```bash
npm install
```

### 2. (Optional) Disable Firebase Permanently
To ensure zero calls are made to Firebase and zero cloud quota is ever consumed, create or edit your `.env` file:
```env
DISABLE_FIREBASE=true
VITE_DISABLE_FIREBASE=true
```
*(You can also toggle Pure Localhost Mode directly inside the app under **Settings → Local Data & Backups**).*

### 3. Start the Local Server
```bash
npm run dev
```
Then open your browser at:
```
http://localhost:3000
```

---

## 💾 How Local Storage Works

1. **Persistent Local Database (`vms_data.json`)**:
   - Every time an order is added, imported via CSV, edited, or updated, it is instantly written to `vms_data.json` on your local hard drive.
   - When you stop and restart the server, everything is loaded back into memory automatically.
   - Quota limit: **Unlimited** (only bounded by your hard drive space).
   - Response time: **< 2 milliseconds** (in-memory + local disk).

2. **One-Click Backup & Restore**:
   - In **Settings → LOCAL DATA & BACKUPS**, click **"Download Backup (JSON)"** to get a single file containing all orders, audit logs, chat notes, and staff accounts.
   - To transfer data to another machine, click **"Restore from JSON File"** and upload your backup.

3. **Built-in Endpoints**:
   - `GET /api/storage/stats` - View current storage mode, record counts, and file size.
   - `GET /api/backup/export` - Export full database as a downloadable `.json` file.
   - `POST /api/backup/import` - Restore database from a `.json` backup payload.

---

## 🎥 Video Recording & Transcoding on Localhost
- Video packing sessions and photo evidence capture work out of the box using your local webcam/USB camera.
- Videos are transcoded locally via bundled FFmpeg (`ffmpeg-static`) with zero cloud cost.
- If Telegram credentials are configured in Settings, videos can be uploaded to your Telegram group or channel. If offline, records are still saved locally.
