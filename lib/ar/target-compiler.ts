type MindARCompiler = {
  compileImageTargets: (images: HTMLImageElement[], progress: (value: number) => void) => Promise<unknown>;
  exportData: () => ArrayBuffer;
};

type CompilerConstructor = new () => MindARCompiler;

function loadCompilerRuntime() {
  const mindarWindow = window as typeof window & {
    MINDAR?: { IMAGE?: { Compiler?: CompilerConstructor } };
    __crispyCompilerLoading?: Promise<void>;
  };
  if (mindarWindow.MINDAR?.IMAGE?.Compiler) return Promise.resolve();
  if (mindarWindow.__crispyCompilerLoading) return mindarWindow.__crispyCompilerLoading;
  mindarWindow.__crispyCompilerLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/vendor/mindar/mindar-image.prod.js";
    script.addEventListener("load", () => mindarWindow.MINDAR?.IMAGE?.Compiler ? resolve() : reject(new Error("The environment scanner did not initialize.")), { once: true });
    script.addEventListener("error", () => reject(new Error("The environment scanner could not be loaded.")), { once: true });
    document.head.appendChild(script);
  });
  return mindarWindow.__crispyCompilerLoading;
}

async function blobToImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("A scan frame could not be read."));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compileEnvironment(frames: Blob[], onProgress: (value: number) => void) {
  await loadCompilerRuntime();
  const mindarWindow = window as typeof window & { MINDAR?: { IMAGE?: { Compiler?: CompilerConstructor } } };
  const Compiler = mindarWindow.MINDAR?.IMAGE?.Compiler;
  if (!Compiler) throw new Error("The environment scanner is unavailable.");
  const images = await Promise.all(frames.map(blobToImage));
  const compiler = new Compiler();
  await compiler.compileImageTargets(images, onProgress);
  return compiler.exportData();
}
