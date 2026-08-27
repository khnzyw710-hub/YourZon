import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { logExpense } from '@/services/finance/expenses';

// ─── Israeli banking & financial integrations ─────────────────────────────────
// All data parsing happens locally. No bank API credentials are stored.
// Integration via: SMS parsing, CSV import, screenshot OCR

// ─── Bank SMS parsing (Israeli banks) ────────────────────────────────────────
export interface BankTransaction {
  bank: string;
  amount: number;
  currency: string;
  merchant: string;
  date: string;
  type: 'debit' | 'credit';
  lastFourDigits?: string;
}

const ISRAELI_BANK_SMS_PATTERNS: Array<{
  bank: string;
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => Partial<BankTransaction>;
}> = [
  {
    bank: 'Leumi',
    pattern: /לאומי.*?(\d+\.?\d*)\s*₪\s*(?:ב|at)\s*([^\n,]+)/i,
    extract: (m) => ({ bank: 'Leumi', amount: parseFloat(m[1]), merchant: m[2].trim(), currency: 'ILS', type: 'debit' }),
  },
  {
    bank: 'Hapoalim',
    pattern: /פועלים.*?(\d+\.?\d*)\s*₪.*?([A-Za-zא-ת\s]+)$/im,
    extract: (m) => ({ bank: 'Hapoalim', amount: parseFloat(m[1]), merchant: m[2].trim(), currency: 'ILS', type: 'debit' }),
  },
];

export async function parseBankSMS(smsText: string, settings: Settings): Promise<BankTransaction | null> {
  // Try pattern matching first
  for (const { bank, pattern, extract } of ISRAELI_BANK_SMS_PATTERNS) {
    const match = smsText.match(pattern);
    if (match) {
      return {
        bank,
        currency: 'ILS',
        type: 'debit',
        date: new Date().toISOString().slice(0, 10),
        merchant: '',
        amount: 0,
        ...extract(match),
      };
    }
  }

  // Fallback to AI parsing
  const prompt = `Parse this bank SMS (Israeli banking):
"${smsText}"

Respond with JSON or null:
{
  "bank": "bank name",
  "amount": number,
  "currency": "ILS|USD",
  "merchant": "merchant name",
  "date": "YYYY-MM-DD",
  "type": "debit|credit",
  "lastFourDigits": "1234 or null"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    if (response.trim().toLowerCase() === 'null') return null;
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return null;
}

export async function importBankSMSAsExpense(smsText: string, settings: Settings): Promise<boolean> {
  const transaction = await parseBankSMS(smsText, settings);
  if (!transaction || transaction.type !== 'debit') return false;

  await logExpense({
    amount: transaction.amount,
    currency: transaction.currency,
    category: 'other',
    description: `SMS: ${transaction.merchant}`,
    merchant: transaction.merchant,
    date: transaction.date,
    paymentMethod: 'debit',
  });

  return true;
}

// ─── CSV bank statement import ────────────────────────────────────────────────
export async function parseCSVBankStatement(csv: string, settings: Settings): Promise<BankTransaction[]> {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const prompt = `Parse this bank statement CSV and extract transactions:
First few lines:
${lines.slice(0, 10).join('\n')}

Respond with JSON array (all transactions):
[{"amount": number, "currency": "ILS", "merchant": "...", "date": "YYYY-MM-DD", "type": "debit|credit"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed.map((t: any) => ({ ...t, bank: 'imported' }));
    }
  } catch {}

  return [];
}

// ─── Israeli financial instruments ───────────────────────────────────────────
export interface IsraeliTaxInfo {
  year: number;
  taxBrackets: Array<{ upTo: number; rate: number }>;
  nationalInsuranceBrackets: Array<{ upTo: number; rate: number }>;
  healthInsuranceBrackets: Array<{ upTo: number; rate: number }>;
}

const TAX_BRACKETS_2024: IsraeliTaxInfo = {
  year: 2024,
  taxBrackets: [
    { upTo: 82_080, rate: 0.10 },
    { upTo: 117_720, rate: 0.14 },
    { upTo: 188_580, rate: 0.20 },
    { upTo: 262_320, rate: 0.31 },
    { upTo: 560_280, rate: 0.35 },
    { upTo: 725_640, rate: 0.47 },
    { upTo: Infinity, rate: 0.50 },
  ],
  nationalInsuranceBrackets: [
    { upTo: 7_522, rate: 0.0487 },
    { upTo: Infinity, rate: 0.1196 },
  ],
  healthInsuranceBrackets: [
    { upTo: 7_522, rate: 0.031 },
    { upTo: Infinity, rate: 0.05 },
  ],
};

export function calculateIsraeliTax(annualGrossILS: number): {
  incomeTax: number;
  nationalInsurance: number;
  healthInsurance: number;
  totalTax: number;
  netAnnual: number;
  effectiveRate: number;
} {
  const monthlyGross = annualGrossILS / 12;

  // Income tax (monthly calc × 12)
  let incomeTax = 0;
  let remaining = monthlyGross;
  let prevBracket = 0;
  for (const bracket of TAX_BRACKETS_2024.taxBrackets) {
    const upToMonth = bracket.upTo / 12;
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, upToMonth - prevBracket);
    incomeTax += taxable * bracket.rate;
    remaining -= taxable;
    prevBracket = upToMonth;
  }
  incomeTax *= 12;

  // National insurance (monthly × 12)
  let ni = 0;
  remaining = monthlyGross;
  prevBracket = 0;
  for (const bracket of TAX_BRACKETS_2024.nationalInsuranceBrackets) {
    const upToMonth = bracket.upTo / 12;
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, upToMonth - prevBracket);
    ni += taxable * bracket.rate;
    remaining -= taxable;
    prevBracket = upToMonth;
  }
  ni *= 12;

  // Health insurance
  let health = 0;
  remaining = monthlyGross;
  prevBracket = 0;
  for (const bracket of TAX_BRACKETS_2024.healthInsuranceBrackets) {
    const upToMonth = bracket.upTo / 12;
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, upToMonth - prevBracket);
    health += taxable * bracket.rate;
    remaining -= taxable;
    prevBracket = upToMonth;
  }
  health *= 12;

  const totalTax = incomeTax + ni + health;
  const netAnnual = annualGrossILS - totalTax;
  const effectiveRate = annualGrossILS > 0 ? totalTax / annualGrossILS : 0;

  return {
    incomeTax: Math.round(incomeTax),
    nationalInsurance: Math.round(ni),
    healthInsurance: Math.round(health),
    totalTax: Math.round(totalTax),
    netAnnual: Math.round(netAnnual),
    effectiveRate: Math.round(effectiveRate * 1000) / 1000,
  };
}
