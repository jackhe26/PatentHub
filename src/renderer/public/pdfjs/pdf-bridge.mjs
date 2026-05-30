// pdf.js bridge — loaded as static resource, NOT processed by Vite
// This ensures GlobalWorkerOptions is a real object, not a Vite proxy
import * as pdfjsLib from './pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;