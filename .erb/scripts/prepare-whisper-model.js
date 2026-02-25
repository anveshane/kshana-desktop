const fs = require('fs');
const path = require('path');

const MODEL = 'tiny.en';
const MODEL_FILENAME = `ggml-${MODEL}.bin`;
const rootPath = path.resolve(__dirname, '../..');
const modelFolder = path.join(rootPath, 'assets', 'whisper-models');
const modelPath = path.join(modelFolder, MODEL_FILENAME);

async function modelExistsWithContent(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(modelFolder, { recursive: true });

  if (await modelExistsWithContent(modelPath)) {
    console.log(`[Whisper model] Using existing model at ${modelPath}`);
    return;
  }

  console.log(`[Whisper model] Downloading ${MODEL_FILENAME} to ${modelFolder}`);
  const whisper = await import('@remotion/install-whisper-cpp');
  if (!whisper.downloadWhisperModel) {
    throw new Error(
      'Failed to load @remotion/install-whisper-cpp downloadWhisperModel export.',
    );
  }

  await whisper.downloadWhisperModel({
    folder: modelFolder,
    model: MODEL,
    printOutput: true,
  });

  if (!(await modelExistsWithContent(modelPath))) {
    throw new Error(
      `Model download completed but ${MODEL_FILENAME} was not found in ${modelFolder}.`,
    );
  }

  console.log(`[Whisper model] Prepared ${modelPath}`);
}

main().catch((error) => {
  console.error(
    `[Whisper model] Failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
