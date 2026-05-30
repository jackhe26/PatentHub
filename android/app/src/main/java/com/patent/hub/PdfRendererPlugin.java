package com.patent.hub;

import android.graphics.Bitmap;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * Capacitor plugin wrapping Android's native PdfRenderer API (API 21+).
 * Renders PDF pages to JPEG base64 images for WebView display.
 */
@CapacitorPlugin(name = "PdfRenderer")
public class PdfRendererPlugin extends Plugin {

    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor fileDescriptor;
    private String currentFilePath;

    /**
     * Open a PDF file and return total page count.
     * @param call expects { filePath: string } — absolute path to PDF file
     */
    @PluginMethod
    public void open(PluginCall call) {
        try {
            close(); // close any previously opened file

            String filePath = call.getString("filePath");
            if (filePath == null) {
                call.reject("filePath is required");
                return;
            }

            // Copy file to private cache dir if needed (ensures read access)
            File pdfFile = new File(filePath);
            if (!pdfFile.exists()) {
                call.reject("File not found: " + filePath);
                return;
            }

            // Copy to cache dir for guaranteed read access
            File cacheFile = new File(getContext().getCacheDir(), "pdf_temp_" + pdfFile.getName());
            try (InputStream in = new FileInputStream(pdfFile);
                 FileOutputStream out = new FileOutputStream(cacheFile)) {
                byte[] buffer = new byte[8192];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    out.write(buffer, 0, len);
                }
            }

            fileDescriptor = ParcelFileDescriptor.open(cacheFile, ParcelFileDescriptor.MODE_READ_ONLY);
            pdfRenderer = new PdfRenderer(fileDescriptor);
            currentFilePath = cacheFile.getAbsolutePath();

            JSObject result = new JSObject();
            result.put("pageCount", pdfRenderer.getPageCount());
            result.put("filePath", currentFilePath);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Failed to open PDF: " + e.getMessage());
        }
    }

    /**
     * Render a single PDF page to JPEG base64.
     * @param call expects { pageIndex: int, scale?: float } — 0-based page index
     */
    @PluginMethod
    public void renderPage(PluginCall call) {
        try {
            if (pdfRenderer == null) {
                call.reject("No PDF file opened. Call open() first.");
                return;
            }

            int pageIndex = call.getInt("pageIndex", 0);
            float scale = call.getFloat("scale", 2.0f); // 2x for readable text on mobile

            if (pageIndex < 0 || pageIndex >= pdfRenderer.getPageCount()) {
                call.reject("Invalid page index: " + pageIndex);
                return;
            }

            PdfRenderer.Page page = pdfRenderer.openPage(pageIndex);

            int width = (int) (page.getWidth() * scale);
            int height = (int) (page.getHeight() * scale);

            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            // Fill white background — JPEG has no alpha channel, transparent pixels become black
            bitmap.eraseColor(android.graphics.Color.WHITE);
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            page.close();

            // Convert to JPEG base64
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos);
            bitmap.recycle();

            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            baos.close();

            JSObject result = new JSObject();
            result.put("base64", "data:image/jpeg;base64," + base64);
            result.put("width", width);
            result.put("height", height);
            result.put("pageIndex", pageIndex);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Failed to render page: " + e.getMessage());
        }
    }

    /**
     * Get the total number of pages.
     */
    @PluginMethod
    public void getPageCount(PluginCall call) {
        if (pdfRenderer == null) {
            call.reject("No PDF file opened");
            return;
        }
        JSObject result = new JSObject();
        result.put("pageCount", pdfRenderer.getPageCount());
        call.resolve(result);
    }

    /**
     * Open PDF from base64 string — bypasses Filesystem.writeFile btoa/atob issues.
     * Java's android.util.Base64.decode is more reliable than WebView btoa.
     */
    @PluginMethod
    public void openWithBase64(PluginCall call) {
        try {
            close();

            String base64Data = call.getString("data");
            if (base64Data == null || base64Data.isEmpty()) {
                call.reject("data (base64 string) is required");
                return;
            }

            // Decode base64 on Android native side — no WebView btoa needed
            byte[] pdfBytes = android.util.Base64.decode(base64Data, android.util.Base64.NO_WRAP);

            // Write to cache file for PdfRenderer
            File cacheDir = getContext().getCacheDir();
            File tempFile = new File(cacheDir, "pdf_native_" + System.currentTimeMillis() + ".pdf");
            java.io.FileOutputStream fos = new java.io.FileOutputStream(tempFile);
            fos.write(pdfBytes);
            fos.close();
            currentFilePath = tempFile.getAbsolutePath();

            fileDescriptor = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY);
            pdfRenderer = new PdfRenderer(fileDescriptor);

            JSObject result = new JSObject();
            result.put("pageCount", pdfRenderer.getPageCount());
            result.put("filePath", currentFilePath);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Failed to open PDF from base64: " + e.getMessage());
        }
    }

    /**
     * Close the PDF renderer and release resources.
     */
    @PluginMethod
    public void close(PluginCall call) {
        close();
        call.resolve();
    }

    private void close() {
        try {
            if (pdfRenderer != null) {
                pdfRenderer.close();
                pdfRenderer = null;
            }
            if (fileDescriptor != null) {
                fileDescriptor.close();
                fileDescriptor = null;
            }
            currentFilePath = null;
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void handleOnDestroy() {
        close();
        super.handleOnDestroy();
    }
}