import { NextResponse } from 'next/server'
import { drainDuePendingExecutions } from '@/lib/automations/engine'

declare const process: any

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.AUTOMATION_CRON_SECRET || process.env.CRON_SECRET
  if (!expectedSecret) {
    // If no secret is configured, allow the call so cron pingers / internal drains work without setup
    return true
  }

  const suppliedX = request.headers.get('x-cron-secret')
  if (suppliedX && suppliedX === expectedSecret) return true

  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token === expectedSecret) return true
  }

  return false
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const processed = await drainDuePendingExecutions()
  return NextResponse.json({ ok: true, processed })
}

export async function POST(request: Request) {
  return GET(request)
}
