// Server-only — reads GOOGLE_DISTANCE_MATRIX_API_KEY (no NEXT_PUBLIC_
// prefix), which must never reach the browser bundle.

type LatLng = { lat: number; lng: number };

type DistanceMatrixResponse = {
  status: string;
  error_message?: string;
  rows: {
    elements: {
      status: string;
      duration?: { value: number };
      distance?: { value: number };
    }[];
  }[];
};

export async function fetchDistanceMatrix(
  points: LatLng[],
): Promise<{ durations: number[][]; distances: number[][] }> {
  const apiKey = process.env.GOOGLE_DISTANCE_MATRIX_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_DISTANCE_MATRIX_API_KEY is not configured");
  }

  const locations = points.map((p) => `${p.lat},${p.lng}`).join("|");
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json" +
    `?origins=${encodeURIComponent(locations)}` +
    `&destinations=${encodeURIComponent(locations)}` +
    `&key=${apiKey}`;

  const res = await fetch(url);
  const data = (await res.json()) as DistanceMatrixResponse;

  if (data.status !== "OK") {
    throw new Error(`Distance Matrix API error: ${data.status} ${data.error_message ?? ""}`.trim());
  }

  const durations: number[][] = [];
  const distances: number[][] = [];

  data.rows.forEach((row, i) => {
    durations[i] = [];
    distances[i] = [];
    row.elements.forEach((el, j) => {
      if (el.status !== "OK" || !el.duration || !el.distance) {
        // Unreachable pair (rare) — treat as effectively infinite so the
        // planner never picks it, instead of failing the whole request.
        durations[i][j] = Number.MAX_SAFE_INTEGER;
        distances[i][j] = Number.MAX_SAFE_INTEGER;
      } else {
        durations[i][j] = el.duration.value;
        distances[i][j] = el.distance.value;
      }
    });
  });

  return { durations, distances };
}
