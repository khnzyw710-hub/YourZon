import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Professional communication toolkit ───────────────────────────────────────

export async function writeNegotiationScript(
  context: string,
  goal: string,
  constraints: string,
  settings: Settings
): Promise<string> {
  const prompt = `Write a negotiation script for:
Context: ${context}
Goal: ${goal}
Constraints/limits: ${constraints}

Include: opening position, key arguments, handling objections, walk-away point, and closing.
Keep it practical and confident but collaborative.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function draftProfessionalEmail(params: {
  type: 'request' | 'complaint' | 'proposal' | 'apology' | 'rejection' | 'follow_up' | 'introduction';
  recipient: string;
  context: string;
  settings: Settings;
}): Promise<{ subject: string; body: string }> {
  const typeDescriptions = {
    request: 'a polite but direct request',
    complaint: 'a firm but professional complaint',
    proposal: 'a compelling business proposal',
    apology: 'a sincere professional apology',
    rejection: 'a respectful rejection that preserves the relationship',
    follow_up: 'a non-pushy follow-up that adds value',
    introduction: 'a memorable professional introduction',
  };

  const prompt = `Write ${typeDescriptions[params.type]}:
Recipient: ${params.recipient}
Context: ${params.context}

Format:
Subject: [subject line]

[email body]

Keep it concise, professional, and actionable.`;

  const { response } = await routeToAI(prompt, [], params.settings);

  const subjectMatch = response.match(/^Subject:\s*(.+)/m);
  const body = response.replace(/^Subject:.+\n\n?/m, '').trim();

  return {
    subject: subjectMatch?.[1]?.trim() ?? 'Follow up',
    body: body || response,
  };
}

export async function preparePresentation(
  topic: string,
  audience: string,
  durationMin: number,
  settings: Settings
): Promise<{
  outline: string[];
  keyMessages: string[];
  openingHook: string;
  closingCTA: string;
}> {
  const prompt = `Design a ${durationMin}-minute presentation:
Topic: ${topic}
Audience: ${audience}

Respond with JSON:
{
  "outline": ["slide1: ...", "slide2: ..."],
  "keyMessages": ["message1", "message2", "message3"],
  "openingHook": "attention-grabbing opening (1-2 sentences)",
  "closingCTA": "strong closing call-to-action"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {
    outline: ['Introduction', 'Problem', 'Solution', 'Evidence', 'Action'],
    keyMessages: ['Main point 1', 'Main point 2', 'Main point 3'],
    openingHook: 'Start with a compelling question or statistic.',
    closingCTA: 'Call to action.',
  };
}

export async function writeColdOutreach(
  targetPerson: string,
  targetCompany: string,
  yourValue: string,
  channel: 'email' | 'linkedin' | 'whatsapp',
  settings: Settings
): Promise<string> {
  const charLimit = channel === 'linkedin' ? 300 : channel === 'whatsapp' ? 200 : 1000;

  const prompt = `Write a cold ${channel} outreach to ${targetPerson} at ${targetCompany}.
Your value proposition: ${yourValue}
Max ${charLimit} characters.
Make it personal, valuable, not salesy. One clear ask. Short.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function handleDifficultConversation(
  scenario: string,
  desiredOutcome: string,
  relationship: string,
  settings: Settings
): Promise<{
  approach: string;
  openingLine: string;
  keyPoints: string[];
  thingsToAvoid: string[];
}> {
  const prompt = `Help with this difficult conversation:
Scenario: ${scenario}
Desired outcome: ${desiredOutcome}
Relationship: ${relationship}

Respond with JSON:
{
  "approach": "recommended strategy",
  "openingLine": "how to start the conversation",
  "keyPoints": ["point to make", "point to make"],
  "thingsToAvoid": ["thing to avoid", "thing to avoid"]
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {
    approach: 'Lead with empathy and listen actively.',
    openingLine: 'I wanted to talk about something important to both of us.',
    keyPoints: ['State your perspective clearly', 'Listen without interrupting'],
    thingsToAvoid: ['Blame language', 'Ultimatums', 'Assumptions'],
  };
}

export async function generateBioOrAboutMe(
  role: string,
  achievements: string[],
  personality: string,
  platform: 'linkedin' | 'twitter' | 'website' | 'resume',
  settings: Settings
): Promise<string> {
  const wordLimits = { linkedin: 300, twitter: 160, website: 200, resume: 100 };

  const prompt = `Write a ${platform} bio for:
Role: ${role}
Key achievements: ${achievements.join(', ')}
Personality/style: ${personality}
Max words: ${wordLimits[platform]}

Write in first person. Make it memorable, authentic, and specific. No clichés.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function translateForCulture(
  text: string,
  fromCulture: string,
  toCulture: string,
  settings: Settings
): Promise<string> {
  const prompt = `Adapt this message from ${fromCulture} to ${toCulture} communication style:

"${text}"

Consider: formality level, directness, relationship-building expectations, and cultural sensitivities.
Write the culturally adapted version only.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
