// Embedding helper. Anthropic has no first-party embedding model yet, so we
// call a third-party provider. Voyage AI is the common choice in the Anthropic
// ecosystem; this wrapper reads VOYAGE_API_KEY and falls back to a deterministic
// zero vector in dev so the ingestion pipeline can be exercised end-to-end
// without an embedding key configured.

const DIM = 1536;

export async function embed(texts: string[]): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    return texts.map(() => new Array(DIM).fill(0));
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-3",
      input: texts,
      input_type: "document",
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}
