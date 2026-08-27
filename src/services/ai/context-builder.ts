import { Settings } from '@/store';
import { getLatestBiometrics } from '@/services/health/biometrics';
import { getMonthlyStats } from '@/services/finance/expenses';
import { getTaskStats } from '@/services/productivity/tasks';
import { getMoodStats } from '@/services/health/mental';
import { getFocusStats } from '@/services/productivity/focus';
import { getTodayHydration } from '@/services/health/hydration';
import { getActivePersona, getPersonaSystemPrompt } from './personas';

// ─── Mega-context builder for enriched AI conversations ───────────────────────
// This supplements useListening's buildMegaContext() with richer service data

export interface ContextSnapshot {
  timestamp: string;
  health?: {
    latestWeight?: number;
    latestSteps?: number;
    hydrationPct?: number;
    moodAvg?: number;
  };
  finance?: {
    monthlySpend?: number;
    monthlyIncome?: number;
    topCategory?: string;
  };
  productivity?: {
    tasksCompleted?: number;
    tasksPending?: number;
    focusMinToday?: number;
    focusStreak?: number;
  };
  persona?: {
    name?: string;
    systemPrompt?: string;
  };
}

export async function buildFullContext(settings: Settings): Promise<ContextSnapshot> {
  const today = new Date();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [biometrics, monthStats, taskStats, moodStats, focusStats, hydration, activePersona] = await Promise.allSettled([
    getLatestBiometrics(),
    getMonthlyStats(monthKey),
    getTaskStats(),
    getMoodStats(7),
    getFocusStats(7),
    getTodayHydration(),
    getActivePersona(),
  ]);

  const bm = biometrics.status === 'fulfilled' ? biometrics.value : null;
  const ms = monthStats.status === 'fulfilled' ? monthStats.value : null;
  const ts = taskStats.status === 'fulfilled' ? taskStats.value : null;
  const mood = moodStats.status === 'fulfilled' ? moodStats.value : null;
  const focus = focusStats.status === 'fulfilled' ? focusStats.value : null;
  const hydro = hydration.status === 'fulfilled' ? hydration.value : null;
  const persona = activePersona.status === 'fulfilled' ? activePersona.value : null;

  let personaSystemPrompt: string | null = null;
  if (persona?.id) {
    personaSystemPrompt = await getPersonaSystemPrompt(persona.id).catch(() => null);
  }

  return {
    timestamp: today.toISOString(),
    health: bm || hydro ? {
      latestWeight: bm?.weightKg,
      latestSteps: bm?.steps,
      hydrationPct: hydro?.progressPct,
      moodAvg: mood?.avg,
    } : undefined,
    finance: ms ? {
      monthlySpend: ms.totalSpent,
      monthlyIncome: ms.totalIncome,
      topCategory: ms.byCategory[0]?.category,
    } : undefined,
    productivity: ts || focus ? {
      tasksCompleted: ts?.completedThisWeek,
      tasksPending: ts?.pending,
      focusMinToday: focus?.totalFocusMin,
      focusStreak: focus?.streakDays,
    } : undefined,
    persona: persona ? {
      name: persona.name,
      systemPrompt: personaSystemPrompt ?? undefined,
    } : undefined,
  };
}

export function formatContextForPrompt(ctx: ContextSnapshot): string {
  const lines: string[] = [`[Context: ${new Date(ctx.timestamp).toLocaleDateString('he-IL')}]`];

  if (ctx.health) {
    const h = ctx.health;
    const parts = [];
    if (h.latestWeight) parts.push(`משקל ${h.latestWeight}kg`);
    if (h.latestSteps) parts.push(`${h.latestSteps} צעדים`);
    if (h.hydrationPct != null) parts.push(`הידרציה ${h.hydrationPct}%`);
    if (h.moodAvg != null) parts.push(`מצב רוח ממוצע ${h.moodAvg}/10`);
    if (parts.length) lines.push(`בריאות: ${parts.join(', ')}`);
  }

  if (ctx.productivity) {
    const p = ctx.productivity;
    const parts = [];
    if (p.tasksPending != null) parts.push(`${p.tasksPending} משימות פתוחות`);
    if (p.tasksCompleted != null) parts.push(`${p.tasksCompleted} הושלמו השבוע`);
    if (p.focusMinToday != null) parts.push(`${p.focusMinToday} דקות פוקוס`);
    if (parts.length) lines.push(`פרודוקטיביות: ${parts.join(', ')}`);
  }

  if (ctx.finance?.monthlySpend != null) {
    lines.push(`פיננסים: הוצאות החודש ₪${ctx.finance.monthlySpend.toFixed(0)}`);
  }

  return lines.join('\n');
}
