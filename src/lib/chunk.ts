// Naive character-window chunker with overlap. Good enough for v1;
// swap in tiktoken-based chunking once we add the dep.

export type Chunk = { index: number; content: string };

export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): Chunk[] {
  const size = opts.size ?? 3200;
  const overlap = opts.overlap ?? 400;
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + size, cleaned.length);
    chunks.push({ index, content: cleaned.slice(start, end) });
    if (end >= cleaned.length) break;
    start = end - overlap;
    index += 1;
  }
  return chunks;
}
