import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { createPaidSandboxApp } from '../src/server.js'
import { MockUpstream, RealDaytonaUpstream } from '../src/upstream.js'
import type { CreateSandboxArgs, SandboxUpstream } from '../src/upstream.js'
import { startMockFacilitator } from '../src/mockFacilitator.mjs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'

// Throwaway, unfunded demo receiving address (no key held). The signer below is generated at runtime.
const PAY_TO = '0x6F388B8629D3BE977EFa43Cb581845C8642cf5f8' as const
const NETWORK = 'eip155:84532'

let facilitator: Server
let sandboxServer: Server
let baseUrl: string
const seen: CreateSandboxArgs[] = []

const recording: SandboxUpstream = {
  async createSandbox(args) {
    seen.push(args)
    return new MockUpstream().createSandbox(args)
  },
}

beforeAll(async () => {
  facilitator = (await startMockFacilitator(0)) as unknown as Server
  const fa = facilitator.address()
  const facilitatorUrl = `http://localhost:${typeof fa === 'object' && fa ? fa.port : 4099}`

  const app = createPaidSandboxApp({
    upstream: recording,
    payTo: PAY_TO,
    facilitatorUrl,
    network: NETWORK,
    pricePerSandbox: '$0.05',
    defaultTtlMinutes: 30,
  })
  await new Promise<void>((resolve) => {
    sandboxServer = app.listen(0, resolve)
  })
  const addr = sandboxServer.address()
  baseUrl = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 4022}`
})

afterAll(() => {
  sandboxServer?.close()
  facilitator?.close()
})

describe('daytona-x402 createPaidSandboxApp', () => {
  it('answers health checks without payment', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'daytona-x402' })
  })

  it('returns HTTP 402 with correct payment requirements when unpaid', async () => {
    const before = seen.length
    const res = await fetch(`${baseUrl}/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: 'base' }),
    })
    expect(res.status).toBe(402)
    const header = res.headers.get('payment-required')
    expect(header).toBeTruthy()
    const decoded = JSON.parse(Buffer.from(header!, 'base64').toString('utf-8'))
    expect(decoded.accepts[0]).toMatchObject({ scheme: 'exact', network: NETWORK, payTo: PAY_TO })
    expect(seen.length).toBe(before) // upstream never called without payment
  })

  it('creates a sandbox once a valid x402 payment is presented', async () => {
    const signer = privateKeyToAccount(generatePrivateKey())
    const client = new x402Client()
    client.register(NETWORK, new ExactEvmScheme(signer))
    const fetchWithPayment = wrapFetchWithPayment(fetch, client)

    const res = await fetchWithPayment(`${baseUrl}/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: 'base', ttlMinutes: 9999 }),
    })
    expect(res.status).toBe(200)
    const sandbox = await res.json()
    expect(sandbox.sandboxId).toMatch(/^mock-sandbox-base-/)
    expect(sandbox.state).toBe('started')
    // caller-supplied ttl is capped at the operator's default
    expect(seen.at(-1)).toMatchObject({ snapshot: 'base', ttlMinutes: 30 })
  })
})

describe('RealDaytonaUpstream request shape (stubbed fetch; UNVERIFIED against real Daytona)', () => {
  it('sends Bearer auth to POST {baseUrl}/sandbox and maps the response', async () => {
    let captured: { url: string; init: RequestInit } | undefined
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(
        JSON.stringify({ id: 'sb-1', state: 'creating', target: 'us', toolboxProxyUrl: 'https://t.example' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const up = new RealDaytonaUpstream({ apiKey: 'test-key', fetchImpl })
    const out = await up.createSandbox({ snapshot: 's', ttlMinutes: 5 })

    expect(captured!.url).toBe('https://app.daytona.io/api/sandbox')
    expect(captured!.init.method).toBe('POST')
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    expect(JSON.parse(captured!.init.body as string)).toEqual({ snapshot: 's', ttlMinutes: 5 })
    expect(out).toEqual({ sandboxId: 'sb-1', state: 'creating', target: 'us', toolboxProxyUrl: 'https://t.example' })
  })

  it('throws on non-2xx', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const up = new RealDaytonaUpstream({ apiKey: 'x', fetchImpl })
    await expect(up.createSandbox({})).rejects.toThrow(/Daytona API error \(401\)/)
  })
})
