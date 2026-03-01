import { GamesService } from '../src/games/games.service';

describe('GamesService', () => {
  it('creates a lineup template', async () => {
    const prisma = {
      lineupTemplate: {
        create: jest.fn().mockResolvedValue({ id: 1, name: 'Test', rulesJson: {} }),
      },
    } as any;
    const redis = {} as any;
    const syncService = {} as any;
    const service = new GamesService(prisma, redis, syncService);

    const result = await service.createLineupTemplate('Test', {});

    expect(result.id).toBe(1);
  });
});
