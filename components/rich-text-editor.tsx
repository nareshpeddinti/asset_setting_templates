"use client"

import { useEffect, useRef, useState, useId } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { List, ListOrdered, IndentDecrease, IndentIncrease, Bold, Italic, RemoveFormatting } from "lucide-react"

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<any>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const isInternalChange = useRef(false)
  const editorId = useId().replace(/:/g, "-")
  const [mountKey, setMountKey] = useState(0)

  useEffect(() => {
    // Reset mount key when component mounts to force fresh initialization
    setMountKey((prev) => prev + 1)
  }, [])

  useEffect(() => {
    let mounted = true
    
    const loadQuill = async () => {
      if (typeof window === "undefined") return

      // Load Quill CSS
      if (!document.querySelector('link[href*="quill.snow.css"]')) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = "https://cdn.quilljs.com/1.3.7/quill.snow.css"
        document.head.appendChild(link)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Load Quill JS
      if (!(window as any).Quill) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script")
          script.src = "https://cdn.quilljs.com/1.3.7/quill.min.js"
          script.onload = () => resolve()
          document.head.appendChild(script)
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (!mounted || !editorRef.current) return

      // Clean up any existing Quill instance
      if (quillRef.current) {
        quillRef.current.off("text-change")
        quillRef.current = null
      }

      // Clear editor content before reinitializing
      if (editorRef.current) {
        editorRef.current.innerHTML = ""
      }

      const Quill = (window as any).Quill

      // Initialize without toolbar - we'll use our custom one
      quillRef.current = new Quill(editorRef.current, {
        theme: "snow",
        placeholder: placeholder || "Enter text...",
        modules: {
          toolbar: false, // Disable built-in toolbar
        },
      })

      if (value) {
        setContent(value)
      }

      quillRef.current.on("text-change", () => {
        if (isInternalChange.current) {
          isInternalChange.current = false
          return
        }
        const text = extractPlainText()
        onChange(text)
      })

      setIsLoaded(true)
    }

    loadQuill()

    return () => {
      mounted = false
      if (quillRef.current) {
        quillRef.current.off("text-change")
        quillRef.current = null
      }
      setIsLoaded(false)
    }
  }, [editorId, mountKey])

  useEffect(() => {
    if (quillRef.current && isLoaded) {
      const currentText = extractPlainText()
      if (currentText.trim() !== value.trim()) {
        isInternalChange.current = true
        setContent(value)
      }
    }
  }, [value, isLoaded])

  const setContent = (text: string) => {
    if (!quillRef.current) return
    const delta = convertTextToDelta(text)
    quillRef.current.setContents(delta, "silent")
  }

  const convertTextToDelta = (text: string): any[] => {
    const lines = text.split("\n")
    const ops: any[] = []

    lines.forEach((line) => {
      const trimmed = line.trim()
      const leadingSpaces = line.length - line.trimStart().length
      const indentLevel = Math.floor(leadingSpaces / 2)
      
      // Check for bullets
      if (/^[•●]\s/.test(trimmed)) {
        const content = trimmed.replace(/^[•●]\s*/, "")
        ops.push({ insert: content })
        ops.push({ insert: "\n", attributes: { list: "bullet", ...(indentLevel > 0 && { indent: indentLevel }) } })
      } else if (/^[○◦]\s/.test(trimmed)) {
        const content = trimmed.replace(/^[○◦]\s*/, "")
        ops.push({ insert: content })
        ops.push({ insert: "\n", attributes: { list: "bullet", indent: Math.max(1, indentLevel) } })
      } else if (/^[▪▸-]\s/.test(trimmed) && !/^[0-9A-Z]+-/i.test(trimmed)) {
        const content = trimmed.replace(/^[▪▸-]\s*/, "")
        ops.push({ insert: content })
        ops.push({ insert: "\n", attributes: { list: "bullet", indent: Math.max(2, indentLevel) } })
      } else if (trimmed) {
        ops.push({ insert: trimmed })
        ops.push({ insert: "\n" })
      } else {
        ops.push({ insert: "\n" })
      }
    })

    return ops
  }

  const extractPlainText = (): string => {
    if (!quillRef.current) return ""

    const contents = quillRef.current.getContents()
    const lines: string[] = []
    let currentLine = ""

    contents.ops?.forEach((op: any) => {
      if (typeof op.insert === "string") {
        if (op.insert === "\n") {
          const attrs = op.attributes || {}
          if (attrs.list === "bullet") {
            const indent = attrs.indent || 0
            const bullet = indent === 0 ? "•" : indent === 1 ? "○" : "▪"
            const indentStr = "  ".repeat(indent)
            lines.push(`${indentStr}${bullet} ${currentLine}`)
          } else if (attrs.list === "ordered") {
            const indent = attrs.indent || 0
            const indentStr = "  ".repeat(indent)
            lines.push(`${indentStr}- ${currentLine}`)
          } else {
            lines.push(currentLine)
          }
          currentLine = ""
        } else {
          const parts = op.insert.split("\n")
          parts.forEach((part: string, idx: number) => {
            if (idx > 0) {
              lines.push(currentLine)
              currentLine = ""
            }
            currentLine += part
          })
        }
      }
    })

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines.join("\n")
  }

  // Custom toolbar handlers
  const handleBulletList = () => {
    if (quillRef.current) {
      const format = quillRef.current.getFormat()
      quillRef.current.format("list", format.list === "bullet" ? false : "bullet")
    }
  }

  const handleOrderedList = () => {
    if (quillRef.current) {
      const format = quillRef.current.getFormat()
      quillRef.current.format("list", format.list === "ordered" ? false : "ordered")
    }
  }

  const handleIndent = (direction: number) => {
    if (quillRef.current) {
      const format = quillRef.current.getFormat()
      const currentIndent = format.indent || 0
      const newIndent = Math.max(0, Math.min(5, currentIndent + direction))
      quillRef.current.format("indent", newIndent || false)
    }
  }

  const handleBold = () => {
    if (quillRef.current) {
      const format = quillRef.current.getFormat()
      quillRef.current.format("bold", !format.bold)
    }
  }

  const handleItalic = () => {
    if (quillRef.current) {
      const format = quillRef.current.getFormat()
      quillRef.current.format("italic", !format.italic)
    }
  }

  const handleClean = () => {
    if (quillRef.current) {
      const range = quillRef.current.getSelection()
      if (range) {
        quillRef.current.removeFormat(range.index, range.length)
      }
    }
  }

  return (
    <div className={cn("flex flex-col rounded-md border bg-background overflow-hidden", className)}>
      {/* Custom Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50 flex-shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleBulletList}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleOrderedList}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => handleIndent(-1)}
          title="Decrease Indent"
        >
          <IndentDecrease className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => handleIndent(1)}
          title="Increase Indent"
        >
          <IndentIncrease className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleBold}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleItalic}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleClean}
          title="Clear Formatting"
        >
          <RemoveFormatting className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Container */}
      <div className="flex-1 overflow-hidden relative">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">
            Loading editor...
          </div>
        )}
        <div 
          ref={editorRef}
          id={`quill-editor-${editorId}`}
          className="h-full"
        />
      </div>

      <style jsx global>{`
        .ql-container.ql-snow {
          border: none !important;
          height: 100% !important;
          font-family: inherit;
        }
        .ql-editor {
          min-height: 200px;
          height: 100%;
          padding: 12px;
          font-size: 14px;
          line-height: 1.6;
          overflow-y: auto;
        }
        .ql-editor.ql-blank::before {
          color: hsl(var(--muted-foreground));
          font-style: normal;
          left: 12px;
          right: 12px;
          pointer-events: none;
        }
        .ql-editor ul > li::before {
          content: '•' !important;
          color: hsl(var(--primary));
          font-weight: bold;
        }
        .ql-editor ul > li.ql-indent-1::before {
          content: '○' !important;
          color: hsl(var(--primary) / 0.7);
        }
        .ql-editor ul > li.ql-indent-2::before {
          content: '▪' !important;
          color: hsl(var(--primary) / 0.5);
        }
        .ql-editor li {
          padding-left: 0.5em !important;
        }
        .ql-editor li.ql-indent-1 {
          padding-left: 3em !important;
        }
        .ql-editor li.ql-indent-2 {
          padding-left: 5em !important;
        }
        .ql-editor li.ql-indent-3 {
          padding-left: 7em !important;
        }
      `}</style>
    </div>
  )
}
