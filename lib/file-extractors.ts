/**
 * Extract plain text from any document type for hierarchy/fieldset parsing.
 * Supports: TXT, CSV, TSV, JSON, XLSX, XLS, PDF, and images (OCR).
 */

const TEXT_TYPES = [
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/csv",
];

const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
];

const PDF_TYPE = "application/pdf";

const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

function isTextType(file: File): boolean {
  if (TEXT_TYPES.some((t) => file.type === t)) return true;
  const n = file.name.toLowerCase();
  return (
    n.endsWith(".txt") ||
    n.endsWith(".csv") ||
    n.endsWith(".tsv") ||
    n.endsWith(".json")
  );
}

function isExcelType(file: File): boolean {
  if (EXCEL_TYPES.some((t) => file.type === t)) return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls");
}

function isPdfType(file: File): boolean {
  if (file.type === PDF_TYPE) return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

function isImageType(file: File): boolean {
  if (IMAGE_TYPES.some((t) => file.type === t)) return true;
  const n = file.name.toLowerCase();
  return (
    n.endsWith(".png") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".webp") ||
    n.endsWith(".gif")
  );
}

async function extractFromExcel(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return "";
  const ws = wb.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_csv(ws);
}

async function extractFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;
  const parts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(pageText);
  }
  return parts.join("\n");
}

async function extractFromImage(file: File): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(file, "eng", {
    logger: () => {},
  });
  return data.text ?? "";
}

/**
 * Extract plain text from any supported document (PDF, XLSX, text, images, etc.).
 * Use the returned string with parseAssetData() for hierarchy and fieldset parsing.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  if (isTextType(file)) {
    return file.text();
  }
  if (isExcelType(file)) {
    return extractFromExcel(file);
  }
  if (isPdfType(file)) {
    return extractFromPdf(file);
  }
  if (isImageType(file)) {
    return extractFromImage(file);
  }
  // Fallback: try as text (e.g. unknown MIME but .csv extension)
  try {
    return await file.text();
  } catch {
    throw new Error(
      `Unsupported file type: ${file.type || "unknown"} (${file.name}). ` +
        "Supported: TXT, CSV, TSV, JSON, XLSX, XLS, PDF, PNG, JPG, WEBP, GIF."
    );
  }
}

/** Accepted file extensions and MIME types for upload UI */
export const ACCEPTED_FILE_EXTENSIONS =
  ".txt,.json,.csv,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.gif";

export const ACCEPTED_FILE_TYPES = [
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
