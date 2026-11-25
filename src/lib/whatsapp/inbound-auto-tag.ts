import type { SupabaseClient } from '@supabase/supabase-js';

export interface KeywordTagRule {
  keywords: string[];
  tagName: string;
}

export const DEFAULT_KEYWORD_TAG_RULES: KeywordTagRule[] = [
  { keywords: ['audio', 'voice', 'fm', 'jingle', 'radio', 'announcement'], tagName: 'Audio Ad' },
  { keywords: ['video', 'reel', 'shoot', 'promo', 'commercial'], tagName: 'Video Reel' },
  { keywords: ['property', 'flat', 'plot', 'real estate', 'builder'], tagName: 'Real Estate' },
  { keywords: ['price', 'rate', 'cost', 'charges', 'budget', 'quotation'], tagName: 'Pricing Inquiry' },
];

/**
 * Matches an inbound message against keyword rules and attaches matching
 * workspace tags to the contact (creating the tag if needed, or matching existing).
 */
export async function autoTagContactFromMessage(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string,
  messageText: string,
  rules: KeywordTagRule[] = DEFAULT_KEYWORD_TAG_RULES,
): Promise<string[]> {
  if (!messageText || !contactId || !accountId) return [];
  const lower = messageText.toLowerCase();

  const matchedTagNames = rules
    .filter((r) => r.keywords.some((kw) => lower.includes(kw.toLowerCase())))
    .map((r) => r.tagName);

  if (matchedTagNames.length === 0) return [];

  const { data: existingTags } = await supabase
    .from('tags')
    .select('id, name')
    .eq('account_id', accountId);

  const tagByName = new Map<string, string>();
  for (const t of existingTags ?? []) {
    tagByName.set(String(t.name).toLowerCase(), t.id);
  }

  const applied: string[] = [];
  for (const tagName of matchedTagNames) {
    const tagId = tagByName.get(tagName.toLowerCase());
    if (!tagId) continue;

    const { error } = await supabase
      .from('contact_tags')
      .upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: 'contact_id,tag_id' });
    if (!error) applied.push(tagName);
  }

  return applied;
}
