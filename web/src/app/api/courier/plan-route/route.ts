import { createClient } from "@supabase/supabase-js";
import { fetchDistanceMatrix } from "@/lib/google-distance-matrix";
import { planRoute } from "@/lib/route-planner";
import { parseSlotRange } from "@/lib/schedule";

// Google Distance Matrix caps origins/destinations per request; couriers
// realistically have a handful of stops per slot, so this is a generous
// ceiling that exists purely to fail loudly instead of sending a request
// Google would reject anyway.
const MAX_STOPS = 20;

const UNREACHABLE = Number.MAX_SAFE_INTEGER;

function minutesFromMidnight(isoTimestamp: string): number {
  const [hours, minutes] = isoTimestamp.slice(11, 16).split(":").map(Number);
  return hours * 60 + minutes;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { orderIds, slot } = (await request.json()) as { orderIds: string[]; slot?: string | null };
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return Response.json({ error: "orderIds обязателен" }, { status: 400 });
  }
  if (orderIds.length > MAX_STOPS) {
    return Response.json(
      { error: `Слишком много точек за раз (${orderIds.length}), максимум ${MAX_STOPS}` },
      { status: 400 },
    );
  }

  // Scoped with the caller's own JWT — RLS applies exactly as it would for
  // any client-side query, so a courier only ever gets back their own
  // orders. No service-role key involved anywhere in this route.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const [ordersRes, warehouseRes] = await Promise.all([
    supabase
      .from("tilda_orders")
      .select("id, recipient_lat, recipient_lng, delivery_slot, delivery_window_start, delivery_window_end")
      .in("id", orderIds),
    supabase.from("warehouse_location").select("lat, lng").eq("id", true).single(),
  ]);

  if (ordersRes.error) {
    return Response.json({ error: ordersRes.error.message }, { status: 400 });
  }
  if (warehouseRes.error || warehouseRes.data?.lat == null || warehouseRes.data?.lng == null) {
    return Response.json({ error: "Адрес склада не настроен (нет координат)" }, { status: 400 });
  }

  const orders = ordersRes.data;
  const withCoords = orders.filter((o) => o.recipient_lat != null && o.recipient_lng != null);
  const unplaced = new Set(
    orders.filter((o) => o.recipient_lat == null || o.recipient_lng == null).map((o) => o.id),
  );

  if (withCoords.length === 0) {
    return Response.json({
      stops: [],
      unplaced: [...unplaced],
      totalDurationSeconds: 0,
      totalDistanceMeters: 0,
    });
  }

  const warehouse = { lat: warehouseRes.data.lat, lng: warehouseRes.data.lng };
  const points = [warehouse, ...withCoords.map((o) => ({ lat: o.recipient_lat!, lng: o.recipient_lng! }))];

  let matrix;
  try {
    matrix = await fetchDistanceMatrix(points);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Ошибка расчёта маршрута" },
      { status: 502 },
    );
  }

  // A stop Google genuinely can't route to/from the warehouse (bad
  // geocoding, an island, whatever) would otherwise get a
  // Number.MAX_SAFE_INTEGER "duration" and eventually be forced into the
  // route anyway once it's the only one left, showing the courier a
  // nonsense multi-million-minute ETA. Pull those out as unplaced instead —
  // same as if they had no coordinates at all.
  const routableIndexes: number[] = [];
  withCoords.forEach((o, i) => {
    const matrixIdx = i + 1;
    const reachable = matrix.durations[0][matrixIdx] < UNREACHABLE && matrix.durations[matrixIdx][0] < UNREACHABLE;
    if (reachable) {
      routableIndexes.push(i);
    } else {
      unplaced.add(o.id);
    }
  });

  if (routableIndexes.length === 0) {
    return Response.json({ stops: [], unplaced: [...unplaced], totalDurationSeconds: 0, totalDistanceMeters: 0 });
  }

  // Re-index the matrix down to just the routable subset (warehouse stays
  // index 0) so the planner never sees the dropped stops at all.
  const matrixIndexMap = [0, ...routableIndexes.map((i) => i + 1)];
  const durationMatrix = matrixIndexMap.map((row) => matrixIndexMap.map((col) => matrix.durations[row][col]));
  const distanceMatrix = matrixIndexMap.map((row) => matrixIndexMap.map((col) => matrix.distances[row][col]));
  const routableOrders = routableIndexes.map((i) => withCoords[i]);

  // The caller (which already knows exactly which slot group this is for)
  // sends the slot explicitly — don't try to re-derive it from "whichever
  // order happens to be first" in the DB response, since row order isn't
  // guaranteed to match the client's array and a missing/mismatched slot on
  // just one order would silently corrupt the whole route's timing.
  const DEFAULT_SLOT_START_HOUR = 9; // business opens at 9:00 — safer default
  // than "right now", which could be hours off from the actual slot.
  const slotStart =
    parseSlotRange(slot ?? null)?.start ?? parseSlotRange(routableOrders[0].delivery_slot)?.start ?? DEFAULT_SLOT_START_HOUR;
  const startMinutes = slotStart * 60;

  const plannerStops = routableOrders.map((o) => ({
    id: o.id,
    notBeforeMinutes: o.delivery_window_start ? minutesFromMidnight(o.delivery_window_start) : null,
    notAfterMinutes: o.delivery_window_end ? minutesFromMidnight(o.delivery_window_end) : null,
  }));

  const stops = planRoute({ stops: plannerStops, durationMatrix, distanceMatrix, startMinutes });

  const totalDurationSeconds = stops.reduce((sum, s) => sum + s.legDurationSeconds, 0);
  const totalDistanceMeters = stops.reduce((sum, s) => sum + s.legDistanceMeters, 0);

  return Response.json({
    stops: stops.map((s) => ({ orderId: s.id, ...s })),
    unplaced: [...unplaced],
    totalDurationSeconds,
    totalDistanceMeters,
  });
}
