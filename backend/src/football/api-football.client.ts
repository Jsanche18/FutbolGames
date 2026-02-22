import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class ApiFootballClient {
  private client: AxiosInstance;

  constructor(private configService: ConfigService) {
    const baseURL = this.configService.get<string>('API_FOOTBALL_BASE_URL');
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY');
    if (!baseURL || !apiKey) {
      throw new Error('API_FOOTBALL_BASE_URL and API_FOOTBALL_KEY are required');
    }
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'x-apisports-key': apiKey,
      },
    });
  }

  private async request<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const response = await this.client.get<T>(url, { params });
        return response.data;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) {
          throw new UnauthorizedException('API-Football unauthorized');
        }
        if (status === 429) {
          throw new HttpException('API-Football rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }
        if (attempt === maxRetries) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        attempt += 1;
      }
    }
    throw new Error('API-Football request failed');
  }

  getCountries() {
    return this.request('/countries');
  }

  getLeagues(params: Record<string, unknown>) {
    return this.request('/leagues', params);
  }

  getTeams(params: Record<string, unknown>) {
    return this.request('/teams', params);
  }

  getPlayers(params: Record<string, unknown>) {
    return this.request('/players', params);
  }

  getPlayer(params: Record<string, unknown>) {
    return this.request('/players', params);
  }

  getPlayerTrophies(params: Record<string, unknown>) {
    return this.request('/trophies', params);
  }
}
