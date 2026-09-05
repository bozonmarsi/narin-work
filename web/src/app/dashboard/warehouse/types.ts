export type Species = {
  id: string;
  name: string;
  material_type: "flower" | "greenery" | "packaging";
  unit: string;
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
  species_id: string;
  remaining: number;
  purchase_date: string;
  estimated_wilt_date: string | null;
  photo_url: string | null;
};
