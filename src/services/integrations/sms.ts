import * as SMS from 'expo-sms';
import { findContactByName } from './contacts';

export async function isSMSAvailable(): Promise<boolean> {
  return SMS.isAvailableAsync();
}

export async function sendSMSToContact(
  contactName: string,
  message: string
): Promise<{ success: boolean; reason?: string }> {
  const available = await isSMSAvailable();
  if (!available) return { success: false, reason: 'SMS not available on this device' };

  const contact = await findContactByName(contactName);
  if (!contact) return { success: false, reason: `Contact "${contactName}" not found` };
  if (!contact.phoneNumbers[0]) return { success: false, reason: `No phone number for ${contactName}` };

  const { result } = await SMS.sendSMSAsync([contact.phoneNumbers[0]], message);
  return { success: result === 'sent' };
}

export async function sendSMSToNumber(
  phone: string,
  message: string
): Promise<{ success: boolean }> {
  const available = await isSMSAvailable();
  if (!available) return { success: false };
  const { result } = await SMS.sendSMSAsync([phone], message);
  return { success: result === 'sent' };
}
