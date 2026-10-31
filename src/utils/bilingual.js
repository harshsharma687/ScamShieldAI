/**
 * Easy-language answers in Hindi and English.
 *
 * Every scan result carries the same verdict twice: once in simple Hindi and
 * once in simple English. The UI shows them as two separate blocks, and both
 * are stored in MySQL so the history shows the same wording later.
 *
 * The templates below are used when the AI is not available, and also to fill
 * a missing Hindi or English half of an AI answer. They never invent evidence:
 * they only restate the risk level and the indicators that were really found.
 */
const RISK_HINDI = {
  Low: "कम जोखिम",
  Medium: "मध्यम जोखिम",
  High: "ज़्यादा जोखिम",
  Critical: "बहुत ज़्यादा जोखिम",
};

const MESSAGE_LABEL_HI = {
  "otp-request": "OTP या वेरिफिकेशन कोड माँगा गया है",
  "otp-request-reverse": "OTP या वेरिफिकेशन कोड माँगा गया है",
  "password-request": "पासवर्ड या PIN माँगा गया है",
  "card-details": "कार्ड या बैंक की जानकारी का ज़िक्र है",
  "money-request": "पैसे भेजने की माँग है",
  prize: "इनाम या लॉटरी जीतने का दावा है",
  urgency: "जल्दी करने का दबाव बनाया गया है",
  "account-threat": "खाता बंद होने की धमकी दी गई है",
  impersonation: "बैंक या कंपनी होने का दावा है",
  secrecy: "यह बात किसी को न बताने को कहा गया है",
  investment: "कमाई या निवेश का झूठा वादा है",
  "click-here": "लिंक पर क्लिक करने को कहा गया है",
  "verify-account": "खाता वेरिफाई करने को कहा गया है",
  "kyc-refund": "KYC, रिफंड या पार्सल का बहाना है",
  "crypto-address": "क्रिप्टो वॉलेट पता दिया गया है",
  "generic-greeting": "बिना नाम का सामान्य अभिवादन है",
  attachment: "अटैचमेंट या फाइल खोलने को कहा गया है",
  "legal-threat": "कानूनी कार्रवाई या जुर्माने की धमकी है",
  "message-link": "मैसेज में लिंक है",
  shortener: "छोटा किया गया लिंक असली पता छिपाता है",
  "private-link": "लिंक लोकल या प्राइवेट नेटवर्क का है",
  "suspicious-link": "लिंक का ढाँचा संदिग्ध है",
  "credential-plus-link": "साथ में लिंक और गोपनीय जानकारी माँगी गई है",
  "payment-pressure": "पैसे की माँग के साथ दबाव या लिंक है",
};

const URL_LABEL_HI = {
  http: "वेबसाइट सुरक्षित HTTPS का इस्तेमाल नहीं करती",
  "ip-host": "डोमेन नाम की जगह सीधा IP पता है",
  punycode: "डोमेन में ऐसे अक्षर हैं जिनसे नकली नाम बनाया जा सकता है",
  encoded: "लिंक में छिपे हुए कोड हैं",
  shortener: "छोटा किया गया लिंक असली पता छिपाता है",
  "suspicious-tld": "डोमेन का अंत ऐसा है जिसका इस्तेमाल ठगी में होता है",
  "scam-keywords": "लिंक में डर या लॉगिन जैसे शब्द हैं",
  "brand-impersonation": "किसी बड़ी कंपनी का नाम गलत वेबसाइट पर है",
  subdomains: "लिंक में बहुत सारे उप-डोमेन हैं",
  hyphens: "वेबसाइट के नाम में बहुत सारे हाइफ़न हैं",
  "long-host": "वेबसाइट का नाम बहुत लंबा है",
  "long-url": "लिंक बहुत लंबा है",
  "nonstandard-port": "वेबसाइट गैर-मानक पोर्ट पर चल रही है",
  "dangerous-extension": "लिंक एक खतरनाक फाइल की ओर जाता है",
  "redirect-param": "लिंक किसी और पते पर भेज सकता है",
  "at-sign": "लिंक में @ चिह्न है जो असली पता छिपाता है",
  digits: "वेबसाइट के नाम में लंबी संख्या है",
};

// Indicators arrive either as { code, label } objects (deterministic checks)
// or as plain strings (AI evidence labels).
function normalizeIndicator(item) {
  if (typeof item === "string") return { code: "", label: item };

  return { code: item?.code || "", label: item?.label || "" };
}

function hindiLabel(indicators) {
  const labels = [];

  for (const indicator of indicators.map(normalizeIndicator)) {
    const translated =
      MESSAGE_LABEL_HI[indicator.code] || URL_LABEL_HI[indicator.code];

    if (translated && !labels.includes(translated)) labels.push(translated);
    if (labels.length === 3) break;
  }

  return labels;
}

