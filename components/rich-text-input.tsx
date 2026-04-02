"use client"

import { useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface RichTextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function RichTextInput({
  value,
  onChange,
  placeholder,
  className,
}: RichTextInputProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalChange = useRef(false)

  // Format text to display with proper bullets and indentation
  const formatForDisplay = useCallback((text: string): string => {
    if (!text) return ""
    
    const lines = text.split("\n")
    const formattedLines = lines.map((line) => {
      // Escape HTML
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
      
      // Check for bullet patterns and apply formatting
      if (/^[•●]\s/.test(line)) {
        // Primary bullet
        return `<div class="flex items-start gap-2 text-foreground"><span class="text-orange-500 font-bold">•</span><span>${escaped.replace(/^[•●]\s*/, "")}</span></div>`
      } else if (/^\s*[○◦]\s/.test(line)) {
        // Secondary bullet (indented)
        return `<div class="flex items-start gap-2 pl-6 text-muted-foreground"><span class="text-orange-400">○</span><span>${escaped.replace(/^\s*[○◦]\s*/, "")}</span></div>`
      } else if (/^\s+-\s/.test(line)) {
        // Dash as bullet (indented)
        return `<div class="flex items-start gap-2 pl-6 text-muted-foreground"><span class="text-orange-400">-</span><span>${escaped.replace(/^\s*-\s*/, "")}</span></div>`
      } else if (/^[0-9A-Z-]+\s*[\(:]/i.test(line)) {
        // Code line (like "23 (Mechanical Systems)" or "23: Name")
        return `<div class="font-semibold text-foreground mt-2 first:mt-0">${escaped}</div>`
      } else if (line.trim()) {
        return `<div>${escaped}</div>`
      }
      return `<div class="h-4"></div>`
    })
    
    return formattedLines.join("")
  }, [])

  // Extract plain text from HTML content
  const extractPlainText = useCallback((element: HTMLElement): string => {
    const lines: string[] = []
    
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        lines.push(node.textContent || "")
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        const text = el.innerText || el.textContent || ""
        
        // Check if it's a bullet line
        if (el.classList.contains("pl-6")) {
          // Indented bullet
          const bulletSpan = el.querySelector("span:first-child")
          const bullet = bulletSpan?.textContent || "○"
          const content = text.replace(bullet, "").trim()
          lines.push(`  ${bullet} ${content}`)
        } else if (el.querySelector("span.text-orange-500")) {
          // Primary bullet
          const content = text.replace("•", "").trim()
          lines.push(`• ${content}`)
        } else {
          lines.push(text)
        }
      }
    })
    
    return lines.join("\n")
  }, [])

  // Update editor content when value changes externally
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      const formatted = formatForDisplay(value)
      if (editorRef.current.innerHTML !== formatted) {
        editorRef.current.innerHTML = formatted || ""
      }
    }
    isInternalChange.current = false
  }, [value, formatForDisplay])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true
      const text = extractPlainText(editorRef.current)
      onChange(text)
    }
  }, [onChange, extractPlainText])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    
    // Insert text at cursor position
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      
      // Create formatted content
      const tempDiv = document.createElement("div")
      tempDiv.innerHTML = formatForDisplay(text)
      
      const fragment = document.createDocumentFragment()
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild)
      }
      range.insertNode(fragment)
      
      // Move cursor to end
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    
    handleInput()
  }, [formatForDisplay, handleInput])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      
      // Insert a line break
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        range.deleteContents()
        
        const br = document.createElement("div")
        br.innerHTML = "&nbsp;"
        range.insertNode(br)
        
        // Move cursor after the break
        range.setStartAfter(br)
        range.setEndAfter(br)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      
      handleInput()
    }
  }, [handleInput])

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex-1 overflow-auto p-3 rounded-md border border-input bg-background text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "prose prose-sm max-w-none",
          "[&>div]:leading-relaxed",
          !value && "text-muted-foreground",
          className
        )}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      {!value && placeholder && (
        <div className="absolute top-3 left-3 text-muted-foreground text-sm pointer-events-none">
          {placeholder}
        </div>
      )}
    </div>
  )
}
