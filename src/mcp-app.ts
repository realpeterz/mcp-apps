import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./global.css";
import "./mcp-app.css";

// =============================================================================
// DOM references
// =============================================================================
const mainEl = document.querySelector(".main") as HTMLElement;
const dropZone = document.getElementById("drop-zone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const canvasWrapper = document.getElementById("canvas-wrapper") as HTMLElement;
const imageCanvas = document.getElementById("image-canvas") as HTMLCanvasElement;
const maskCanvas = document.getElementById("mask-canvas") as HTMLCanvasElement;
const brushSizeInput = document.getElementById("brush-size") as HTMLInputElement;
const brushSizeLabel = document.getElementById("brush-size-label") as HTMLElement;
const clearMaskBtn = document.getElementById("clear-mask-btn") as HTMLButtonElement;
const confirmBtn = document.getElementById("confirm-btn") as HTMLButtonElement;
const statusBar = document.getElementById("status-bar") as HTMLElement;

const imageCtx = imageCanvas.getContext("2d")!;
const maskCtx = maskCanvas.getContext("2d")!;

// =============================================================================
// State
// =============================================================================
let loadedImage: HTMLImageElement | null = null;
let originalFileName = "image";
let isDrawing = false;
let brushSize = 30;
let hasMaskContent = false;
// Tracks the drawn image rect in display space so mask can be remapped on resize
let currentImageRect = { offsetX: 0, offsetY: 0, drawW: 0, drawH: 0 };

// =============================================================================
// Status helpers
// =============================================================================
function setStatus(msg: string, type: "" | "success" | "error" = "") {
  statusBar.textContent = msg;
  statusBar.className = "status-bar" + (type ? ` ${type}` : "");
}

// =============================================================================
// Canvas sizing
// =============================================================================
function resizeCanvases() {
  if (!loadedImage) return;

  const wrapperW = canvasWrapper.clientWidth;
  const wrapperH = canvasWrapper.clientHeight;
  const imgW = loadedImage.naturalWidth;
  const imgH = loadedImage.naturalHeight;

  // Fit image within wrapper
  const scale = Math.min(wrapperW / imgW, wrapperH / imgH, 1);
  const drawW = Math.round(imgW * scale);
  const drawH = Math.round(imgH * scale);
  const offsetX = Math.round((wrapperW - drawW) / 2);
  const offsetY = Math.round((wrapperH - drawH) / 2);

  // Snapshot the mask before resizing clears it, so we can remap it
  let maskSnapshot: string | null = null;
  const oldRect = { ...currentImageRect };
  if (hasMaskContent && oldRect.drawW > 0) {
    maskSnapshot = maskCanvas.toDataURL();
  }

  for (const canvas of [imageCanvas, maskCanvas]) {
    canvas.width = wrapperW;
    canvas.height = wrapperH;
    canvas.style.width = `${wrapperW}px`;
    canvas.style.height = `${wrapperH}px`;
  }

  // Draw image centered
  imageCtx.clearRect(0, 0, wrapperW, wrapperH);
  imageCtx.drawImage(loadedImage, offsetX, offsetY, drawW, drawH);

  // Restore mask drawing settings
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  maskCtx.strokeStyle = "rgba(255, 0, 0, 0.4)";
  maskCtx.lineWidth = brushSize;

  // Update tracked rect
  currentImageRect = { offsetX, offsetY, drawW, drawH };

  // Remap mask from old image rect to new image rect
  if (maskSnapshot) {
    const img = new Image();
    img.onload = () => {
      maskCtx.drawImage(
        img,
        oldRect.offsetX, oldRect.offsetY, oldRect.drawW, oldRect.drawH,
        offsetX, offsetY, drawW, drawH,
      );
    };
    img.src = maskSnapshot;
  }
}

// =============================================================================
// Load image
// =============================================================================
function loadImageFromSrc(src: string, fileName?: string, persist = true) {
  const img = new Image();
  img.onload = () => {
    loadedImage = img;
    if (fileName) originalFileName = fileName;
    currentImageRect = { offsetX: 0, offsetY: 0, drawW: 0, drawH: 0 };
    dropZone.classList.add("hidden");
    clearMask();
    resizeCanvases();
    clearMaskBtn.disabled = false;
    confirmBtn.disabled = false;
    setStatus(`Image loaded: ${img.naturalWidth}x${img.naturalHeight}`);

    if (persist) {
      try {
        localStorage.setItem("maskEditor_imageSrc", src);
        localStorage.setItem("maskEditor_fileName", fileName ?? "image");
      } catch {
        // Storage quota exceeded — skip persistence
      }
    }
  };
  img.onerror = () => {
    setStatus("Failed to load image", "error");
  };
  img.src = src;
}

function loadImageFromFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    loadImageFromSrc(reader.result as string, file.name);
  };
  reader.readAsDataURL(file);
}

