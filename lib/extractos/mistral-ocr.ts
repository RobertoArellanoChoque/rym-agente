import { Mistral } from "@mistralai/mistralai"

export async function pdfToMarkdown(buffer: ArrayBuffer): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey || apiKey === "placeholder") {
    throw new Error("MISTRAL_API_KEY_NOT_CONFIGURED")
  }

  const client = new Mistral({ apiKey })

  // Upload PDF to Mistral Files API (using { fileName, content } per Mistral docs)
  const content = Buffer.from(buffer)
  const uploaded = await client.files.upload({
    file: { fileName: "document.pdf", content },
    purpose: "ocr",
  })

  let markdown: string
  try {
    // Get signed URL for the uploaded file
    const signed = await client.files.getSignedUrl({ fileId: uploaded.id })

    // OCR via signed URL (pattern from Mistral docs)
    const result = await client.ocr.process({
      model: "mistral-ocr-4-0",
      document: {
        type: "document_url",
        documentUrl: signed.url,
      },
    })

    if (!result.pages || result.pages.length === 0) {
      throw new Error("Mistral OCR no devolvió páginas para este PDF.")
    }

    markdown = result.pages
      .sort((a, b) => a.index - b.index)
      .map((p) => p.markdown)
      .join("\n\n---\n\n")
  } finally {
    // Cleanup — avoid Mistral storage costs
    await client.files.delete({ fileId: uploaded.id }).catch(() => {})
  }

  return markdown
}
