// Сырьё — это те же product_stickers, что и весь остальной каталог
// (категория "ohapka" — товары, которые продаются поштучно одним видом),
// просто с добавленными складскими полями. Отдельного справочника видов
// больше нет — новый вид сырья заводится обычной кнопкой "+ Добавить"
// на странице "Магазин" и сразу доступен здесь.
export type RawMaterial = {
  id: string;
  product_name: string;
  material_type: "flower" | "greenery" | "packaging" | null;
  unit: string | null;
  default_vase_life_days: number | null;
};

export type Supplier = {
  id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
};

export type BatchRow = {
  id: string;
  product_sticker_id: string;
  remaining: number;
  purchase_date: string;
  estimated_wilt_date: string | null;
  photo_url: string | null;
};
