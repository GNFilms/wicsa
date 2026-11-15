import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';

export interface DealActivityItem {
  id: string;
  deal_id: string;
  user_id?: string | null;
  account_id?: string | null;
  activity_type:
    | 'created'
    | 'stage_change'
    | 'assignee_change'
    | 'description_update'
    | 'due_date_change'
    | 'status_change'
    | 'value_change';
  actor_name: string;
  details?: Record<string, any>;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get('deal_id');
    const sort = searchParams.get('sort') === 'oldest' ? 'asc' : 'desc';

    if (!dealId) {
      return NextResponse.json({ error: 'deal_id is required' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('deal_activities')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: sort === 'asc' });

    if (error) {
      // If table does not exist yet (migration pending in Supabase), return empty array gracefully
      return NextResponse.json({ success: true, activities: [], warning: error.message });
    }

    return NextResponse.json({
      success: true,
      activities: (data as DealActivityItem[]) || [],
    });
  } catch (err: unknown) {
    console.error('Deal activities GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load activities' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deal_id, user_id, account_id, activity_type, actor_name, details } = body;

    if (!deal_id || !activity_type) {
      return NextResponse.json(
        { error: 'deal_id and activity_type are required' },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const payload = {
      deal_id,
      user_id: user_id || null,
      account_id: account_id || null,
      activity_type,
      actor_name: actor_name || 'User',
      details: details || {},
    };

    const { data, error } = await admin
      .from('deal_activities')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      // If table doesn't exist yet, return success: false with warning without crashing caller
      return NextResponse.json({ success: false, warning: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true, activity: data });
  } catch (err: unknown) {
    console.error('Deal activities POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record activity' },
      { status: 500 },
    );
  }
}

