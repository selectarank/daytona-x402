/**
 * A payment-gated HTTP resource server: `POST /sandbox` creates a Daytona
 * sandbox, paid per-call in USDC via x402 (HTTP 402), with no Daytona account
 * or API key required from the caller (the operator's DAYTONA_API_KEY is used
 * server-side after payment settles).
 *
 * Payment logic is entirely the official @x402/* packages; this file only
 * wires them in front of a SandboxUpstream.
 */
import express, { type Express } from 'express'
import { paymentMiddleware } from '@x402/express'
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import type { SandboxUpstream } from './upstream.js'

export interface CreatePaidSandboxAppOpts {
  /** RealDaytonaUpstream in production, MockUpstream in tests/demos. */
  upstream: SandboxUpstream
  /** USDC-receiving address. Supplied by the deployment owner; never generated here. */
  payTo: `0x${string}`
  /** x402 facilitator used to verify/settle payments. */
  facilitatorUrl: string
  /** CAIP-2 network id. Defaults to Base Sepolia (testnet). */
  network?: `${string}:${string}`
  /** Price per sandbox creation, e.g. "$0.05". */
  pricePerSandbox?: string
  /** Applied as ttlMinutes when the caller does not send one (caps cost exposure). Default 60. */
  defaultTtlMinutes?: number
}

export function createPaidSandboxApp(opts: CreatePaidSandboxAppOpts): Express {
  const network = opts.network ?? 'eip155:84532'
  const price = opts.pricePerSandbox ?? '$0.05'
  const defaultTtl = opts.defaultTtlMinutes ?? 60

  const facilitatorClient = new HTTPFacilitatorClient({ url: opts.facilitatorUrl })
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    network,
    new ExactEvmScheme(),
  )

  const app = express()
  app.use(express.json())

  app.post(
    '/sandbox',
    paymentMiddleware(
      {
        'POST /sandbox': {
          accepts: [{ scheme: 'exact', price, network, payTo: opts.payTo }],
          description:
            'Create a fresh Daytona sandbox. Pay-per-call in USDC via x402 — no Daytona account or API key needed.',
          mimeType: 'application/json',
        },
      },
      resourceServer,
    ),
    async (req, res) => {
      try {
        const b = req.body ?? {}
        const sandbox = await opts.upstream.createSandbox({
          snapshot: typeof b.snapshot === 'string' ? b.snapshot : undefined,
          target: typeof b.target === 'string' ? b.target : undefined,
          name: typeof b.name === 'string' ? b.name : undefined,
          env: b.env && typeof b.env === 'object' ? b.env : undefined,
          autoStopInterval: typeof b.autoStopInterval === 'number' ? b.autoStopInterval : undefined,
          ttlMinutes: typeof b.ttlMinutes === 'number' ? Math.min(b.ttlMinutes, defaultTtl) : defaultTtl,
        })
        res.json(sandbox)
      } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'daytona-x402' })
  })

  return app
}
