import * as Contacts from 'expo-contacts';

export interface ZonContact {
  id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
}

let _contactCache: ZonContact[] = [];
let _cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

async function loadContacts(): Promise<ZonContact[]> {
  if (_contactCache.length && Date.now() - _cacheTime < CACHE_TTL) {
    return _contactCache;
  }

  const granted = await requestContactsPermission();
  if (!granted) return [];

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
  });

  _contactCache = data.map((c) => ({
    id: c.id ?? '',
    name: c.name ?? '',
    phoneNumbers: c.phoneNumbers?.map((p) => p.number ?? '') ?? [],
    emails: c.emails?.map((e) => e.email ?? '') ?? [],
  }));
  _cacheTime = Date.now();

  return _contactCache;
}

// Find contacts matching a name mentioned in speech
export async function findContactByName(name: string): Promise<ZonContact | null> {
  const contacts = await loadContacts();
  const lower = name.toLowerCase();
  return (
    contacts.find(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        lower.includes(c.name.toLowerCase().split(' ')[0])
    ) ?? null
  );
}

export async function getContactPhoneNumber(name: string): Promise<string | null> {
  const contact = await findContactByName(name);
  return contact?.phoneNumbers[0] ?? null;
}
