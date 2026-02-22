const normalize = (value: string) => value.toLowerCase();

export function mapAllowedPositions(primaryPosition: string | null | undefined): string[] {
  if (!primaryPosition) return [];
  const pos = normalize(primaryPosition);

  if (pos.includes('goal')) return ['GK'];
  if (pos.includes('centre-back') || pos.includes('center back') || pos === 'cb') {
    return ['CB'];
  }
  if (pos.includes('left back') || pos === 'lb') return ['LB', 'LWB'];
  if (pos.includes('right back') || pos === 'rb') return ['RB', 'RWB'];
  if (pos.includes('defender')) return ['CB', 'LB', 'RB'];

  if (pos.includes('defensive') || pos.includes('cdm')) return ['CDM', 'CM'];
  if (pos.includes('attacking') || pos.includes('cam')) return ['CAM', 'CM'];
  if (pos.includes('midfield')) return ['CM', 'CDM', 'CAM', 'LM', 'RM'];

  if (pos.includes('left wing') || pos === 'lw') return ['LW', 'LM'];
  if (pos.includes('right wing') || pos === 'rw') return ['RW', 'RM'];
  if (pos.includes('winger')) return ['LW', 'RW', 'LM', 'RM'];

  if (pos.includes('striker') || pos === 'st') return ['ST', 'CF'];
  if (pos.includes('forward') || pos.includes('centre forward') || pos.includes('center forward')) {
    return ['ST', 'CF'];
  }

  return [primaryPosition.toUpperCase()];
}
