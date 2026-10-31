import { useRef, useState, useEffect } from "react";
import { api, getApiError, notifyScanUpdated } from "../services/api";
import BilingualAnswer from "./BilingualAnswer";
import "./ScanImage.css";

function ScanImage({ onRequireAuth }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleImage(event) {
    const file = event.target.files[0];

    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      alert("Please upload a JPG or PNG image.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("Image size must be less than 10 MB.");
      event.target.value = "";
      return;
    }

    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
  }

  function removeImage() {
    setImage(null);
    setPreview("");
    setResult(null);

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function scanImage() {
    if (!image) {
      setResult({ error: "Please upload an image first." });
      return;
    }

    if (onRequireAuth && !onRequireAuth()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await api.scans.image(image);
      setResult(response.data.data.result);
      notifyScanUpdated();
    } catch (error) {
      setResult({ error: getApiError(error, "The image could not be scanned.") });
      notifyScanUpdated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scan-image-page">
      <div className="scan-image-heading">
        <div>
          <span className="page-label">IMAGE SECURITY</span>
          <h2>Scan Image</h2>
          <p>Upload an image to check it for suspicious content.</p>
        </div>

        <div className="scan-image-icon">🛡️</div>
      </div>

      <div className="image-info-card">
        <span>🔍</span>
        <div>
          <strong>AI Image Protection</strong>
          <p>
            ScamShield AI checks the image for visible scam indicators,
            impersonation, and credential or payment requests. Results are
            clearly marked when AI verification is unavailable.
          </p>
        </div>
      </div>

      <div className="image-upload-card">
        <h3>Upload Your Image</h3>
        <p className="upload-description">
          Select an image from your device to begin.
        </p>

        {!preview ? (
          <div
            className="upload-area"
            onClick={() => fileInput.current.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];

              if (fileInput.current && file) {
                const transfer = new DataTransfer();
                transfer.items.add(file);
                fileInput.current.files = transfer.files;
                handleImage({ target: fileInput.current });
              }
            }}
          >
            <div className="upload-icon">📁</div>
            <h3>Drag and drop your image here</h3>
            <p>or click below to browse files</p>

            <button
              type="button"
              className="browse-button"
              onClick={(event) => {
                event.stopPropagation();
                fileInput.current.click();
              }}
            >
              Browse Image
            </button>

            <small>Supported: JPG, PNG · Maximum size: 10 MB</small>
          </div>
        ) : (            <div className="image-preview-section" data-ph-block>
            <div className="preview-header">
              <strong>Image Preview</strong>
              <span className="image-selected">✓ Image selected</span>
            </div>

            <img
              src={preview}
              alt="Selected image preview"
              className="uploaded-image-preview"
            />

            <div className="image-file-details" data-ph-mask>
              <span>🖼️</span>
              <div>
                <strong>{image.name}</strong>
                <small>{(image.size / 1024).toFixed(1)} KB</small>
              </div>
            </div>

            <div className="preview-actions">
              <button
                className="change-image-button"
                onClick={() => fileInput.current.click()}
              >
                Change Image
              </button>

              <button
                className="remove-image-button"
                onClick={removeImage}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          hidden
          onChange={handleImage}
        />

        <button
          className="scan-image-button"
          disabled={!image || loading}
          onClick={scanImage}
        >
          {loading ? "Scanning..." : "🛡️ Scan Image"}
        </button>

        {result && (
          <div className="image-result">
            {result.error ? (
              <>
                <h3>Scan Failed</h3>
                <p>{result.error}</p>
              </>
            ) : (
              <>
                <h3>
                  {result.riskLevel} Risk · {result.riskScore}/100
                </h3>
                <BilingualAnswer result={result} />
                {!result.verified && (
                  <p className="answer-verified-note">
                    <strong>Note:</strong> This result is not AI-verified.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="image-safety-note">
        <span>⚠️</span>
        <p>
          <strong>Privacy reminder:</strong> Do not upload images containing
          OTPs, passwords, personal documents or confidential information.
        </p>
      </div>
    </div>
  );
}

export default ScanImage;
