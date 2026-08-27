import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_learning.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type QuestionType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  difficulty: QuizDifficulty;
  tags?: string[];
}

export interface Quiz {
  id: string;
  topic: string;
  difficulty: QuizDifficulty;
  questions: QuizQuestion[];
  timePerQuestionSec: number;
  createdAt: number;
}

export interface QuizResult {
  quizId: string;
  topic: string;
  score: number;
  total: number;
  timeTakenSec: number;
  wrongAnswers: Array<{ question: string; userAnswer: string; correctAnswer: string; explanation: string }>;
}

export async function generateQuiz(
  topic: string,
  questionCount = 10,
  difficulty: QuizDifficulty = 'medium',
  questionTypes: QuestionType[] = ['multiple_choice'],
  settings: Settings
): Promise<Quiz> {
  const typeInstructions: Record<QuestionType, string> = {
    multiple_choice: 'Include 4 options (A-D), mark correct answer index (0-3)',
    true_false: 'True/False questions, correct answer is "true" or "false"',
    fill_blank: 'Sentence with ___ to fill, correct answer is the missing word/phrase',
    short_answer: 'Open question requiring 1-3 sentence answer',
  };

  const typesText = questionTypes.map((t) => typeInstructions[t]).join('; ');

  const prompt = `Generate ${questionCount} quiz questions about "${topic}"
Difficulty: ${difficulty}
Question types: ${typesText}

IMPORTANT: Include a mix of conceptual understanding and practical application.

Respond with JSON array:
[{
  "type": "multiple_choice|true_false|fill_blank|short_answer",
  "question": "question text",
  "options": ["A", "B", "C", "D"] or null for non-MC,
  "correctAnswer": "index 0-3 for MC, 'true'/'false', or the answer string",
  "explanation": "why this is correct",
  "difficulty": "easy|medium|hard|expert",
  "tags": ["tag1", "tag2"]
}]`;

  let questions: QuizQuestion[] = [];

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as Array<Record<string, any>>;
      questions = parsed.map((q, i) => ({
        id: `q${i}`,
        type: q.type,
        question: q.question,
        options: q.options ?? undefined,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ?? '',
        difficulty: q.difficulty ?? difficulty,
        tags: q.tags ?? [],
      }));
    }
  } catch {}

  return {
    id: Date.now().toString(36),
    topic,
    difficulty,
    questions,
    timePerQuestionSec: difficulty === 'easy' ? 20 : difficulty === 'medium' ? 30 : difficulty === 'hard' ? 45 : 60,
    createdAt: Date.now(),
  };
}

export function checkAnswer(question: QuizQuestion, userAnswer: string | number): boolean {
  const correct = String(question.correctAnswer).toLowerCase().trim();
  const user = String(userAnswer).toLowerCase().trim();
  return correct === user;
}

export async function saveQuizResult(result: QuizResult): Promise<void> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  await db.runAsync(
    `INSERT INTO quiz_results (topic, score, total, difficulty, date, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [result.topic, result.score, result.total, 'medium', today, Date.now()]
  );
}

export async function getWeakAreas(topic: string): Promise<string[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT score, total FROM quiz_results WHERE topic = ? ORDER BY created_at DESC LIMIT 10`,
    [topic]
  );
  if (rows.length === 0) return [];

  const avgScore = rows.reduce((s, r) => s + r.score / r.total, 0) / rows.length;
  if (avgScore < 0.7) return [`Needs more practice: ${topic}`];
  return [];
}

export async function generatePersonalizedReview(
  wrongAnswers: QuizResult['wrongAnswers'],
  settings: Settings
): Promise<string> {
  if (wrongAnswers.length === 0) return 'Perfect score! No weak areas to review.';

  const questions = wrongAnswers.map((w) =>
    `Q: ${w.question}\nYour answer: ${w.userAnswer}\nCorrect: ${w.correctAnswer}\nWhy: ${w.explanation}`
  ).join('\n\n');

  const prompt = `Create a targeted review summary for quiz mistakes:
${questions}

Provide:
1. Common pattern in the mistakes
2. Core concept to study
3. 3 practice exercises to reinforce understanding
4. Memory trick to remember the correct answers

Keep it encouraging and practical.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function getQuizHistory(days = 30): Promise<Array<{
  topic: string;
  score: number;
  total: number;
  date: string;
  pct: number;
}>> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM quiz_results WHERE date >= ? ORDER BY date DESC`,
    [since]
  );
  return rows.map((r) => ({
    topic: r.topic,
    score: r.score,
    total: r.total,
    date: r.date,
    pct: r.total > 0 ? Math.round((r.score / r.total) * 100) : 0,
  }));
}
