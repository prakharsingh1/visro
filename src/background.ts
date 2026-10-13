import type { Config } from "@imgly/background-removal";

/** The models and ONNX runtime are shipped inside the app, never uploaded. */
export const BACKGROUND_MODEL_VERSION = "1.7.0";
export type BackgroundProgress = (message: string, percent: number) => void;

let activeProgress: BackgroundProgress | undefined;
let highestPercent = 0;
let queue: Promise<unknown> = Promise.resolve();
let assetCheck: Promise<void> | undefined;

const publicPath = new URL(
  `./background-removal/${BACKGROUND_MODEL_VERSION}/`,
  document.baseURI,
).href;

function report(message: string, percent: number) {
  highestPercent = Math.max(highestPercent, Math.min(100, Math.round(percent)));
  activeProgress?.(message, highestPercent);
}

// IMG.LY memoizes the inference session by configuration. A stable callback
// routes progress to the current operation, even after its session is cached.
const configuration: Config = {
  publicPath,
  model: "isnet_fp16",
  device: "cpu",
  proxyToWorker: false,
  rescale: true,
  output: { format: "image/png", quality: 1 },
  progress: (key, current, total) => {
    const fraction = total > 0 ? current / total : 0;
    if (key.startsWith("fetch:")) {
      const label = key.includes("/models/")
        ? "Loading the local cutout model"
        : "Preparing the local image engine";
      report(label, fraction * 25);
      return;
    }
    const labels: Record<string, string> = {
      "compute:decode": "Reading your image",
      "compute:inference": "Separating subject from background",
      "compute:mask": "Refining the transparent edge",
      "compute:encode": "Creating your transparent PNG",
    };
    report(labels[key] ?? "Removing background", 25 + fraction * 75);
  },
};

async function ensureLocalAssets() {
  if (!assetCheck) {
    assetCheck = (async () => {
      const response = await fetch(new URL("resources.json", publicPath));
      if (!response.ok)
        throw new Error(`Cutout assets returned HTTP ${response.status}.`);
      const resources = await response.json();
      for (const key of [
        "/models/isnet_fp16",
        "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
        "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
      ]) {
        if (!resources[key]?.chunks?.length)
          throw new Error(`Missing cutout asset: ${key}`);
      }
    })().catch((error) => {
      assetCheck = undefined;
      throw new Error(
        "The local background-removal model is missing. Run npm run prepare:models, rebuild Visro, and try again.",
        { cause: error },
      );
    });
  }
  return assetCheck;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The transparent PNG could not be read."));
    reader.onerror = () =>
      reject(
        reader.error ?? new Error("The transparent PNG could not be read."),
      );
    reader.readAsDataURL(blob);
  });
}

/**
 * Run IS-Net segmentation locally and return a PNG with a real alpha channel.
 * The source must already be an image data URL: no remote image fetch or AI API.
 * Serial execution avoids competing ONNX sessions and overlapping progress.
 */
export function removeImageBackground(
  dataURL: string,
  onProgress?: BackgroundProgress,
): Promise<string> {
  if (!/^data:image\/(?:png|jpe?g|webp|gif|bmp|avif)(?:;|,)/i.test(dataURL)) {
    return Promise.reject(
      new Error("Select a PNG, JPEG, WebP, GIF, BMP, or AVIF image first."),
    );
  }
  const operation = queue
    .catch(() => undefined)
    .then(async () => {
      activeProgress = onProgress;
      highestPercent = 0;
      try {
        report("Preparing background removal on your Mac", 0);
        await ensureLocalAssets();
        const [{ removeBackground }, input] = await Promise.all([
          import("@imgly/background-removal"),
          fetch(dataURL).then((response) => response.blob()),
        ]);
        const result = await removeBackground(input, configuration);
        if (result.type !== "image/png")
          throw new Error(
            "The cutout engine did not return a transparent PNG.",
          );
        const output = await blobToDataURL(result);
        report("Background removed", 100);
        return output;
      } finally {
        activeProgress = undefined;
      }
    });
  queue = operation;
  return operation;
}
