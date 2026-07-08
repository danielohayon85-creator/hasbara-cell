# מערכת ניהול תא הסברה — נפת הרטוב

כלי עבודה לתא ההסברה של נפת הרטוב — שגרה, תרגיל וחירום.
הלוגו: יש לשמור את קובץ הלוגו כ-`static/logo.png` (מוצג במסך ההתחברות, בסרגל העליון וכ-favicon; בהיעדרו המערכת עובדת רגיל).
ריכוז שאלות מהשטח, הפקת תובנות ממסמכים (Claude AI), מסרים, תיעוד פעילות, סיכומי משמרת וחיפוש.

## הפעלה מקומית

```
pip install -r requirements.txt
python server.py
```

הכתובת: http://127.0.0.1:5080

## משתמש ראשוני

בהרצה ראשונה נוצר משתמש **admin** בלבד:

- **ב-Render**: הסיסמה נוצרת אוטומטית — מופיעה תחת Environment → `ADMIN_PASSWORD` בדשבורד
- **מקומית**: הסיסמה מודפסת לטרמינל בהרצה הראשונה (או הגדר `ADMIN_PASSWORD` מראש)

לאחר הכניסה: החלף סיסמה, וצור את שאר המשתמשים (אחראי תא, משתמשים, צפייה) ממסך **הגדרות → משתמשים והרשאות**.

## הפעלת AI (תובנות ממסמכים, ניסוח הודעות, סיכומי משמרת)

1. צור מפתח API ב-https://console.anthropic.com
2. הגדר משתנה סביבה `ANTHROPIC_API_KEY` (מקומית או ב-Render Dashboard)
3. בלי מפתח — המערכת עובדת רגיל, כל השדות ניתנים למילוי ידני

מודל ברירת מחדל: `claude-sonnet-5` (ניתן לשינוי ב-`ANTHROPIC_MODEL`).

## קליטת וואטסאפ (Webhook)

ה-endpoint: `POST /api/webhook/whatsapp?token=<WHATSAPP_WEBHOOK_TOKEN>`

- תואם Twilio (שדות `From`, `Body`, `ProfileName`, `MediaUrl0..N`)
- כל הודעה נכנסת הופכת אוטומטית לשאלה חדשה במרכז השאלות
- כתובת ה-webhook המלאה מוצגת למנהל במסך ההגדרות
- כשתפתח חשבון Twilio / WhatsApp Business — הזן את הכתובת הזו כ-Incoming Message Webhook

בינתיים אפשר להשתמש בכפתור **"הדבק מוואטסאפ"** במרכז השאלות — מדביקים הודעה, המערכת מזהה שם/טלפון/תוכן.

בדיקה עם curl:

```
curl -X POST "http://127.0.0.1:5080/api/webhook/whatsapp?token=devtoken" \
  -d "From=whatsapp:+972501234567" -d "ProfileName=ישראל ישראלי" \
  -d "Body=האם יש הנחיות חדשות למרחב המוגן?"
```

(מקומית יש להריץ עם `WHATSAPP_WEBHOOK_TOKEN=devtoken`)

## פריסה ל-Render

1. `git init` + push ל-GitHub
2. Render → New → Blueprint → בחר את הריפו (`render.yaml` כבר מוכן)
3. לאחר הפריסה: הזן `ANTHROPIC_API_KEY` ב-Environment (אופציונלי)
4. הנתונים (DB + קבצים) נשמרים בדיסק מתמיד ב-`/var/data`

## מבנה

- `server.py` — Flask + SQLite, כל ה-API
- `index.html` + `static/` — ממשק SPA בעברית (RTL)
- הנתונים נשמרים ב-`data/` מקומית או `/var/data` ב-Render
