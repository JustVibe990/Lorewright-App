// NPC names by species, put together from sounds that fit each one
// (Lorewright's own lists, not any book's).

type Parts = { first: string[]; second: string[]; last?: [string[], string[]] };

const SPECIES: Record<string, Parts> = {
  Human: {
    first: ["Al", "Bran", "Cor", "Da", "El", "Gar", "Hal", "Is", "Jo", "Ka", "Le", "Mar", "Ned", "Os", "Per", "Ro", "Sa", "Tom", "Wil", "Ys"],
    second: ["ric", "na", "wen", "las", "ard", "ine", "o", "an", "eth", "ia", "mund", "en", "ella", "is", "ton", "a"],
    last: [["Ash", "Black", "Brook", "Cold", "Fair", "Green", "Hart", "High", "Mill", "Oak", "Red", "Stone", "Thorn", "White"], ["field", "wood", "ford", "well", "water", "hill", "man", "smith", "wright", "brook", "ley", "ton"]],
  },
  Elf: {
    first: ["Ae", "Ara", "Cael", "Eli", "Fae", "Gal", "Ila", "Lia", "Mira", "Nae", "Quel", "Rae", "Sil", "Tha", "Vae", "Yl"],
    second: ["dril", "lith", "wyn", "ion", "riel", "thas", "lara", "nor", "sel", "vain", "rian", "ndra", "thil", "las"],
    last: [["Amber", "Dawn", "Moon", "Silver", "Star", "Leaf", "Mist", "Night", "Wind", "Gold"], ["whisper", "bough", "song", "blossom", "shadow", "brook", "flower", "petal", "wing"]],
  },
  Dwarf: {
    first: ["Bal", "Bor", "Dag", "Dur", "Gim", "Grun", "Har", "Kil", "Mor", "Orn", "Rur", "Thar", "Tor", "Vond", "Bel", "Ris"],
    second: ["in", "ak", "dek", "grim", "na", "dra", "rin", "gar", "unn", "bek", "da", "ka"],
    last: [["Iron", "Stone", "Fire", "Gold", "Frost", "Deep", "Battle", "Hammer", "Anvil", "Coal"], ["beard", "fist", "forge", "hold", "helm", "shield", "brow", "delver", "breaker"]],
  },
  Halfling: {
    first: ["Ali", "Bree", "Cad", "Ella", "Fin", "Jil", "Kith", "Lav", "Mer", "Nor", "Pip", "Rose", "Sera", "Tob", "Wel"],
    second: ["ton", "ry", "ie", "o", "bell", "in", "a", "wick", "by", "en", "y"],
    last: [["Apple", "Brush", "Good", "Hill", "Honey", "Tea", "Under", "Thistle", "High", "Tall"], ["barrel", "gather", "toes", "bottom", "leaf", "foot", "kettle", "hollow", "berry"]],
  },
  Gnome: {
    first: ["Bim", "Dim", "Fon", "Gim", "Jeb", "Nim", "Orl", "Pock", "Quil", "Sin", "Wren", "Zan", "Bree", "Ella"],
    second: ["ble", "kin", "wick", "dle", "nik", "ra", "bo", "pip", "ella", "doodle", "ny"],
    last: [["Cog", "Gear", "Spark", "Tinker", "Whistle", "Fizzle", "Copper", "Button"], ["spinner", "wobble", "nose", "top", "bang", "wick", "pocket", "sprocket"]],
  },
  "Half-orc": {
    first: ["Dench", "Feng", "Gell", "Hen", "Holg", "Krusk", "Mhur", "Ront", "Shump", "Thok", "Baggi", "Emen", "Engong", "Ovak", "Sutha", "Volen"],
    second: ["", "", "a", "ash", "uk", "ra", "og"],
  },
  Tiefling: {
    first: ["Ak", "Bar", "Dam", "Ek", "Kal", "Leu", "Mor", "Nem", "Ori", "Skam", "Ze", "Bry", "Kri", "Mak", "Ria"],
    second: ["menos", "akas", "aios", "emon", "thos", "ia", "seis", "lith", "kos", "mara", "zeth"],
  },
  Dragonborn: {
    first: ["Arj", "Bal", "Don", "Ghe", "Hes", "Kriv", "Med", "Nad", "Pand", "Rho", "Shed", "Tar", "Akr", "Bir", "Dar", "Kava", "Sora"],
    second: ["han", "asar", "aar", "esh", "ken", "rash", "inn", "jed", "arr", "ra", "ann", "ith"],
  },
};

// Tieflings sometimes take a name for a virtue or idea.
const VIRTUES = ["Hope", "Ash", "Ember", "Glory", "Quiet", "Sorrow", "Temper", "Wander", "Reverie", "Mercy", "Torment", "Ideal"];

export const NAME_SPECIES = Object.keys(SPECIES);

const pick = <T,>(xs: T[], rng: () => number) => xs[Math.floor(rng() * xs.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One name for this species. */
export function makeName(species: string, rng: () => number = Math.random): string {
  const p = SPECIES[species] ?? SPECIES.Human;
  if (species === "Tiefling" && rng() < 0.25) return pick(VIRTUES, rng);
  const first = cap(pick(p.first, rng) + pick(p.second, rng));
  if (!p.last || rng() < 0.15) return first;
  return `${first} ${cap(pick(p.last[0], rng) + pick(p.last[1], rng))}`;
}

/** A handful of different names to choose from. */
export function makeNames(species: string, n = 6, rng: () => number = Math.random): string[] {
  const out = new Set<string>();
  for (let i = 0; out.size < n && i < n * 10; i++) out.add(makeName(species, rng));
  return [...out];
}
