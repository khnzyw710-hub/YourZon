import { Business, Conversation, Stats, Settings } from '../types';

const BASE_URL = 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Businesses
  getBusinesses: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ businesses: Business[]; total: number }>(`/businesses${query}`);
  },
  getBusinessStats: () => request<Stats>('/businesses/stats'),
  createBusiness: (data: Partial<Business>) =>
    request<Business>('/businesses', { method: 'POST', body: JSON.stringify(data) }),
  updateBusiness: (id: string, data: Partial<Business>) =>
    request<Business>(`/businesses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBusiness: (id: string) =>
    request<{ success: boolean }>(`/businesses/${id}`, { method: 'DELETE' }),
  bulkImport: (businesses: Partial<Business>[]) =>
    request<{ inserted: number; total: number }>('/businesses/bulk', {
      method: 'POST',
      body: JSON.stringify({ businesses }),
    }),

  // Conversations
  getConversations: () =>
    request<{ conversations: Conversation[]; total: number }>('/conversations'),
  getConversation: (id: string) => request<Conversation>(`/conversations/${id}`),
  sendMessage: (conversationId: string, message: string) =>
    request(`/conversations/${conversationId}/send`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  updateStage: (conversationId: string, stage: string) =>
    request(`/conversations/${conversationId}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stage }),
    }),

  // Settings
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (data: Partial<Settings>) =>
    request<{ success: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  saveApiKeys: (keys: { gemini_api_key?: string; claude_api_key?: string }) =>
    request<{ success: boolean }>('/settings/api-keys', {
      method: 'POST',
      body: JSON.stringify(keys),
    }),
  runNow: () => request<{ sent: number; failed: number }>('/settings/scheduler/run-now', { method: 'POST' }),
  startScheduler: () => request('/settings/scheduler/start', { method: 'POST' }),
  stopScheduler: () => request('/settings/scheduler/stop', { method: 'POST' }),

  // WhatsApp
  getWhatsAppStatus: () => request<{ status: string; isReady: boolean; qr: string | null }>('/whatsapp/status'),
  disconnectWhatsApp: () => request('/whatsapp/disconnect', { method: 'POST' }),
};
