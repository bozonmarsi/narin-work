# /payment (checkout) block

Tilda page 317052403, alias `payment`, T123 block rec 4923114303 (the whole checkout, inline CSS+JS).
The cart it writes into is an alias of rec 1915296063 on page 119898346 (`payment-old`), never delete that page.

- `payment-live.html` — what is live since 2026-11-02 (v3): step 2 "Pro koho jsou květiny?" (me / gift,
  gift without address entered inline), step 3 delivery adapts to it, colour zones, finished steps fold,
  recipient picker improvements, 16px inputs (no iPhone zoom).
- `payment-backup-2026-11-02.html` — the version that was live before (rollback).
- `patch_v3.py` — how v3 was produced from the previous live code plus the recipient picker patch.

Rollback: put `payment-backup-2026-11-02.html` into the code field of rec 4923114303 (Tilda MCP
`update_record` with `only_field: code`, or paste in the editor) and publish page 317052403.
