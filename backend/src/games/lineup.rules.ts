import { z } from 'zod';

export const LineupRulesSchema = z
  .object({
    allowedNationalities: z.array(z.string().min(2)).optional(),
    allowedLeagueApiIds: z.array(z.number().int().positive()).optional(),
    allowedTeamApiIds: z.array(z.number().int().positive()).optional(),
    maxFromTeam: z.number().int().min(1).max(11).optional(),
    requiredPositions: z
      .object({
        GK: z.number().int().min(1).max(1).optional(),
        DEF: z.number().int().min(0).max(11).optional(),
        MID: z.number().int().min(0).max(11).optional(),
        FWD: z.number().int().min(0).max(11).optional(),
      })
      .optional(),
    minAge: z.number().int().min(15).max(60).optional(),
    maxAge: z.number().int().min(15).max(60).optional(),
    requireUniqueTeams: z.boolean().optional(),
    requireUniqueNationalities: z.boolean().optional(),
  })
  .refine((data) => {
    if (data.minAge && data.maxAge) return data.minAge <= data.maxAge;
    return true;
  }, 'minAge must be <= maxAge');

export type LineupRules = z.infer<typeof LineupRulesSchema>;
