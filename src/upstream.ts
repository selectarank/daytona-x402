/**
 * The thing this package wraps: Daytona's sandbox-creation REST API.
 *
 * STATUS OF RealDaytonaUpstream: UNVERIFIED.
 * It is written from Daytona's public OpenAPI spec (https://www.daytona.io/docs/openapi.json,
 * operationId `createSandbox`):
 *   POST {baseUrl}/sandbox            (default baseUrl: https://app.daytona.io/api)
 *   Authorization: Bearer <DAYTONA_API_KEY>
 *   optional header: X-Daytona-Organization-ID (only needed with JWT auth)
 *   body: CreateSandbox (all fields optional: snapshot, name, target, cpu, memory, disk, env, labels, ...)
 *   200 -> Sandbox { id, state, target, toolboxProxyUrl, ... }
 * It has NEVER been run against Daytona's production API, because the author
 * has no Daytona API key. Treat it as untested until you run it with yours.
 *
 * MockUpstream has the same shape and makes no network call.
 */

export interface CreateSandboxArgs {
  /** Snapshot ID or name to create from. Omit to use Daytona's default snapshot. */
  snapshot?: string
  /** Region/target, e.g. "us". Omit for the org default. */
  target?: string
  /** Optional sandbox name. */
  name?: string
  /** Environment variables for the sandbox. */
  env?: Record<string, string>
  /** Auto-stop interval in minutes (0 disables). */
  autoStopInterval?: number
  /** Hard time-to-live in minutes. Recommended so paid sandboxes cannot run forever. */
  ttlMinutes?: number
}

export interface CreateSandboxResult {
  sandboxId: string
  state?: string
  target?: string
  toolboxProxyUrl?: string
}

export interface SandboxUpstream {
  createSandbox(args: CreateSandboxArgs): Promise<CreateSandboxResult>
}

export interface RealDaytonaUpstreamOpts {
  apiKey: string
  /** Default: https://app.daytona.io/api */
  baseUrl?: string
  /** Only for JWT auth; API keys are already scoped to an organization. */
  organizationId?: string
  /** Injectable for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

/** UNVERIFIED against Daytona's production API. See file header. */
export class RealDaytonaUpstream implements SandboxUpstream {
  private apiKey: string
  private baseUrl: string
  private organizationId?: string
  private fetchImpl: typeof fetch

  constructor(opts: RealDaytonaUpstreamOpts) {
    this.apiKey = opts.apiKey
    this.baseUrl = (opts.baseUrl ?? 'https://app.daytona.io/api').replace(/\/+$/, '')
    this.organizationId = opts.organizationId
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async createSandbox(args: CreateSandboxArgs): Promise<CreateSandboxResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (this.organizationId) headers['X-Daytona-Organization-ID'] = this.organizationId

    const res = await this.fetchImpl(`${this.baseUrl}/sandbox`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Daytona API error (${res.status}): ${text}`)
    }

    const data = (await res.json()) as {
      id: string
      state?: string
      target?: string
      toolboxProxyUrl?: string
    }

    return {
      sandboxId: data.id,
      state: data.state,
      target: data.target,
      toolboxProxyUrl: data.toolboxProxyUrl,
    }
  }
}

/** Local-only stand-in for RealDaytonaUpstream. No network call, no Daytona account. */
export class MockUpstream implements SandboxUpstream {
  async createSandbox(args: CreateSandboxArgs): Promise<CreateSandboxResult> {
    return {
      sandboxId: `mock-sandbox-${args.snapshot ?? 'default'}-${Date.now()}`,
      state: 'started',
      target: args.target ?? 'mock',
      toolboxProxyUrl: 'https://mock.daytona.invalid/toolbox',
    }
  }
}
