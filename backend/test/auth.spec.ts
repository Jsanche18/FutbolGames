import { AuthService } from '../src/auth/auth.service';

describe('AuthService', () => {
  it('registers a new user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1, email: 'a@b.com', profile: {} }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    } as any;
    const jwt = { sign: jest.fn().mockReturnValue('token') } as any;
    const config = { get: jest.fn().mockReturnValue('secret') } as any;
    const service = new AuthService(prisma, jwt, config);

    const result = await service.register('a@b.com', 'password123');

    expect(result.accessToken).toBe('token');
    expect(prisma.user.create).toHaveBeenCalled();
  });
});
