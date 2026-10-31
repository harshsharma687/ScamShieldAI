import "./BilingualAnswer.css";

/**
 * The AI verdict shown twice: easy Hindi on top, easy English below.
 *
 * Both halves come from the backend, so the same wording appears on the scan
 * page and later in the history. When an older record has no Hindi half, only
 * the English block is rendered instead of an empty box.
 */
function BilingualAnswer({ result }) {
  if (!result || result.error) return null;

  const hindi = result.answers?.hi;
  const english = result.answers?.en;

  if (!hindi && !english) return null;

  return (
    <div className="bilingual-answer">
      {hindi && (
        <section className="answer-block answer-hindi" lang="hi">
          <span className="answer-tag">हिंदी में आसान जवाब</span>
          <p className="answer-text" data-ph-mask>
            {hindi.explanation}
          </p>
          {hindi.recommendation && (
            <p className="answer-advice" data-ph-mask>
              <strong>क्या करें:</strong> {hindi.recommendation}
            </p>
          )}
        </section>
      )}

      {english && (
        <section className="answer-block answer-english" lang="en">
          <span className="answer-tag">Simple English answer</span>
          <p className="answer-text" data-ph-mask>
            {english.explanation}
          </p>
          {english.recommendation && (
            <p className="answer-advice" data-ph-mask>
              <strong>What to do:</strong> {english.recommendation}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export default BilingualAnswer;
