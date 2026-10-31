import { useEffect, useState } from "react";
import { api, getApiError } from "../services/api";
import { formatDate, statusClass } from "../utils/format";
import BilingualAnswer from "./BilingualAnswer";
import "./ScanHistory.css";

/**
 * Loads the stored image for one record. Kept as its own component so it
 * remounts (and re-fetches) when another record is opened, and so the blob URL
 * is always released.
 */
function DetailImage({ scan }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scan.fileUrl) return undefined;

    let objectUrl = "";
    let cancelled = false;

    api.scans
      .file(scan.id)
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError("The stored image could not be loaded.");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scan.id, scan.fileUrl]);

  if (error) return <p className="history-note">{error}</p>;
  if (!url) return <p className="history-note">Loading image…</p>;

  return <img src={url} alt="Scanned item" />;
}

/**
 * History list plus a detail view.
 *
 * The list endpoint already returns the full submitted value and the whole
 * verdict, so opening a row needs no extra request. Only a scanned image is
 * fetched separately, because that route is authenticated.
 */
function ScanHistory() {
  const [scanHistory, setScanHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const response = await api.history.list({ limit: 100 });

        if (!mounted) return;

        setScanHistory(response.data.data.scans);
        setTotal(response.data.meta?.pagination?.total ?? 0);
      } catch (requestError) {
        if (mounted) {
          setScanHistory([]);
          setTotal(0);
          setError(
            getApiError(requestError, "Could not load your scan history.")
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadHistory();

    const handleScanUpdated = () => loadHistory();
    window.addEventListener("scan-history-updated", handleScanUpdated);

    return () => {
      mounted = false;
      window.removeEventListener("scan-history-updated", handleScanUpdated);
    };
  }, []);

  useEffect(() => {
    if (!selected) return undefined;

    function handleKey(event) {
      if (event.key === "Escape") setSelected(null);
    }

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [selected]);

  const suspiciousCount = scanHistory.filter(
    (scan) => scan.result?.isScam
  ).length;

  const pendingCount = scanHistory.filter(
    (scan) => scan.status === "pending"
  ).length;

  return (
    <div className="history-page">
      <div className="history-heading">
        <div>
          <h1>Scan History</h1>
          <p>Open any record to see what was scanned and what the AI answered.</p>
        </div>

        <span className="history-count">{total} Scans</span>
      </div>

      <div className="history-stats">
        <div className="history-stat">
          <h3>{loading ? "…" : total}</h3>
          <p>Total Scans</p>
        </div>

        <div className="history-stat">
          <h3>{loading ? "…" : suspiciousCount}</h3>
          <p>Suspicious Items</p>
        </div>

        <div className="history-stat">
          <h3>{loading ? "…" : pendingCount}</h3>
          <p>Pending Analysis</p>
        </div>
      </div>

      <div className="history-table-card">
        <h2>Recent Scans</h2>

        {loading ? (
          <p className="history-note">Loading your scan history…</p>
        ) : error ? (
          <p className="history-note">{error}</p>
        ) : scanHistory.length === 0 ? (
          <p className="history-note">
            No scans yet. Your scanned items will appear here.
          </p>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Scan Type</th>
                  <th>Scanned Item</th>
                  <th>Result</th>
                  <th>Date</th>
                  <th>Details</th>
                </tr>
              </thead>

              <tbody>
                {scanHistory.map((scan) => (
                  <tr
                    key={scan.id}
                    className="history-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${scan.typeLabel} scan details`}
                    onClick={() => setSelected(scan)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(scan);
                      }
                    }}
                  >
                    <td>{scan.typeLabel}</td>
                    <td className="history-item" data-ph-mask>
                      {scan.displayName}
                    </td>
                    <td>
                      <span
                        className={`history-status ${statusClass(
                          scan.statusLabel
                        )}`}
                      >
                        {scan.statusLabel}
                      </span>
                    </td>
                    <td>{formatDate(scan.createdAt)}</td>
                    <td>
                      <span className="history-open">View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="history-note">
        Scan records are stored securely in your ScamShield account
        {total > scanHistory.length
          ? ` · showing the latest ${scanHistory.length} of ${total}`
          : ""}
        .
      </p>

      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <div
            className="scan-modal history-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Scan details"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close details"
            >
              ×
            </button>

            <span className="history-detail-label">
              {selected.typeLabel} scan · {formatDate(selected.createdAt)}
            </span>

            <h2>
              {selected.result
                ? `${selected.result.riskLevel} Risk · ${selected.result.riskScore}/100`
                : selected.statusLabel}
            </h2>

            {selected.result && (
              <div className="history-detail-badges">
                <span
                  className={`history-status ${statusClass(selected.statusLabel)}`}
                >
                  {selected.statusLabel}
                </span>
                <span className="history-detail-badge">
                  {selected.result.verified ? "AI-verified" : "Not AI-verified"}
                </span>
                {selected.result.riskLevelHi && (
                  <span className="history-detail-badge hindi">
                    {selected.result.riskLevelHi}
                  </span>
                )}
              </div>
            )}

            <h3 className="history-detail-heading">Scanned content</h3>

            {selected.scanType === "image" ? (
              <div className="history-detail-image">
                <DetailImage key={selected.id} scan={selected} />
                <p className="history-note" data-ph-mask>
                  {selected.inputValue || "Image upload"}
                </p>
              </div>
            ) : (
              <p className="history-detail-content" data-ph-mask>
                {selected.inputValue}
              </p>
            )}

            <h3 className="history-detail-heading">AI analysis</h3>

            {selected.result ? (
              <BilingualAnswer result={selected.result} />
            ) : (
              <p className="history-note">
                {selected.status === "failed"
                  ? "The analysis failed for this scan, so no verdict was saved."
                  : "The analysis is still pending for this scan."}
              </p>
            )}

            {selected.result?.detectionSource && (
              <p className="history-detail-meta">
                Detection source: {selected.result.detectionSource}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ScanHistory;
