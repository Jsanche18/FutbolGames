export type ImportantPlayerSeed = {
  name: string;
  club: string;
  marketValueM: number;
};

export const IMPORTANT_PLAYERS_CATALOG: ImportantPlayerSeed[] = [
  { name: 'Erling Haaland', club: 'Manchester City', marketValueM: 200 },
  { name: 'Bukayo Saka', club: 'Arsenal', marketValueM: 130 },
  { name: 'Declan Rice', club: 'Arsenal', marketValueM: 120 },
  { name: 'Cole Palmer', club: 'Chelsea', marketValueM: 120 },
  { name: 'Florian Wirtz', club: 'Liverpool', marketValueM: 110 },
  { name: 'Rodri', club: 'Manchester City', marketValueM: 75 },
  { name: 'Federico Valverde', club: 'Chelsea', marketValueM: 75 },
  { name: 'Mohamed Salah', club: 'Liverpool', marketValueM: 30 },
  { name: 'Bruno Fernandes', club: 'Manchester United', marketValueM: 40 },
  { name: 'Virgil van Dijk', club: 'Liverpool', marketValueM: 23 },
  { name: 'Kylian Mbappe', club: 'Real Madrid', marketValueM: 200 },
  { name: 'Lamine Yamal', club: 'FC Barcelona', marketValueM: 200 },
  { name: 'Jude Bellingham', club: 'Real Madrid', marketValueM: 160 },
  { name: 'Vinicius Junior', club: 'Real Madrid', marketValueM: 150 },
  { name: 'Pedri', club: 'FC Barcelona', marketValueM: 140 },
  { name: 'Raphinha', club: 'FC Barcelona', marketValueM: 90 },
  { name: 'Rodrygo', club: 'Real Madrid', marketValueM: 80 },
  { name: 'Nico Williams', club: 'Athletic Club', marketValueM: 60 },
  { name: 'Takefusa Kubo', club: 'Real Sociedad', marketValueM: 35 },
  { name: 'Jamal Musiala', club: 'Bayern Munich', marketValueM: 140 },
  { name: 'Michael Olise', club: 'Bayern Munich', marketValueM: 130 },
  { name: 'Harry Kane', club: 'Bayern Munich', marketValueM: 65 },
  { name: 'Benjamin Sesko', club: 'Borussia Dortmund', marketValueM: 76 },
  { name: 'Xavi Simons', club: 'Borussia Dortmund', marketValueM: 60 },
  { name: 'Jeremie Frimpong', club: 'Bayer Leverkusen', marketValueM: 70 },
  { name: 'Victor Boniface', club: 'Bayer Leverkusen', marketValueM: 45 },
  { name: 'Lautaro Martinez', club: 'Inter', marketValueM: 85 },
  { name: 'Alessandro Bastoni', club: 'Inter', marketValueM: 80 },
  { name: 'Nicolo Barella', club: 'Inter', marketValueM: 60 },
  { name: 'Marcus Thuram', club: 'Inter', marketValueM: 60 },
  { name: 'Rafael Leao', club: 'AC Milan', marketValueM: 70 },
  { name: 'Theo Hernandez', club: 'AC Milan', marketValueM: 55 },
  { name: 'Christian Pulisic', club: 'AC Milan', marketValueM: 60 },
  { name: 'Kenan Yildiz', club: 'Juventus', marketValueM: 75 },
  { name: 'Victor Osimhen', club: 'Napoli', marketValueM: 75 },
  { name: 'Khvicha Kvaratskhelia', club: 'Napoli', marketValueM: 80 },
  { name: 'Paulo Dybala', club: 'Roma', marketValueM: 30 },
  { name: 'Joshua Zirkzee', club: 'Bologna', marketValueM: 40 },
  { name: 'Joao Neves', club: 'PSG', marketValueM: 110 },
  { name: 'Vitinha', club: 'PSG', marketValueM: 110 },
  { name: 'Ousmane Dembele', club: 'PSG', marketValueM: 100 },
  { name: 'Desire Doue', club: 'PSG', marketValueM: 90 },
  { name: 'Achraf Hakimi', club: 'PSG', marketValueM: 80 },
  { name: 'Randal Kolo Muani', club: 'PSG', marketValueM: 45 },
  { name: 'Mason Greenwood', club: 'Marseille', marketValueM: 50 },
  { name: 'Jonathan David', club: 'Lille', marketValueM: 40 },
  { name: 'Rayan Cherki', club: 'Lyon', marketValueM: 50 },
  { name: 'Viktor Gyokeres', club: 'Sporting CP', marketValueM: 75 },
  { name: 'Diogo Costa', club: 'FC Porto', marketValueM: 45 },
  { name: 'Antonio Silva', club: 'Benfica', marketValueM: 45 },
  { name: 'Cristiano Ronaldo', club: 'Al-Nassr', marketValueM: 12 },
  { name: 'Karim Benzema', club: 'Al-Ittihad', marketValueM: 15 },
  { name: 'Sadio Mane', club: 'Al-Nassr', marketValueM: 18 },
  { name: 'Ruben Neves', club: 'Al-Hilal', marketValueM: 25 },
  { name: 'Joao Felix', club: 'Al-Nassr', marketValueM: 25 },
  { name: 'Lionel Messi', club: 'Inter Miami', marketValueM: 8 },
  { name: 'Luis Suarez', club: 'Inter Miami', marketValueM: 4 },
  { name: 'Sergio Busquets', club: 'Inter Miami', marketValueM: 3 },
  { name: 'Jordi Alba', club: 'Inter Miami', marketValueM: 4 },
  { name: 'Riqui Puig', club: 'LA Galaxy', marketValueM: 18 },
  { name: 'Lorenzo Insigne', club: 'Toronto FC', marketValueM: 6 },
];

export function normalizeImportantName(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getImportantPlayersMap() {
  const byName = new Map<string, ImportantPlayerSeed>();
  for (const item of IMPORTANT_PLAYERS_CATALOG) {
    const key = normalizeImportantName(item.name);
    const current = byName.get(key);
    if (!current || item.marketValueM > current.marketValueM) {
      byName.set(key, item);
    }
  }
  return byName;
}
