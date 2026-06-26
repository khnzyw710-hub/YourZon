import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    time_of_day TEXT,
    start_date TEXT,
    end_date TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS medication_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id INTEGER NOT NULL,
    taken_at INTEGER NOT NULL,
    dose_taken TEXT,
    skipped INTEGER DEFAULT 0
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS symptoms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    symptom TEXT NOT NULL,
    severity INTEGER,
    body_part TEXT,
    duration_min INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor TEXT NOT NULL,
    specialty TEXT,
    date TEXT NOT NULL,
    time TEXT,
    location TEXT,
    notes TEXT,
    reminder_min INTEGER DEFAULT 60,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Medication {
  id?: number;
  name: string;
  dosage: string;
  frequency: string;
  timeOfDay?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  active?: boolean;
  createdAt: number;
}

export interface SymptomEntry {
  id?: number;
  date: string;
  symptom: string;
  severity?: 1 | 2 | 3 | 4 | 5;
  bodyPart?: string;
  durationMin?: number;
  notes?: string;
  createdAt: number;
}

export interface Appointment {
  id?: number;
  doctor: string;
  specialty?: string;
  date: string;
  time?: string;
  location?: string;
  notes?: string;
  reminderMin?: number;
  createdAt: number;
}

// ─── Medications ──────────────────────────────────────────────────────────────
export async function addMedication(med: Medication): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO medications (name, dosage, frequency, time_of_day, start_date, end_date, notes, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [med.name, med.dosage, med.frequency, med.timeOfDay ?? null, med.startDate ?? null, med.endDate ?? null, med.notes ?? null, med.createdAt]
  );
  return result.lastInsertRowId;
}

export async function getActiveMedications(): Promise<Medication[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<{
    id: number; name: string; dosage: string; frequency: string;
    time_of_day: string | null; start_date: string | null; end_date: string | null;
    notes: string | null; created_at: number;
  }>(`SELECT * FROM medications WHERE active = 1 ORDER BY name`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    dosage: r.dosage,
    frequency: r.frequency,
    timeOfDay: r.time_of_day ?? undefined,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    notes: r.notes ?? undefined,
    active: true,
    createdAt: r.created_at,
  }));
}

export async function logMedicationTaken(medicationId: number, doseTaken?: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO medication_log (medication_id, taken_at, dose_taken, skipped) VALUES (?, ?, ?, 0)`,
    [medicationId, Date.now(), doseTaken ?? null]
  );
}

export async function getMedicationAdherence(medicationId: number, days = 30): Promise<number> {
  const db = await getDB();
  const since = Date.now() - days * 86400000;
  const taken = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM medication_log WHERE medication_id = ? AND taken_at > ? AND skipped = 0`,
    [medicationId, since]
  );
  return (taken?.count ?? 0) / days;
}

// ─── Symptoms ─────────────────────────────────────────────────────────────────
export async function logSymptom(entry: SymptomEntry): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO symptoms (date, symptom, severity, body_part, duration_min, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entry.date, entry.symptom, entry.severity ?? null, entry.bodyPart ?? null, entry.durationMin ?? null, entry.notes ?? null, entry.createdAt]
  );
}

export async function getRecentSymptoms(days = 14): Promise<SymptomEntry[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    id: number; date: string; symptom: string; severity: number | null;
    body_part: string | null; duration_min: number | null; notes: string | null; created_at: number;
  }>(`SELECT * FROM symptoms WHERE date >= ? ORDER BY created_at DESC`, [since]);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    symptom: r.symptom,
    severity: (r.severity as SymptomEntry['severity']) ?? undefined,
    bodyPart: r.body_part ?? undefined,
    durationMin: r.duration_min ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

// ─── AI symptom checker ───────────────────────────────────────────────────────
export async function checkSymptoms(symptoms: string[], settings: Settings): Promise<string> {
  const prompt = `Medical information assistant. User reports these symptoms: ${symptoms.join(', ')}

Provide:
1. Possible common causes (not diagnosis)
2. When to see a doctor (urgency level: routine/soon/urgent/emergency)
3. One self-care tip

Always remind: this is information, not medical advice. Consult a doctor for personal medical decisions.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Appointments ─────────────────────────────────────────────────────────────
export async function addAppointment(appt: Appointment): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO appointments (doctor, specialty, date, time, location, notes, reminder_min, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [appt.doctor, appt.specialty ?? null, appt.date, appt.time ?? null, appt.location ?? null, appt.notes ?? null, appt.reminderMin ?? 60, appt.createdAt]
  );
  return result.lastInsertRowId;
}

export async function getUpcomingAppointments(): Promise<Appointment[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    id: number; doctor: string; specialty: string | null; date: string;
    time: string | null; location: string | null; notes: string | null;
    reminder_min: number; created_at: number;
  }>(`SELECT * FROM appointments WHERE date >= ? ORDER BY date, time`, [today]);

  return rows.map((r) => ({
    id: r.id,
    doctor: r.doctor,
    specialty: r.specialty ?? undefined,
    date: r.date,
    time: r.time ?? undefined,
    location: r.location ?? undefined,
    notes: r.notes ?? undefined,
    reminderMin: r.reminder_min,
    createdAt: r.created_at,
  }));
}

// ─── Health report builder ────────────────────────────────────────────────────
export async function buildHealthReport(settings: Settings): Promise<string> {
  const [meds, symptoms, appointments] = await Promise.all([
    getActiveMedications(),
    getRecentSymptoms(7),
    getUpcomingAppointments(),
  ]);

  const medsText = meds.length > 0 ? meds.map((m) => `${m.name} ${m.dosage} ${m.frequency}`).join(', ') : 'None';
  const symptomsText = symptoms.length > 0 ? [...new Set(symptoms.map((s) => s.symptom))].join(', ') : 'None';
  const apptText = appointments.slice(0, 3).map((a) => `${a.doctor} on ${a.date}`).join(', ') || 'None scheduled';

  const prompt = `Summarize this health snapshot in 3 bullet points (concise, for the patient):
Medications: ${medsText}
Recent symptoms (7 days): ${symptomsText}
Upcoming appointments: ${apptText}

Keep it clear, reassuring, and actionable.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
