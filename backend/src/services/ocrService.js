/**
 * Local OCR (optical character recognition) using Tesseract.
 *
 * This is a real, deterministic fallback for image scans when a vision AI is
 * not configured. It reads visible text from the image on this server; the
 * image and the extracted text are never sent to a third party.
 *
 * OCR is not a visual scam detector. Its result is always reported as
 * unverified, and the caller must say so in the explanation.
 */
const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");
const AppError = require("../utils/AppError");

const CACHE_DIRECTORY = path.join(__dirname, "..", "..", ".cache", "tesseract");
const OCR_TIMEOUT_MS = 75_000;
const MAX_TEXT_LENGTH = 5000;

let workerPromise = null;
// Tesseract workers process one job at a time. Serialise jobs so two uploads
// never share the same worker mid-recognition.
let queue = Promise.resolve();

async function getWorker() {
  if (!workerPromise) {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });

    workerPromise = createWorker("eng", 1, {
      cachePath: CACHE_DIRECTORY,
      gzip: true,
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

async function resetWorker() {
  const pending = workerPromise;
  workerPromise = null;

  if (!pending) return;

  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // The worker may already be gone.
  }
}

function cleanText(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

async function runRecognition(buffer) {
  const worker = await getWorker();

  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(
          "Reading the image took too long. Please try a smaller or clearer image.",
          503,
          { code: "OCR_TIMEOUT", isOperational: true, expose: true }
        )
      );
    }, OCR_TIMEOUT_MS);
    timer.unref?.();
  });

  try {
    const result = await Promise.race([worker.recognize(buffer), timeout]);
    const text = cleanText(result?.data?.text);
    const confidence = Number(result?.data?.confidence);

    return {
      text,
      confidence: Number.isFinite(confidence) ? Math.round(confidence) : 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads text from an image buffer. Returns { text, confidence }.
 * Throws an AppError with code OCR_UNAVAILABLE when Tesseract cannot run.
 */
async function recognizeText(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError("An image is required for OCR.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  const job = queue.then(() => runRecognition(buffer));

  // Keep the queue alive even when this job fails.
  queue = job.catch(() => {});

  try {
    return await job;
  } catch (error) {
    if (error instanceof AppError) {
      // A timeout can leave the worker busy, so rebuild it next time.
      if (error.code === "OCR_TIMEOUT") await resetWorker();
      throw error;
    }

    console.warn(`[ocr] recognition failed (${error?.name || "Error"})`);
    await resetWorker();

    throw new AppError(
      "Image text analysis is unavailable right now. No verdict was generated.",
      503,
      { code: "OCR_UNAVAILABLE", isOperational: true, expose: true }
    );
  }
}

async function closeOcrWorker() {
  await resetWorker();
}

module.exports = { recognizeText, closeOcrWorker };
