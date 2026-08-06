import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { db } from '../config/database';

const updateProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  locale: z.enum(['he', 'en']).optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/api/users/me', async (request, reply) => {
    const user = await db('users')
      .where({ id: request.user!.userId })
      .select('id', 'phone', 'first_name', 'last_name', 'avatar_url', 'role', 'locale', 'created_at')
      .first();

    if (!user) return reply.status(404).send({ error: 'User not found' });
    return reply.send(user);
  });

  app.patch('/api/users/me', async (request, reply) => {
    const body = updateProfileSchema.parse(request.body);
    const updateData: Record<string, any> = {};
    if (body.firstName !== undefined) updateData.first_name = body.firstName;
    if (body.lastName !== undefined) updateData.last_name = body.lastName;
    if (body.avatarUrl !== undefined) updateData.avatar_url = body.avatarUrl;
    if (body.locale !== undefined) updateData.locale = body.locale;

    const [user] = await db('users')
      .where({ id: request.user!.userId })
      .update(updateData)
      .returning('*');

    return reply.send(user);
  });

  app.put('/api/users/me/push-token', async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.body);
    await db('users').where({ id: request.user!.userId }).update({ push_token: token });
    return reply.send({ success: true });
  });
}
