# daytona-x402

Pay-per-sandbox access to [Daytona](https://www.daytona.io) via the [x402](https://www.x402.org/) protocol (HTTP 402, USDC). A caller with a wallet but no Daytona account can get a sandbox by paying a few cents; the operator's `DAYTONA_API_KEY` is used server-side after payment settles.

Standalone package. Not a fork of, and not affiliated with, Daytona.

## Status (read this first)

| Piece | Status |
|---|---|
| x402 gating (`POST /sandbox` -> 402 until paid) | Tested (`npm test`) against a **local mock facilitator** that accepts any payload. Real signature verification / on-chain settlement is **not** exercised here. |
| `MockUpstream` | Tested. Makes no network call. |
| `RealDaytonaUpstream` | **UNVERIFIED.** Written from Daytona's public OpenAPI spec (`POST https://app.daytona.io/api/sandbox`, `Authorization: Bearer <key>`, response `{ id, state, target, toolboxProxyUrl, ... }`). Only its request shape is unit-tested with a stubbed `fetch`. It has never been run against Daytona's production API (the author has no Daytona key). |
| Real facilitator (`https://x402.org/facilitator`, CDP) | Not tested. |

## Endpoints

```
POST /sandbox   -> 402 until paid, then creates a sandbox: { sandboxId, state, target, toolboxProxyUrl }
GET  /health
```

Body (all optional): `snapshot`, `target`, `name`, `env`, `autoStopInterval`, `ttlMinutes`. `ttlMinutes` is capped at the operator's `defaultTtlMinutes` (default 60) so a paid call cannot create an unbounded sandbox.

## Quickstart (no key, no wallet, no cost)

```bash
npm install
npm run dev:server     # local mock facilitator + MockUpstream
curl -i -X POST localhost:4022/sandbox -H 'Content-Type: application/json' -d '{}'
# -> 402, requirements in the `payment-required` header (base64 JSON)
npm test               # full paid round trip with a runtime-generated throwaway signer
```

## Configuration

| Env var | Meaning | Default |
|---|---|---|
| `DAYTONA_API_KEY` | Daytona API key. Unset = `MockUpstream`. Set = `RealDaytonaUpstream` (unverified). | unset |
| `PAY_TO` | Your USDC-receiving address. | throwaway demo address; do not use in production |
| `FACILITATOR_URL` | x402 facilitator. | local mock (testing only) |
| `NETWORK` | CAIP-2 network id. | `eip155:84532` (Base Sepolia) |
| `PRICE_PER_SANDBOX` | Price, e.g. `$0.05`. | `$0.05` |
| `DAYTONA_API_URL` | Override API base. | `https://app.daytona.io/api` |

```bash
DAYTONA_API_KEY=... PAY_TO=0xYourWallet FACILITATOR_URL=https://x402.org/facilitator npm run dev:server
```

## Library use

```ts
import { createPaidSandboxApp, RealDaytonaUpstream } from 'daytona-x402'
const app = createPaidSandboxApp({
  upstream: new RealDaytonaUpstream({ apiKey: process.env.DAYTONA_API_KEY! }),
  payTo: '0x...', facilitatorUrl: 'https://x402.org/facilitator',
})
```

## Files

- `src/server.ts` payment-gated Express app · `src/upstream.ts` `RealDaytonaUpstream` + `MockUpstream` · `src/devServer.ts` entrypoint · `src/mockFacilitator.mjs` offline facilitator double · `test/server.test.ts`

MIT licensed.