// =============================================================================
// Drag and drop
// =============================================================================
canvasWrapper.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

canvasWrapper.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

canvasWrapper.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith("image/")) {
    loadImageFromFile(file);
  }
});

// File input
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    loadImageFromFile(file);
    fileInput.value = "";
  }
});

// =============================================================================
// Brush tool
// =============================================================================
brushSizeInput.addEventListener("input", () => {
  brushSize = parseInt(brushSizeInput.value, 10);
  brushSizeLabel.textContent = `${brushSize}px`;
  maskCtx.lineWidth = brushSize;
});

function getCanvasPos(e: MouseEvent | Touch): { x: number; y: number } {
  const rect = maskCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

// Draw a dot at point (for single clicks without movement)
function drawDot(x: number, y: number) {
  maskCtx.beginPath();
  maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  maskCtx.fillStyle = "rgba(255, 0, 0, 0.4)";
  maskCtx.fill();
  hasMaskContent = true;
}

maskCanvas.addEventListener("mousedown", (e) => {
  if (!loadedImage) return;
  isDrawing = true;
  const pos = getCanvasPos(e);
  maskCtx.beginPath();
  maskCtx.moveTo(pos.x, pos.y);
  drawDot(pos.x, pos.y);
});

maskCanvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  maskCtx.lineTo(pos.x, pos.y);
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.moveTo(pos.x, pos.y);
  hasMaskContent = true;
});

window.addEventListener("mouseup", () => {
  if (isDrawing) {
    isDrawing = false;
    maskCtx.beginPath();
  }
});

// Touch support
maskCanvas.addEventListener("touchstart", (e) => {
  if (!loadedImage) return;
  e.preventDefault();
  isDrawing = true;
  const pos = getCanvasPos(e.touches[0]);
  maskCtx.beginPath();
  maskCtx.moveTo(pos.x, pos.y);
  drawDot(pos.x, pos.y);
}, { passive: false });

maskCanvas.addEventListener("touchmove", (e) => {
  if (!isDrawing) return;
  e.preventDefault();
  const pos = getCanvasPos(e.touches[0]);
  maskCtx.lineTo(pos.x, pos.y);
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.moveTo(pos.x, pos.y);
  hasMaskContent = true;
}, { passive: false });

window.addEventListener("touchend", () => {
  if (isDrawing) {
    isDrawing = false;
    maskCtx.beginPath();
  }
});

// =============================================================================
// Clear mask
// =============================================================================
function clearMask() {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  maskCtx.strokeStyle = "rgba(255, 0, 0, 0.4)";
  maskCtx.lineWidth = brushSize;
  hasMaskContent = false;
}

clearMaskBtn.addEventListener("click", () => {
  clearMask();
  setStatus("Mask cleared");
});

