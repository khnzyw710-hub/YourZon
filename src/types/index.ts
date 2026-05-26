export type BusinessStatus = 'pending' | 'contacted' | 'responded' | 'converted' | 'not_interested';
export type MessageDirection = 'inbound' | 'outbound';
export type ConversationStage = 'outreach' | 'interested' | 'meeting' | 'closed' | 'not_interested';
export type WhatsAppStatus = 'disconnected' | 'qr_ready' | 'authenticated' | 'connected' | 'error';
export type AIModel = 'gemini' | 'claude' | 'template' | null;

export interface Business {
  id: string;
  name: string;
  phone: string;
  business_type: string;
  city: string;
  website: string | null;
  notes: string | null;
  status: BusinessStatus;
  last_contacted: number | null;
  contact_count: number;
  created_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  content: string;
  ai_model: AIModel;
  whatsapp_id: string | null;
  status: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  business_id: string;
  whatsapp_chat_id: string | null;
  stage: ConversationStage;
  created_at: number;
  updated_at: number;
  business_name: string;
  business_type: string;
  city: string;
  phone: string;
  business_status: BusinessStatus;
  last_message?: string;
  last_message_time?: number;
  inbound_count: number;
  message_count: number;
  messages?: Message[];
}

export interface Stats {
  total: number;
  pending: number;
  contacted: number;
  responded: number;
  converted: number;
  sentToday: number;
  totalSent: number;
  totalResponses: number;
}

export interface Settings {
  daily_send_hour: string;
  daily_send_minute: string;
  messages_per_day: string;
  auto_reply: string;
  owner_name: string;
  whatsapp_status: WhatsAppStatus;
  total_sent: string;
  total_responses: string;
  next_run: string;
}
