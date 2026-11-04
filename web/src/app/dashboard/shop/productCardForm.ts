// Перевод строки product_cards в поля редактора и обратно. Отдельно от
// компонента, чтобы разбор строк можно было проверить без браузера.
// В payload идут только поля редактора: genus/role/tone/tool (на них держатся
// рекомендации) редактор не трогает.

export type CardHighlight = { title: string; text?: string };
export type CardSection = { title?: string; items?: string[] } & Record<string, unknown>;

export type CardRow = {
  status: string;
  description: string | null;
  height_text: string | null;
  vase_life_min: number | null;
  vase_life_max: number | null;
  vase_life_note: string | null;
  water_text: string | null;
  cut_text: string | null;
  scent_text: string | null;
  scent_level: number | null;
  pet_text: string | null;
  pet_note: string | null;
  important_note: string | null;
  highlights: CardHighlight[] | null;
  care_steps: string[] | null;
  extra_sections: CardSection[] | null;
  images: string[] | null;
  extra_images: string[] | null;
};

export type CardForm = {
  visible: boolean;
  description: string;
  height: string;
  vaseMin: string;
  vaseMax: string;
  vaseNote: string;
  water: string;
  cut: string;
  scentText: string;
  scentLevel: string;
  petText: string;
  petNote: string;
  importantNote: string;
  highlights: string;
  care: string;
  composition: string;
  extraImages: string[];
};

const COMPOSITION = "Složení";

function lines(value: string): string[] {
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

function textOrNull(value: string): string | null {
  return value.trim() || null;
}

function intOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function emptyCardForm(): CardForm {
  return {
    visible: true,
    description: "",
    height: "",
    vaseMin: "",
    vaseMax: "",
    vaseNote: "",
    water: "",
    cut: "",
    scentText: "",
    scentLevel: "",
    petText: "",
    petNote: "",
    importantNote: "",
    highlights: "",
    care: "",
    composition: "",
    extraImages: [],
  };
}

export function formatHighlight(h: CardHighlight): string {
  return h.text ? `${h.title} — ${h.text}` : h.title;
}

export function parseHighlight(line: string): CardHighlight {
  const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(line);
  return m ? { title: m[1].trim(), text: m[2].trim() } : { title: line };
}

export function cardToForm(row: CardRow): CardForm {
  const composition = (row.extra_sections ?? []).find((s) => s.title === COMPOSITION);
  return {
    visible: row.status === "ready",
    description: row.description ?? "",
    height: row.height_text ?? "",
    vaseMin: row.vase_life_min?.toString() ?? "",
    vaseMax: row.vase_life_max?.toString() ?? "",
    vaseNote: row.vase_life_note ?? "",
    water: row.water_text ?? "",
    cut: row.cut_text ?? "",
    scentText: row.scent_text ?? "",
    scentLevel: row.scent_level?.toString() ?? "",
    petText: row.pet_text ?? "",
    petNote: row.pet_note ?? "",
    importantNote: row.important_note ?? "",
    highlights: (row.highlights ?? []).map(formatHighlight).join("\n"),
    care: (row.care_steps ?? []).join("\n"),
    composition: (composition?.items ?? []).join("\n"),
    extraImages: row.extra_images ?? [],
  };
}

export function validateCardForm(form: CardForm): string | null {
  const min = intOrNull(form.vaseMin);
  const max = intOrNull(form.vaseMax);
  for (const v of [min, max]) {
    if (v !== null && (!Number.isInteger(v) || v <= 0)) return "Срок в вазе — целое число дней";
  }
  if ((min === null) !== (max === null)) return "Срок в вазе: заполните оба поля — от и до";
  if (min !== null && max !== null && min > max) return "Срок в вазе: «от» больше, чем «до»";
  return null;
}

export function formToPayload(form: CardForm, sections: CardSection[] | null) {
  const items = lines(form.composition);
  const otherSections = (sections ?? []).filter((s) => s.title !== COMPOSITION);
  const highlights = lines(form.highlights).map(parseHighlight);
  return {
    description: textOrNull(form.description),
    height_text: textOrNull(form.height),
    vase_life_min: intOrNull(form.vaseMin),
    vase_life_max: intOrNull(form.vaseMax),
    vase_life_note: textOrNull(form.vaseNote),
    water_text: textOrNull(form.water),
    cut_text: textOrNull(form.cut),
    scent_text: textOrNull(form.scentText),
    scent_level: intOrNull(form.scentLevel),
    pet_text: textOrNull(form.petText),
    pet_note: textOrNull(form.petNote),
    important_note: textOrNull(form.importantNote),
    // null — значит советы подставятся общие для этого цветка.
    highlights: highlights.length ? highlights : null,
    care_steps: lines(form.care),
    extra_sections: items.length ? [...otherSections, { title: COMPOSITION, items }] : otherSections,
    extra_images: form.extraImages,
  };
}