// =============================================================================
// Generate mask image (white on black)
// =============================================================================
function generateMaskDataUrl(): string {
  if (!loadedImage) throw new Error("No image loaded");

  const w = loadedImage.naturalWidth;
  const h = loadedImage.naturalHeight;

  // Create a temporary canvas at original image resolution
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext("2d")!;

  // Fill black background
  tempCtx.fillStyle = "#000000";
  tempCtx.fillRect(0, 0, w, h);

  // Map mask canvas coordinates back to original image coordinates
  const wrapperW = canvasWrapper.clientWidth;
  const wrapperH = canvasWrapper.clientHeight;
  const scale = Math.min(wrapperW / w, wrapperH / h, 1);
  const drawW = Math.round(w * scale);
  const drawH = Math.round(h * scale);
  const offsetX = Math.round((wrapperW - drawW) / 2);
  const offsetY = Math.round((wrapperH - drawH) / 2);

  // Read mask pixels and map to original size
  const maskData = maskCtx.getImageData(0, 0, wrapperW, wrapperH);

  // Draw the mapped mask in white
  const tempImageData = tempCtx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Map from original coords to display coords
      const displayX = Math.round(x * scale + offsetX);
      const displayY = Math.round(y * scale + offsetY);

      if (
        displayX >= 0 &&
        displayX < wrapperW &&
        displayY >= 0 &&
        displayY < wrapperH
      ) {
        const maskIdx = (displayY * wrapperW + displayX) * 4;
        // Check if mask pixel has any alpha (was painted)
        if (maskData.data[maskIdx + 3] > 0) {
          const idx = (y * w + x) * 4;
          tempImageData.data[idx] = 255; // R
          tempImageData.data[idx + 1] = 255; // G
          tempImageData.data[idx + 2] = 255; // B
          tempImageData.data[idx + 3] = 255; // A
        }
      }
    }
  }

  tempCtx.putImageData(tempImageData, 0, 0);
  return tempCanvas.toDataURL("image/png");
}

// =============================================================================
// Confirm and send mask
// =============================================================================
confirmBtn.addEventListener("click", async () => {
  if (!loadedImage || !hasMaskContent) {
    setStatus("Paint a selection on the image first", "error");
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Sending...";
  setStatus("Generating mask...");

  try {
    const maskDataUrl = generateMaskDataUrl();
    setStatus("Sending mask to server...");

    const result = await app.callServerTool({
      name: "save-mask",
      arguments: {
        maskDataUrl,
        originalFileName,
      },
    });

    if (result.isError) {
      setStatus("Server error saving mask", "error");
    } else {
      const data = result.structuredContent as {
        status: string;
        filePath: string;
      };
      setStatus(`Mask saved: ${data.filePath}`, "success");
    }
  } catch (e) {
    console.error("Failed to send mask:", e);
    setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm Mask";
  }
});

// =============================================================================
// Resize handling
// =============================================================================
const resizeObserver = new ResizeObserver(() => {
  if (loadedImage) resizeCanvases();
});
resizeObserver.observe(canvasWrapper);

// =============================================================================
// MCP App lifecycle
// =============================================================================
const app = new App({ name: "Mask Editor", version: "1.0.0" });

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

app.onteardown = async () => {
  resizeObserver.disconnect();
  return {};
};

app.ontoolinput = (params) => {
  const args = params.arguments as { image?: string } | undefined;
  if (args?.image) {
    loadImageFromSrc(args.image, "provided-image");
    setStatus("Image received from host");
  }
};

app.ontoolresult = (result: CallToolResult) => {
  const data = result.structuredContent as {
    status: string;
    message?: string;
  } | undefined;
  if (data?.message) {
    setStatus(data.message);
  }
};

app.onerror = (err) => {
  console.error("[Mask Editor] Error:", err);
  setStatus("App error occurred", "error");
};

app.onhostcontextchanged = handleHostContextChanged;

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) handleHostContextChanged(ctx);

  // Restore last image from localStorage if no image was provided via tool input
  try {
    const savedSrc = localStorage.getItem("maskEditor_imageSrc");
    const savedName = localStorage.getItem("maskEditor_fileName") ?? "image";
    if (savedSrc && !loadedImage) {
      loadImageFromSrc(savedSrc, savedName, false);
    }
  } catch {
    // Ignore storage errors
  }
});
