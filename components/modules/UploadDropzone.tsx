"use client"

import { useState, useRef } from "react"
import { Upload, File, X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSteps, buildSteps } from "@/components/modules/LoadingSteps"

interface UploadDropzoneProps {
  accept: string
  multiple?: boolean            // default true
  title?: string
  hint?: string
  buttonLabel?: string
  processing: boolean
  // progreso por-archivo del bulk ("Procesando 2/5: foo.pdf"). Si viene, reemplaza a LoadingSteps.
  progress?: { done: number; total: number; current?: string }
  // pasos del flujo single (banco/tarjeta de a 1). Solo se usan si no hay `progress`.
  stepIndex?: number
  stepLabels?: string[]
  error?: string | null
  onUpload: (files: File[]) => void
}

export function UploadDropzone({
  accept,
  multiple = true,
  title = "Arrastrá los archivos",
  hint,
  buttonLabel = "Procesar",
  processing,
  progress,
  stepIndex = 0,
  stepLabels,
  error,
  onUpload,
}: UploadDropzoneProps) {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function add(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => (multiple ? [...prev, ...incoming] : incoming.slice(0, 1)))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    add(e.dataTransfer.files)
  }

  function remove(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-3 max-w-md">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => { add(e.target.files); e.target.value = "" }}
        />
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm">
              <File className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              {!processing && (
                <button onClick={() => remove(i)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {processing ? (
        <div className="rounded-lg border bg-muted/20 px-4 py-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Procesando…
          </p>
          {progress ? (
            <p className="text-sm">
              {progress.done}/{progress.total}
              {progress.current && <span className="text-muted-foreground"> — {progress.current}</span>}
            </p>
          ) : stepLabels ? (
            <LoadingSteps steps={buildSteps(stepLabels, stepIndex)} />
          ) : null}
        </div>
      ) : (
        <Button onClick={() => files.length && onUpload(files)} disabled={!files.length} className="w-full">
          {buttonLabel}{files.length > 1 ? ` (${files.length})` : ""}
        </Button>
      )}
    </div>
  )
}
