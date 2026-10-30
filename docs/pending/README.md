# Pending Tilda changes (written and tested locally, NOT published)

Apply to the live block, then publish the page. Always back up the live block code first.

| Patch | Block | Page | Needs |
|---|---|---|---|
| `checkout-recipient-picker-2026-10-30.diff` | T123 rec 4923114303 (new checkout) | /payment, page 317052403 | migration 20261030040000 applied |

The diff was made against the live code of 2026-10-30. If the live block changed since, redo the edits by hand.
Decision 2026-10-30: orders "for me" are NOT remembered (name and phone come from the profile); only people the customer sends to.
