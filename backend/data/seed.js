const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const SAMPLE_BUSINESSES = [
  { name: 'מסעדת הים הכחול', phone: '972501111001', business_type: 'restaurant', city: 'תל אביב', website: null },
  { name: 'קפה הרוח', phone: '972501111002', business_type: 'restaurant', city: 'חיפה', website: null },
  { name: 'מסעדת הזית', phone: '972501111003', business_type: 'restaurant', city: 'ירושלים', website: null },
  { name: 'סלון יופי ורד', phone: '972501111004', business_type: 'beauty', city: 'רמת גן', website: null },
  { name: 'אורה ספא ויופי', phone: '972501111005', business_type: 'beauty', city: 'הרצליה', website: null },
  { name: 'פיט גיים כושר', phone: '972501111006', business_type: 'fitness', city: 'תל אביב', website: null },
  { name: 'סטודיו עוצמה', phone: '972501111007', business_type: 'fitness', city: 'ראשון לציון', website: null },
  { name: 'משרד עו"ד כהן ושות\'', phone: '972501111008', business_type: 'law', city: 'תל אביב', website: null },
  { name: 'רו"ח לוי ואסוציאציה', phone: '972501111009', business_type: 'accounting', city: 'בני ברק', website: null },
  { name: 'חנות הברק אלקטרוניקה', phone: '972501111010', business_type: 'retail', city: 'פתח תקווה', website: null },
  { name: 'בוטיק מודה ישראל', phone: '972501111011', business_type: 'retail', city: 'תל אביב', website: null },
  { name: 'קליניקת שיניים ד"ר ברק', phone: '972501111012', business_type: 'clinic', city: 'גבעתיים', website: null },
  { name: 'מרפאת עור ד"ר מזרחי', phone: '972501111013', business_type: 'clinic', city: 'תל אביב', website: null },
  { name: 'סוכנות נדל"ן אלמוג', phone: '972501111014', business_type: 'real_estate', city: 'נתניה', website: null },
  { name: 'מכון שפות פולגלוט', phone: '972501111015', business_type: 'education', city: 'רחובות', website: null },
  { name: 'בית מלון פנינת הים', phone: '972501111016', business_type: 'hotel', city: 'אילת', website: null },
  { name: 'מוסך גרגר מוטורס', phone: '972501111017', business_type: 'garage', city: 'חולון', website: null },
  { name: 'מאפיית לחם טוב', phone: '972501111018', business_type: 'restaurant', city: 'כפר סבא', website: null },
  { name: 'בר וגריל אורנים', phone: '972501111019', business_type: 'restaurant', city: 'מודיעין', website: null },
  { name: 'חנות גבינות ואוכל טוב', phone: '972501111020', business_type: 'retail', city: 'רעננה', website: null },
  { name: 'סטודיו ריקוד ולנה', phone: '972501111021', business_type: 'fitness', city: 'הוד השרון', website: null },
  { name: 'מרכז יוגה ומדיטציה', phone: '972501111022', business_type: 'fitness', city: 'תל אביב', website: null },
  { name: 'מרפאת פיזיותרפיה כרמל', phone: '972501111023', business_type: 'clinic', city: 'חיפה', website: null },
  { name: 'חנות חיות מחמד פרוותי', phone: '972501111024', business_type: 'retail', city: 'אשדוד', website: null },
  { name: 'גן אירועים פסגת השמיים', phone: '972501111025', business_type: 'events', city: 'ירושלים', website: null },
  { name: 'קייטרינג שפים בשטח', phone: '972501111026', business_type: 'restaurant', city: 'לוד', website: null },
  { name: 'שמאי מקרקעין יעקובי', phone: '972501111027', business_type: 'real_estate', city: 'נס ציונה', website: null },
  { name: 'מכון פסיכולוגי ד"ר גל', phone: '972501111028', business_type: 'clinic', city: 'רמת השרון', website: null },
  { name: 'חשמלאי מוסמך יוסי', phone: '972501111029', business_type: 'services', city: 'בת ים', website: null },
  { name: 'אינסטלציה ירון ובניו', phone: '972501111030', business_type: 'services', city: 'פתח תקווה', website: null },
];

function seed() {
  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO businesses (id, name, phone, business_type, city, website, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((businesses) => {
    for (const b of businesses) {
      insertStmt.run(uuidv4(), b.name, b.phone, b.business_type, b.city, b.website || null, null);
    }
  });

  insertMany(SAMPLE_BUSINESSES);
  console.log(`[Seed] Added ${SAMPLE_BUSINESSES.length} sample businesses`);
}

module.exports = seed;
