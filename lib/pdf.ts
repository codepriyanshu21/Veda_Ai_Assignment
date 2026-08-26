import * as pdfjsLib from 'pdfjs-dist';
import type { PageImage } from './types';

const pdfjsWorker = (pdfjsLib as any).GlobalWorkerOptions;

let workerConfigured = false;

function ensureWorker() {
  if (workerConfigured) return;
  pdfjsWorker.workerSrc = '/pdf.worker.min.js';
  workerConfigured = true;
}

export async function convertFileToImages(file: File): Promise<PageImage[]> {
  ensureWorker();

  if (file.type.startsWith('image/')) {
    const dataUrl = await readImageAsDataUrl(file);
    const dims = await getImageDimensions(dataUrl);
    return [{ pageNumber: 1, dataUrl, width: dims.width, height: dims.height }];
  }

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return convertPdfToImages(file);
  }

  throw new Error('Unsupported file type. Please upload a PDF or image.');
}

async function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 800, height: 1000 });
    img.src = dataUrl;
  });
}

async function convertPdfToImages(file: File): Promise<PageImage[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;
  const images: PageImage[] = [];
  const scale = 1.5;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}
