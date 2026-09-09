// Те же пороги/проценты, что в tilda-webhook и на карте лояльности
// (tilda/blocks/loyalty-card.html) — держим кассу в одной логике с
// начислением на сайте, чтобы уровень клиента не зависел от того, где
// он купил.
const TIERS = [
  { threshold: 0, cashback: 0.5 },
  { threshold: 300, cashback: 1 },
  { threshold: 600, cashback: 1.5 },
  { threshold: 900, cashback: 2 },
];

export function getCashbackPercent(totalEarned: number): number {
  let cashback = TIERS[0].cashback;
  for (const t of TIERS) {
    if (totalEarned >= t.threshold) cashback = t.cashback;
  }
  return cashback;
}

// Как в get_promo на сайте: баллами можно закрыть не больше 30% суммы.
export function maxRedeemablePoints(orderTotal: number, balance: number): number {
  return Math.max(0, Math.min(balance, Math.floor(orderTotal * 0.3)));
}
