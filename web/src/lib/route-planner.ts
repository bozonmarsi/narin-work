// Pure route-sequencing logic — no network/IO, so it's cheap to reason about
// and doesn't need mocking to test. Greedy nearest-neighbour, with wishes
// handled in two ways:
//
// - "Not before" wishes gate READINESS: a stop the courier would reach too
//   early is set aside (not picked yet) rather than visited just because
//   it's close — visiting it early doesn't actually help, the flowers still
//   can't be handed over before the wish anyway.
// - "Not after" wishes gate URGENCY: among the stops that ARE ready, one
//   with a tighter deadline is preferred over a merely-closer stop with no
//   deadline, using slack (deadline minus prospective arrival) as the sort
//   key. Otherwise a "nearest first" courier could burn the buffer on
//   convenient-but-unconstrained stops and blow through someone's deadline
//   later purely by bad luck of geography.
// - If nothing is ready yet (everything left still has a future "not
//   before"), waiting for the nearest one is pointless if a farther one
//   opens up sooner — pick whichever becomes ready soonest instead.
// - A stop that would already be missed if visited next is excluded
//   entirely (unless literally nothing fits any more, in which case we
//   still produce *a* route rather than give up).
//
// Deliberately simple (no 2-opt, no real TSP solver): the stop count per
// courier per slot is small (a handful), so a good-enough greedy route beats
// an "optimal" one that's harder to reason about when something looks off.

export type PlannerStop = {
  id: string;
  notBeforeMinutes?: number | null;
  notAfterMinutes?: number | null;
};

export type PlannedStop = {
  id: string;
  sequence: number;
  etaMinutesFromStart: number;
  legDurationSeconds: number;
  legDistanceMeters: number;
  // True when this stop's own "not later than" wish couldn't be honoured —
  // typically because it conflicts with another stop's wish (both can't be
  // reached in time by the same courier) rather than a bug in the ordering.
  missedDeadline: boolean;
  // Carried through so the UI can show the courier the actual wish in plain
  // terms ("успеть до 09:30"), not just derived ETA math.
  notBeforeMinutes: number | null;
  notAfterMinutes: number | null;
};

const NO_DEADLINE_SLACK = Number.MAX_SAFE_INTEGER;

export function planRoute({
  stops,
  durationMatrix,
  distanceMatrix,
  startMinutes,
}: {
  stops: PlannerStop[];
  // Index 0 is the warehouse; indices 1..N correspond to `stops` in order.
  durationMatrix: number[][];
  distanceMatrix: number[][];
  startMinutes: number;
}): PlannedStop[] {
  const remaining = stops.map((_, i) => i + 1);
  const result: PlannedStop[] = [];
  let current = 0;
  let currentTimeMinutes = startMinutes;
  let sequence = 1;

  while (remaining.length > 0) {
    const candidates = remaining.map((idx) => {
      const stop = stops[idx - 1];
      const legSeconds = durationMatrix[current][idx];
      const rawArrival = currentTimeMinutes + legSeconds / 60;
      const isReady = stop.notBeforeMinutes == null || rawArrival >= stop.notBeforeMinutes;
      const arrival = stop.notBeforeMinutes != null ? Math.max(rawArrival, stop.notBeforeMinutes) : rawArrival;
      const violatesNotAfter = stop.notAfterMinutes != null && arrival > stop.notAfterMinutes;
      const slack = stop.notAfterMinutes != null ? stop.notAfterMinutes - arrival : NO_DEADLINE_SLACK;
      return {
        idx,
        legSeconds,
        arrival,
        isReady,
        violatesNotAfter,
        slack,
        notBeforeMinutes: stop.notBeforeMinutes,
        notAfterMinutes: stop.notAfterMinutes,
      };
    });

    const eligible = candidates.filter((c) => !c.violatesNotAfter);
    // Nobody fits their window any more (courier is already running late) —
    // still produce a route rather than giving up, just pick nearest overall.
    const pool = eligible.length > 0 ? eligible : candidates;

    const ready = pool.filter((c) => c.isReady);
    let chosen;
    if (ready.length > 0) {
      // Tightest deadline first; among equally (un)urgent stops, nearest first.
      ready.sort((a, b) => a.slack - b.slack || a.legSeconds - b.legSeconds);
      chosen = ready[0];
    } else {
      pool.sort((a, b) => (a.notBeforeMinutes ?? 0) - (b.notBeforeMinutes ?? 0));
      chosen = pool[0];
    }

    result.push({
      id: stops[chosen.idx - 1].id,
      sequence,
      etaMinutesFromStart: Math.round(chosen.arrival - startMinutes),
      legDurationSeconds: Math.round(chosen.legSeconds),
      legDistanceMeters: Math.round(distanceMatrix[current][chosen.idx]),
      missedDeadline: chosen.notAfterMinutes != null && chosen.arrival > chosen.notAfterMinutes,
      notBeforeMinutes: chosen.notBeforeMinutes ?? null,
      notAfterMinutes: chosen.notAfterMinutes ?? null,
    });

    current = chosen.idx;
    currentTimeMinutes = chosen.arrival;
    sequence += 1;
    remaining.splice(remaining.indexOf(chosen.idx), 1);
  }

  return result;
}
