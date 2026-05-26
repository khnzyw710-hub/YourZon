require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

let gemini = null;
let claude = null;

function initGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_gemini_api_key_here') return null;
  return new GoogleGenerativeAI(key);
}

function initClaude() {
  const key = process.env.CLAUDE_API_KEY;
  if (!key || key === 'your_claude_api_key_here') return null;
  return new Anthropic({ apiKey: key });
}

gemini = initGemini();
claude = initClaude();

const BUSINESS_TYPE_INSIGHTS = {
  restaurant: 'מסעדות שמשדרגות את הנוכחות הדיגיטלית שלהן מדווחות על 40% יותר הזמנות אונליין',
  retail: 'חנויות עם חנות אונליין מוכרות 3 פעמים יותר מחנויות שמסתמכות רק על המכירות הפיזיות',
  clinic: 'קליניקות עם מערכת הזמנות אונליין חוסכות 15 שעות עבודה בשבוע על תיאומים טלפוניים',
  beauty: 'סלוני יופי עם אתר מקצועי וקביעת תורים אונליין מגדילים הכנסות ב-60%',
  fitness: 'מועדוני כושר עם אפליקציה מדווחים על שיפור של 45% בשימור חברים',
  law: 'משרדי עורכי דין עם אתר מקצועי מושכים 70% יותר לקוחות פוטנציאליים',
  accounting: 'רואי חשבון עם נוכחות דיגיטלית מקצועית מגדילים את בסיס הלקוחות ב-50%',
  real_estate: 'סוכני נדלן עם אתר עם גלריית נכסים מוכרים 30% מהר יותר',
  education: 'מכוני לימוד עם פלטפורמה דיגיטלית מגיעים לפי 5 יותר תלמידים',
  hotel: 'בתי מלון עם מערכת הזמנה ישירה חוסכים 25% עמלות לאתרי השוואה',
  garage: 'מוסכים עם מערכת תיאום אונליין מקטינים המתנה ב-40%',
  default: 'עסקים עם נוכחות דיגיטלית חזקה מדווחים על גידול ממוצע של 35% בהכנסות',
};

async function generateOutreachMessage(business) {
  const { name, business_type, city, website } = business;
  const insight = BUSINESS_TYPE_INSIGHTS[business_type] || BUSINESS_TYPE_INSIGHTS.default;
  const websiteStatus = website
    ? `יש להם אתר קיים (${website}) שניתן לשפר`
    : 'עדיין אין להם אתר אינטרנט';

  const prompt = `אתה מומחה שיווק דיגיטלי ישראלי המכתוב הודעות פנייה ב-WhatsApp לעסקים בשם "YourZon" - חברת פיתוח אתרים ואפליקציות.

פרטי העסק:
- שם: ${name}
- סוג: ${business_type}
- עיר: ${city}
- סטטוס דיגיטלי: ${websiteStatus}

עובדה מעניינת לשלב: "${insight}"

כתוב הודעת WhatsApp מקצועית ואישית בעברית. הדרישות:
1. פתוח ב"שלום" ושם העסק
2. משפט אחד שמראה שעשית מחקר על הסוג עסק שלהם
3. ציין את העובדה הספציפית כדרך קצרה ומשכנעת
4. הצע שיחת ייעוץ קצרה וחינמית
5. סיים עם שאלה פשוטה שמזמינה תשובה
6. אל תציין מחיר
7. עד 4 משפטים בסך הכל - תמציתי ומקצועי
8. אל תשתמש ב-emojis מוגזמים - רק 1-2 לכל היותר
9. חתום כ"[שמך] מ-YourZon"

החזר רק את ההודעה עצמה, ללא כל הסברים.`;

  try {
    if (gemini) {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      return { message: text, model: 'gemini' };
    }
  } catch (err) {
    console.error('Gemini error, falling back to Claude:', err.message);
  }

  try {
    if (claude) {
      const response = await claude.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });
      return { message: response.content[0].text.trim(), model: 'claude' };
    }
  } catch (err) {
    console.error('Claude error:', err.message);
  }

  return {
    message: generateFallbackMessage(business),
    model: 'template',
  };
}

async function generateAutoReply(business, conversationHistory, incomingMessage) {
  const historyText = conversationHistory
    .slice(-10)
    .map((m) => `${m.direction === 'outbound' ? 'אנחנו' : business.name}: ${m.content}`)
    .join('\n');

  const systemPrompt = `אתה נציג מכירות מקצועי של YourZon - חברה ישראלית לפיתוח אתרים, אפליקציות מובייל ושיווק דיגיטלי.

מידע על העסק שפנינו אליו:
- שם: ${business.name}
- סוג: ${business.business_type}
- עיר: ${business.city}

הוראות לתשובה:
1. ענה בעברית, בצורה חמה ומקצועית
2. אם שואלים על מחיר - אמור שתלוי בפרויקט ותאם שיחת ייעוץ קצרה
3. אם מביעים עניין - קבע פגישה או שיחה
4. אם שואלים שאלה טכנית - ענה בקצרה ותאם להמשיך בשיחה
5. אם לא מעוניינים - הבן בצורה מכובדת והצע להישאר בקשר
6. תשובה קצרה - עד 3 משפטים
7. אל תחזור על מה שכבר נאמר בשיחה
8. אל תשתמש ב-emojis מוגזמים`;

  const userPrompt = `היסטוריית השיחה:\n${historyText || 'ללא היסטוריה קודמת'}\n\nהודעה חדשה מ-${business.name}: "${incomingMessage}"\n\nכתוב תשובה מקצועית:`;

  try {
    if (claude) {
      const response = await claude.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 250,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      return { message: response.content[0].text.trim(), model: 'claude' };
    }
  } catch (err) {
    console.error('Claude auto-reply error, falling back to Gemini:', err.message);
  }

  try {
    if (gemini) {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      return { message: result.response.text().trim(), model: 'gemini' };
    }
  } catch (err) {
    console.error('Gemini auto-reply error:', err.message);
  }

  return {
    message: 'תודה על ההודעה! אחזור אליך בהקדם עם כל הפרטים. 🙏',
    model: 'template',
  };
}

function generateFallbackMessage(business) {
  const ownerName = process.env.OWNER_NAME || 'YourZon';
  return `שלום ${business.name}! 👋\nאני ${ownerName} מ-YourZon, חברה המתמחה בבניית אתרים ואפליקציות לעסקים.\nהייתי שמח לשתף אתכם ב-2 דקות כיצד נוכל להגדיל את נראות העסק שלכם ב-40%.\nמתי נוח לכם לשיחה קצרה?`;
}

function refreshKeys() {
  gemini = initGemini();
  claude = initClaude();
}

module.exports = { generateOutreachMessage, generateAutoReply, refreshKeys };
