const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;
const WHITESPACE_RE = /\s+/g;

type SearchValue = string | null | undefined;

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(NON_ALPHANUMERIC_RE, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

function matchesSubsequence(haystack: string, needle: string): boolean {
  let needleIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let haystackIndex = 0; haystackIndex < haystack.length && needleIndex < needle.length; haystackIndex += 1) {
    if (haystack[haystackIndex] !== needle[needleIndex]) continue;
    if (firstMatch === -1) firstMatch = haystackIndex;
    lastMatch = haystackIndex;
    needleIndex += 1;
  }

  if (needleIndex !== needle.length) return false;

  const span = lastMatch - firstMatch + 1;
  return span <= Math.max(needle.length + 2, needle.length * 3);
}

function buildSearchIndex(values: SearchValue[]) {
  const normalizedValue = normalizeSearchText(
    values
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
  );

  if (!normalizedValue) return null;

  const parts = normalizedValue.split(' ');
  return {
    normalizedValue,
    compactValue: parts.join(''),
    acronym: parts.map((part) => part[0]).join(''),
  };
}

function matchesToken(token: string, normalizedValue: string, compactValue: string, acronym: string): boolean {
  if (normalizedValue.includes(token) || compactValue.includes(token)) return true;
  if (token.length <= 1) return false;
  if (acronym.includes(token)) return true;
  return matchesSubsequence(compactValue, token);
}

export function createFuzzySearchMatcher(query: string) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return () => true;
  }

  const tokens = normalizedQuery.split(' ');

  return (...values: SearchValue[]) => {
    const searchIndex = buildSearchIndex(values);
    if (!searchIndex) return false;

    return tokens.every((token) =>
      matchesToken(token, searchIndex.normalizedValue, searchIndex.compactValue, searchIndex.acronym)
    );
  };
}