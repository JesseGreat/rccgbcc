import type { PostgrestError } from "@supabase/supabase-js";

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Supabase caps API responses (1,000 rows by default) and truncates silently.
 * Reports read more than that, so page through with `.range()`.
 * The query must have a stable `.order()` for paging to be correct.
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}
