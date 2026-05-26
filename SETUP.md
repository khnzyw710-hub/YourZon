# YourZon — WhatsApp AI Automation

מערכת אוטומציה מלאה לוואטסאפ עם Gemini + Claude AI.

## מה המערכת עושה

- **שולחת 10 הודעות ביום** לעסקים ישראלים פוטנציאליים באופן אוטומטי
- **Gemini AI** מייצר הודעות פנייה מותאמות אישית לכל עסק (לפי סוג, עיר, אתר)
- **Claude AI** עונה אוטומטית לכל תגובה שמגיעה בצורה מקצועית בעברית
- **Dashboard** לניהול שיחות, עסקים, ומעקב אחרי סטטיסטיקות בזמן אמת
- **Socket.io** לעדכונים בזמן אמת ב-app

---

## התקנה והפעלה

### שלב 1 — מפתחות API

1. **Gemini API Key** (חינמי):
   - https://aistudio.google.com/app/apikey
   - לחץ "Create API Key"

2. **Claude API Key**:
   - https://console.anthropic.com/
   - Settings → API Keys → Create Key

### שלב 2 — הגדרת הבאקנד

```bash
cd backend
cp .env.example .env
```

ערוך את `backend/.env`:
```
GEMINI_API_KEY=YOUR_GEMINI_KEY
CLAUDE_API_KEY=YOUR_CLAUDE_KEY
OWNER_NAME=YourZon
```

### שלב 3 — הפעלת הבאקנד

```bash
cd backend
npm install
npm start
```

הבאקנד יאתחל את WhatsApp Web — **תראה QR code בטרמינל**.

### שלב 4 — חיבור WhatsApp

1. פתח **WhatsApp** בטלפון
2. לחץ **הגדרות** (3 נקודות) → **מכשירים מקושרים**
3. לחץ **קשר מכשיר**
4. סרוק את ה-QR code שמופיע בטרמינל

אחרי הסריקה תראה: `✅ WhatsApp Client is ready!`

### שלב 5 — הפעלת האפליקציה

```bash
# בטרמינל נפרד, בתיקיית הראשית
npm install
npm start
```

---

## ניהול המערכת

### הוספת עסקים לרשימה

דרך ה-App (טאב "עסקים") → לחץ "+ הוסף"

או API ישיר:
```bash
curl -X POST http://localhost:3001/api/businesses \
  -H "Content-Type: application/json" \
  -d '{
    "name": "מסעדת הצוק",
    "phone": "972501234567",
    "business_type": "restaurant",
    "city": "תל אביב"
  }'
```

### הוספה בכמות (CSV/JSON)

```bash
curl -X POST http://localhost:3001/api/businesses/bulk \
  -H "Content-Type: application/json" \
  -d '{"businesses": [...]}'
```

### הפעלת שליחה ידנית

```bash
curl -X POST http://localhost:3001/api/settings/scheduler/run-now
```

---

## API Endpoints

| Method | Path | תיאור |
|--------|------|-------|
| GET | /api/businesses | רשימת עסקים |
| POST | /api/businesses | הוספת עסק |
| GET | /api/businesses/stats | סטטיסטיקות |
| GET | /api/conversations | כל השיחות |
| GET | /api/conversations/:id | שיחה + הודעות |
| POST | /api/conversations/:id/send | שליחת הודעה ידנית |
| GET | /api/settings | כל ההגדרות |
| PUT | /api/settings | עדכון הגדרות |
| POST | /api/settings/api-keys | שמירת מפתחות AI |
| POST | /api/settings/scheduler/run-now | שליחה ידנית עכשיו |
| GET | /api/whatsapp/status | סטטוס WhatsApp |

---

## ארכיטקטורה

```
backend/
  server.js              — Express + Socket.io
  db.js                  — SQLite (better-sqlite3)
  services/
    whatsapp.js          — WhatsApp Web.js client
    ai.js                — Gemini + Claude dual AI
    scheduler.js         — node-cron daily sender
  routes/
    businesses.js
    conversations.js
    settings.js
    whatsapp.js
  data/
    yourzon.db           — SQLite database
    seed.js              — 30 עסקים לדוגמה

src/
  screens/
    DashboardScreen.tsx  — סטטיסטיקות + QR + הפעלה
    ConversationsScreen.tsx
    ChatScreen.tsx       — שיחה עם stage management
    BusinessesScreen.tsx
    SettingsScreen.tsx
  components/
    StatsCard.tsx
    MessageBubble.tsx    — עם AI badge (Gemini/Claude)
    ConversationItem.tsx
  hooks/
    useSocket.ts         — Socket.io real-time
  services/
    api.ts               — REST client
```

---

## פורמט מספרי טלפון

כל המספרים חייבים להיות בפורמט בינלאומי:
- ישראל: `972501234567` (972 + מספר ללא 0)
- לא: `0501234567` או `+972501234567`
