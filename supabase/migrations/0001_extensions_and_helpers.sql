-- 0001: extensions and pure helper functions.
-- Idempotent: safe to run more than once.

create schema if not exists extensions;

-- Trigram matching for fuzzy name search and duplicate detection.
create extension if not exists pg_trgm with schema extensions;

-- Canonical form of a person's name, used for uniqueness and matching:
--   lower-cased, apostrophes removed ("O'Neil" -> "oneil"), every other
--   punctuation run turned into a space ("Mary-Jane" -> "mary jane"),
--   whitespace collapsed and trimmed. Unicode letters are preserved.
create or replace function public.normalize_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p_name, '')), '[''’`]', '', 'g'),
        '[^[:alnum:][:space:]]+', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  )
$$;

-- Tidy a display name: trim and collapse internal whitespace.
create or replace function public.clean_display_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'))
$$;
