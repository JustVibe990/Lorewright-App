// Display labels for character-builder values.

import { ABILITY_NAMES, type Ability, type Choice } from "../../lib/character/types.ts";

const cap = (s: string) => s.replace(/(^|\s|-)\w/g, (c) => c.toUpperCase());
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** "Name|SOURCE" → "Name (SOURCE)"; abilities → full names; skills/tools → capitalised. */
export function optionLabel(choice: Pick<Choice, "type" | "labels">, value: string): string {
  if (choice.labels?.[value]) return choice.labels[value];
  if (choice.type === "ability" || choice.type === "save") return ABILITY_NAMES[value as Ability] ?? value;
  if (choice.type === "racealternative") return `Option ${Number(value) + 1}`;
  if (value.startsWith("feat:")) return refLabel(value.slice(5));
  if (value.includes("|")) return refLabel(value);
  return cap(value);
}

export function refLabel(ref: string): string {
  const [name, source] = ref.split("|");
  return source ? `${name} (${source})` : name;
}

export const refName = (ref: string) => ref.split("|")[0];

export const KIND_OF_CHOICE: Partial<Record<Choice["type"], string>> = {
  skill: "Skills",
  language: "Languages",
  tool: "Tools",
  expertise: "Expertise",
  ability: "Ability scores",
  save: "Saving throw",
  subclass: "Subclass",
  asi: "Ability Score Improvement",
  feat: "Feat",
  optionalfeature: "Class option",
};
