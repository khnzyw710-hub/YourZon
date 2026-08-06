import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/authService';

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+972\d{9}$/, 'Invalid Israeli phone number'),
});

const verifyOtpSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/send-otp', async (request, reply) => {
    const body = sendOtpSchema.parse(request.body);
    const result = await authService.sendOtp(body.phone);
    return reply.send(result);
  });

  app.post('/api/auth/verify-otp', async (request, reply) => {
    const body = verifyOtpSchema.parse(request.body);
    const result = await authService.verifyOtp(body.phone, body.code);
    if (!result) {
      return reply.status(401).send({ error: 'Invalid or expired OTP' });
    }
    return reply.send(result);
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await authService.refreshToken(body.refreshToken);
    if (!result) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
    return reply.send(result);
  });
}
