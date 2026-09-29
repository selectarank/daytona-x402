/**
 * Runnable entrypoint.
 *
 * Demo mode (no env vars): starts a local mock facilitator and uses MockUpstream.
 * Live mode: DAYTONA_API_KEY=... PAY_TO=0x... FACILITATOR_URL=https://x402.org/facilitator npm run dev:server
 * (Live mode calls RealDaytonaUpstream, which is UNVERIFIED against Daytona's production API.)
 */
import { createPaidSandboxApp } from './server.js'
import { RealDaytonaUpstream, MockUpstream } from './upstream.js'
import { startMockFacilitator } from './mockFacilitator.mjs'

const PORT = parseInt(process.env.PORT || '4022', 10)
const FACILITATOR_PORT = parseInt(process.env.FACILITATOR_PORT || '4099', 10)

async function main() {
  let facilitatorUrl = process.env.FACILITATOR_URL
  if (!facilitatorUrl) {
    await startMockFacilitator(FACILITATOR_PORT)
    facilitatorUrl = `http://localhost:${FACILITATOR_PORT}`
    console.log(`[demo mode] started local mock facilitator on ${facilitatorUrl}`)
  }

  const apiKey = process.env.DAYTONA_API_KEY
  const upstream = apiKey
    ? new RealDaytonaUpstream({ apiKey, baseUrl: process.env.DAYTONA_API_URL })
    : new MockUpstream()
  if (!apiKey) console.log('[demo mode] no DAYTONA_API_KEY — using MockUpstream (no real sandboxes)')

  // Throwaway, unfunded demo address; set PAY_TO to your own wallet before going live.
  const payTo = (process.env.PAY_TO ?? '0x6F388B8629D3BE977EFa43Cb581845C8642cf5f8') as `0x${string}`
  if (!process.env.PAY_TO) console.log(`[demo mode] no PAY_TO — using throwaway demo address ${payTo}`)

  const price = process.env.PRICE_PER_SANDBOX || '$0.05'
  const app = createPaidSandboxApp({
    upstream,
    payTo,
    facilitatorUrl,
    network: (process.env.NETWORK as `${string}:${string}` | undefined) ?? undefined,
    pricePerSandbox: price,
  })

  app.listen(PORT, () => {
    console.log(`\ndaytona-x402 listening on http://localhost:${PORT}`)
    console.log(`  POST /sandbox  - create a sandbox, gated by x402 (${price})`)
    console.log(`  GET  /health\n`)
  })
}

main().catch((err) => {
  console.error('failed to start dev server:', err)
  process.exit(1)
})
