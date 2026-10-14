/**
 * How the application works, as a short loop on the sign-in page: an application's documents
 * arrive, the AI reads them and checks each answer (one is flagged), a risk score fills in, and the
 * reviewer's decision lands. Decorative: the steps beside it say the same in words. For anyone who
 * asks for less motion it is drawn still, at its finished state.
 */
const ROWS = [62, 84, 106, 128, 150];
const FLAGGED = 2; // the third answer is the one the AI flags

export default function LoginFlow() {
  return (
    <div className="login-flow" aria-hidden="true">
      <svg viewBox="16 0 440 205" focusable="false">
        {/* The application and its evidence */}
        <g className="lf-doc">
          <rect className="lf-card" x="16" y="18" width="128" height="164" rx="12" />
          <rect className="lf-line-strong" x="32" y="36" width="62" height="8" rx="4" />
          {ROWS.map((y, i) => (
            <g key={y}>
              <rect className="lf-line" x="32" y={y} width={i % 2 ? 58 : 72} height="7" rx="3.5" />
              {/* Placed by the outer group; the inner one is what animates. */}
              <g transform={`translate(124 ${y + 3.5})`}>
                <g className={`lf-mark lf-mark-${i + 1} ${i === FLAGGED ? "is-flag" : "is-ok"}`}>
                  <circle r="7.5" />
                  {i === FLAGGED ? <path d="M0 -3.4V0.6M0 3.2v0.1" /> : <path d="M-3.2 0.2l2.1 2.1 4-4.2" />}
                </g>
              </g>
            </g>
          ))}
          <rect className="lf-beam" x="22" y="52" width="116" height="18" rx="5" />
        </g>
        <text className="lf-caption" x="80" y="200">
          Evidence
        </text>

        {/* The AI reading it */}
        <path className="lf-link" d="M152 100H198" />
        <g className="lf-chip">
          <rect x="202" y="68" width="76" height="64" rx="16" />
          <text x="240" y="108">
            AI
          </text>
        </g>
        <text className="lf-caption" x="240" y="200">
          AI check
        </text>
        <path className="lf-link" d="M284 100H322" />

        {/* The score, then the decision */}
        <g className="lf-score">
          <circle className="lf-ring-track" cx="382" cy="84" r="40" />
          <circle className="lf-ring" cx="382" cy="84" r="40" transform="rotate(-90 382 84)" />
          <text className="lf-score-value" x="382" y="92">
            10
          </text>
          <text className="lf-score-band" x="382" y="144">
            Low risk
          </text>
        </g>
        <g transform="translate(330 156)">
          <g className="lf-stamp">
            <rect width="104" height="28" rx="14" />
            <path d="M16 14.4l3.4 3.4 6.4-6.8" />
            <text x="62" y="18.5">
              Accepted
            </text>
          </g>
        </g>
        <text className="lf-caption" x="382" y="200">
          Score and decision
        </text>
      </svg>
    </div>
  );
}
