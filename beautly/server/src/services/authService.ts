import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

const OTP_EXPIRY_MINUTES = 5;
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '30d';

export async function sendOtp(phone: string): Promise<{ success: boolean }> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db('otp_codes').insert({
    id: uuidv4(),
    phone,
    code,
    expires_at: expiresAt,
  });

  // In production, send via Twilio Verify API
  // For development, log the code
  console.log(`[DEV] OTP for ${phone}: ${code}`);

  return { success: true };
}

export async function verifyOtp(phone: string, code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: any;
  isNewUser: boolean;
} | null> {
  const otpRecord = await db('otp_codes')
    .where({ phone, code, used: false })
    .where('expires_at', '>', new Date())
    .where('attempts', '<', 5)
    .orderBy('created_at', 'desc')
    .first();

  if (!otpRecord) {
    await db('otp_codes')
      .where({ phone })
      .where('expires_at', '>', new Date())
      .increment('attempts', 1);
    return null;
  }

  await db('otp_codes').where({ id: otpRecord.id }).update({ used: true });

  let user = await db('users').where({ phone }).first();
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const id = uuidv4();
    [user] = await db('users')
      .insert({
        id,
        phone,
        phone_verified: true,
        role: 'customer',
      })
      .returning('*');
  } else {
    await db('users').where({ id: user.id }).update({ phone_verified: true });
  }

  const accessToken = jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken, user, isNewUser };
}

export async function refreshToken(token: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string; type: string };
    if (payload.type !== 'refresh') return null;

    const user = await db('users').where({ id: payload.userId, is_active: true }).first();
    if (!user) return null;

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken: newRefreshToken };
  } catch {
    return null;
  }
}
