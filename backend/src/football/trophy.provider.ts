import { Injectable, Logger } from '@nestjs/common';
import { ApiFootballClient } from './api-football.client';

export interface TrophyProvider {
  getPlayerTrophies(apiId: number): Promise<any[]>;
}

@Injectable()
export class ApiFootballTrophyProvider implements TrophyProvider {
  private logger = new Logger(ApiFootballTrophyProvider.name);

  constructor(private api: ApiFootballClient) {}

  async getPlayerTrophies(apiId: number): Promise<any[]> {
    try {
      const data = await this.api.getPlayerTrophies({ player: apiId });
      return (data as any)?.response || [];
    } catch (err) {
      // TODO: Reemplazar por proveedor real si el endpoint es estable en la cuenta actual.
      this.logger.warn('Trophy endpoint unavailable, returning empty list');
      return [];
    }
  }
}
