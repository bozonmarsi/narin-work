export function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// product_stickers.product_name comes from Tilda with raw HTML entities
// (Tilda's Czech-character handling is spotty) — decode via the DOM instead
// of hand-mapping entities, since we don't know which ones will show up.
export function decodeHtmlEntities(text: string) {
  if (typeof window === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}
