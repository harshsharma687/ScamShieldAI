/**
 * Image scam detection.
 *
 * Preferred path: a vision-capable AI model analyses the image. If no model is
 * configured, or the provider fails, the server reads visible text locally
 * with Tesseract OCR and checks that text against the same deterministic
 * message rules. The OCR result is always labelled unverified, because OCR
 * cannot see layout, logos or a forged screenshot. It never fabricates a
 * "safe" verdict.
 *
 * Before the image is analysed it is decoded, rotated, resized and re-encoded
 * without metadata. This strips EXIF/GPS data and reduces the payload sent to
 * the AI provider.
 */
const sharp = require("sharp");
const AppError = require("../utils/AppError");
const {
  analyzeWithAI,
  isAiConfigured,
  AiServiceError,
} = require("./aiDetectionService");
const { recognizeText } = require("./ocrService");
const { getMessageIndicators } = require("./messageDetectionService");
const {
  clampScore,
  classifyRisk,
  isScamScore,
  buildRecommendation,
} = require("../utils/risk");
const { buildEasyAnswer, answersFromAi } = require("../utils/bilingual");

const MAX_INPUT_PIXELS = 40_000_000; // ~40 MP decompression-bomb guard

async function prepareImage(buffer) {
  try {
    const pipeline = sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
      sequentialRead: true,
    });

    const metadata = await pipeline.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Missing image dimensions");
    }

    if (!["jpeg", "png"].includes(metadata.format)) {
      throw new Error("Unsupported decoded format");
    }

    const processed = await pipeline
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return {
      buffer: processed,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch {
    throw new AppError(
      "The uploaded file could not be decoded as a valid JPG or PNG image.",
      422,
      { code: "INVALID_IMAGE_CONTENT" }
    );
  }
}

function buildImageExplanation(ai) {
  // AI writes in the language of the image's visible text (English, Hindi or
  // Hinglish), so its explanation comes first.
  return [
    ai.explanation,
    `The uploaded image was decoded (${ai.width}x${ai.height}) and checked for visible scam indicators, impersonation and credential or payment requests.`,
    "Image analysis is assistive. Forged screenshots may evade detection, and a low score is not a guarantee that the image is legitimate.",
  ]
    .join(" ")
    .slice(0, 3000);
}

function buildOcrExplanation({ indicators, ocr, aiError, riskLevel, hasReadableText }) {
  const reason =
    aiError?.code === "AI_NOT_CONFIGURED"
      ? "A vision AI provider is not configured"
      : "The vision AI provider was unavailable";

  if (!hasReadableText) {
    return [
      `${reason}, and OCR found no readable text in this image.`,
      "The image therefore could not be analysed. This is not a safety verdict and the image must not be treated as safe.",
      `Image size: ${ocr.width}x${ocr.height}.`,
    ].join(" ");
  }

  const evidence = indicators.length
    ? `Deterministic text checks found: ${indicators.map((item) => item.label).join("; ")}.`
    : "Deterministic text checks found no specific scam indicators in the readable text.";

  const verdict =
    riskLevel === "Low"
      ? "This is a fallback reading only, not proof that the image is genuine."
      : "Treat the readable text as suspicious until you verify the sender through an official channel.";

  return [
    `${reason}, so visible text was read locally with OCR (${ocr.text.length} characters, ${ocr.confidence}% confidence) and checked with deterministic rules.`,
    evidence,
    verdict,
    "OCR cannot detect forged layouts, logos or QR codes, and this image was not AI-verified.",
  ]
    .join(" ")
    .slice(0, 3000);
}

function buildOcrFallback({ prepared, ocr, aiError }) {
  const hasReadableText = ocr.text.replace(/[^A-Za-z0-9]/g, "").length >= 3;
  const indicators = hasReadableText ? getMessageIndicators(ocr.text) : [];
  const riskScore = clampScore(
    indicators.reduce((total, item) => total + item.weight, 0)
  );
  const riskLevel = classifyRisk(riskScore);
  const answers = buildEasyAnswer({ riskLevel, riskScore, indicators });

  answers.hi.explanation += hasReadableText
    ? " यह इमेज की AI जाँच नहीं है, इसलिए इसे सुरक्षित न मानें।"
    : " इमेज में पढ़ने लायक टेक्स्ट नहीं मिला, इसलिए इसे सुरक्षित या असुरक्षित कुछ भी न मानें।";
  answers.en.explanation += hasReadableText
    ? " This was not an AI image check, so do not treat the image as safe."
    : " No readable text was found, so this image could not be checked at all.";

  return {
    answers,
    riskScore,
    riskLevel,
    isScam: isScamScore(riskScore),
    explanation: buildOcrExplanation({
      indicators,
      ocr: {
        ...ocr,
        width: prepared.width,
        height: prepared.height,
      },
      aiError,
      riskLevel,
      hasReadableText,
    }),
    recommendation: `${buildRecommendation(riskLevel)} Never treat an OCR-only, unverified image as safe.`,
    detectionSource: "ocr-fallback",
    verified: false,
    indicators,
    aiUsed: false,
    ocrUsed: true,
    ocrConfidence: ocr.confidence,
    dimensions: { width: prepared.width, height: prepared.height },
  };
}

async function analyzeImage({ buffer, prepared: preparedImage }) {
  // The controller may already have decoded the image (to store it), in which
  // case it passes the prepared copy instead of decoding twice.
  const prepared = preparedImage || (await prepareImage(buffer));
  let ai = null;
  let aiError = null;

  try {
    ai = await analyzeWithAI({
      scanType: "image",
      imageBase64: prepared.buffer.toString("base64"),
      imageMimeType: "image/jpeg",
      indicators: ["Image decoded, metadata stripped and resized for analysis"],
    });
  } catch (error) {
    // A provider failure (including a model that does not accept images) is
    // allowed to fall back to local OCR. Programme errors still propagate.
    if (!(error instanceof AiServiceError)) throw error;
    aiError = error;
  }

  if (ai) {
    const riskLevel = classifyRisk(ai.riskScore);

    return {
      riskScore: ai.riskScore,
      riskLevel,
      isScam: isScamScore(ai.riskScore),
      explanation: buildImageExplanation({
        ...ai,
        width: prepared.width,
        height: prepared.height,
      }),
      recommendation: ai.recommendation || buildRecommendation(riskLevel),
      answers: answersFromAi({
        ai,
        riskLevel,
        riskScore: ai.riskScore,
        indicators: ai.indicators || [],
      }),
      detectionSource: "ai-vision",
      verified: true,
      indicators: ai.indicators,
      aiUsed: true,
      ocrUsed: false,
      dimensions: { width: prepared.width, height: prepared.height },
    };
  }

  try {
    const ocr = await recognizeText(prepared.buffer);
    return buildOcrFallback({ prepared, ocr, aiError });
  } catch (ocrError) {
    // If the AI was configured but failed, report that outage. Otherwise make
    // it clear that neither analysis path is available.
    if (!isAiConfigured()) {
      console.warn("[image] no AI provider and OCR is unavailable");
      throw new AppError(
        "Image analysis is unavailable: no vision AI provider is configured and local OCR could not run. No verdict was generated.",
        503,
        { code: "IMAGE_ANALYSIS_UNAVAILABLE" }
      );
    }

    throw aiError || ocrError;
  }
}

module.exports = { analyzeImage, prepareImage };