function englishLabel(indicators) {
  const labels = indicators
    .map(normalizeIndicator)
    .map((item) => item.label)
    .filter(Boolean);

  return [...new Set(labels)].slice(0, 3);
}

function listSentence(items, language) {
  if (!items.length) return "";

  if (language === "hi") {
    return ` जो बातें मिलीं: ${items.join("; ")}।`;
  }

  return ` What we noticed: ${items.join("; ")}.`;
}

const HINDI_VERDICT = {
  Low: "इस सामग्री में ठगी का कोई साफ संकेत नहीं मिला। फिर भी यह पक्का नहीं है कि यह सुरक्षित है।",
  Medium:
    "इस सामग्री में कुछ संदिग्ध बातें मिली हैं। अभी यह पक्का नहीं कहा जा सकता कि यह ठगी है, इसलिए सावधानी रखें।",
  High: "इस सामग्री में ठगी के कई मजबूत संकेत मिले हैं। इस पर भरोसा न करें।",
  Critical:
    "यह साफ तौर पर ठगी जैसी लग रही है। इसमें पैसे, OTP या निजी जानकारी माँगने जैसे गंभीर संकेत मिले हैं।",
};

const ENGLISH_VERDICT = {
  Low: "Nothing clearly dangerous was found in this content. That still does not prove it is safe.",
  Medium:
    "Some suspicious things were found here. There is not enough proof to call it fraud, so please stay careful.",
  High: "Several strong scam signs were found here. It is not safe to trust this content.",
  Critical:
    "This looks like a scam. It shows serious signs such as asking for money, OTPs or personal details.",
};

const HINDI_ADVICE = {
  Low: "पैसा, OTP या पासवर्ड किसी को न दें। भेजने वाले की असली वेबसाइट या आधिकारिक नंबर से पुष्टि करें।",
  Medium:
    "लिंक पर क्लिक न करें और कोई निजी जानकारी न दें। पहले आधिकारिक नंबर या वेबसाइट से जाँच करें।",
  High: "इस पर जवाब न दें, लिंक न खोलें और पैसा या OTP न भेजें। इसे रिपोर्ट करके डिलीट करें।",
  Critical:
    "तुरंत रुक जाएँ। किसी लिंक पर क्लिक न करें, पैसा या OTP न भेजें। रिपोर्ट करें और अगर आपने जवाब दे दिया है तो बैंक को आधिकारिक नंबर पर बताएँ।",
};

const ENGLISH_ADVICE = {
  Low: "Do not share money, OTPs or passwords. Confirm the sender on the official website or phone number first.",
  Medium:
    "Do not click any link and do not share personal details. Check with the official number or website first.",
  High: "Do not reply, do not open any link, and never send money or OTPs. Report and delete this content.",
  Critical:
    "Stop right now. Do not click links or send money or OTPs. Report it, and call your bank on its official number if you already replied.",
};

function normalizeLevel(riskLevel) {
  return HINDI_VERDICT[riskLevel] ? riskLevel : "Medium";
}

/**
 * Builds the same verdict in simple Hindi and simple English from a risk level
 * and the indicators that were actually detected.
 */
function buildEasyAnswer({ riskLevel, riskScore, indicators = [] }) {
  const level = normalizeLevel(riskLevel);
  const scoreText = Number.isFinite(Number(riskScore))
    ? ` (${Math.round(Number(riskScore))}/100)`
    : "";
  const hi = hindiLabel(indicators);
  const en = englishLabel(indicators);

  return {
    hi: {
      explanation: `${HINDI_VERDICT[level]}${listSentence(hi, "hi")}`.trim(),
      recommendation: HINDI_ADVICE[level],
    },
    en: {
      explanation: `${ENGLISH_VERDICT[level]}${listSentence(en, "en")}`.trim(),
      recommendation: ENGLISH_ADVICE[level],
    },
    riskLevelLabel: {
      hi: `${RISK_HINDI[level]}${scoreText}`,
      en: `${level} risk${scoreText}`,
    },
  };
}

/**
 * Uses the AI's own simple wording when it provided one, and fills any missing
 * half from the templates so the UI never shows an empty block.
 */
function answersFromAi({ ai, riskLevel, riskScore, indicators = [] }) {
  const fallback = buildEasyAnswer({ riskLevel, riskScore, indicators });

  return {
    hi: {
      explanation: ai?.explanationHi || fallback.hi.explanation,
      recommendation: ai?.recommendationHi || fallback.hi.recommendation,
    },
    en: {
      explanation: ai?.explanationEn || fallback.en.explanation,
      recommendation: ai?.recommendationEn || fallback.en.recommendation,
    },
    riskLevelLabel: fallback.riskLevelLabel,
  };
}

module.exports = {
  buildEasyAnswer,
  answersFromAi,
  RISK_HINDI,
};
