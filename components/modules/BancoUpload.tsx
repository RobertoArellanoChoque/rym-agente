"use client"

import { useState, useRef } from "react"
import { Upload, File, X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSteps, buildSteps } from "@/components/modules/LoadingSteps"

interface BancoUploadProps {
  processing: boolean
  stepIndex: number
  stepLabels: string[]
  error?: string | null
  onUpload: (file: File) => void
}

export function BancoUpload({ processing, stepIndex, stepLabels, error, onUpload }: BancoUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  return (
    <div className="space-y-3 max-w-md">
      <p className="text-sm text-muted-foreground">
        Subí el extracto bancario. El sistema detecta el banco automáticamente.
      </p>

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
          accept=".pdf,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">Arrastrá el extracto bancario</p>
        <p className="text-xs text-muted-foreground mt-1">PDF o Excel (.xlsx, .xls)</p>
      </div>

      {file && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm">
          <File className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{file.name}</span>
          <button
            onClick={() => setFile(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
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
          <LoadingSteps steps={buildSteps(stepLabels, stepIndex)} />
        </div>
      ) : (
        <Button onClick={() => file && onUpload(file)} disabled={!file} className="w-full">
          Procesar extracto
        </Button>
      )}
    </div>
  )
}
