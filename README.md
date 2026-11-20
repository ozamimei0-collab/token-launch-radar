[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ozamimei0-collab/token-launch-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ozamimei0-collab/token-launch-radar/reward.svg)](https://make.fun/c/token-radar-01)

# Token Launch Radar

A radar for protocols that record no token yet: it ranks them by what a launch would be worth and shows a reader how to farm each one. Built for the [make.fun bounty "Build the best token launch radar"](https://make.fun/c/token-radar-01) (token-radar-01, $1,325).

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`, 758 protocols, 40 on the watchlist) and writes:

- `board.json` — the ranked board: every rankable pre-token protocol in the snapshot (the whole 40-protocol watchlist plus every other pre-token protocol below the floor), each with an implied launch value and a seven-step farm plan.
- `data.js` — the same board for the dashboard, beside the page.
- `dashboard/` — a static, offline radar console: a sortable, searchable, filterable board (category, chain, watchlist-only, token status), a detail view for every protocol (the record, the model's working, the farm plan, the risks, an airdrop-readiness checklist), and the live-token protocols kept apart with their market caps.
- `dossier.json` — built with the kit's `vendor/makefun-board.ts`.

## The model (radar-2)

One function scores every row, from the snapshot's own figures only — no protocol name is ever special-cased:

```
implied = round( tvl_usd × 0.30
  × (1 + clamp(change_7d, -50, 150) / 100 × 0.6)
  × (0.55 + min(age_days, 1460) / 1460 × 0.45)
  × (1 + 0.04 × min(chains − 1, 5))
  × category )
```

- **TVL** is the base: a bigger protocol's token is worth more.
- **Seven-day growth** rewards momentum and punishes decline.
- **Age** is the time since DefiLlama first listed the protocol — the best record of how long it has run with no token; an unknown age uses 365 days.
- **Chain diversity** rewards protocols spread across chains.
- **Category** is ×1.10 where a token is the norm (exchanges, lending, yield), ×0.90 where a protocol is usually infrastructure without one of its own (bridges, staking wrappers, chains), ×1.00 otherwise.

Farm plans follow the same rule: the action follows the category, the gas follows the chain (Ethereum is dear, fast chains are pennies), the capital follows the TVL, and the hold follows the age. Every step carries its cost and its time.

Bridges, staking wrappers, exchange products and versioned pools are set aside from the board: they are a wrapped or staked product of a token that already trades, not a launch still to come. The rule is on the category and the shape of the name, never on a name itself — it is the same rule the snapshot's own watchlist was built with.

A protocol on this board **records no token** — the snapshot is a record, not proof, and never a promise that a token is coming. Implied value is this entry's own claim, not a price.

## How to run it

Requires Node.js 22.18 or later. No dependencies to install — standard library only.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. Everything renders offline; the page reads `out/data.js` and makes no network request.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, writes the board, the data and the dossier.
- `lib/model.ts` — the radar-2 model, the farm plans and the board checks.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the radar console.
- `screenshots/` — the board, a protocol's detail view and a filtered view.

## License

MIT — see [LICENSE](LICENSE).
