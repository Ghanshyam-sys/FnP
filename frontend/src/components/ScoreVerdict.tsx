import ScoreGauge from "./ScoreGauge";
import RiskMeter from "./RiskMeter";
import { AlertOctagonIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "./icons";
import type { ScoreResult } from "../domain/types";

const BAND_ICON = {
  Low: CheckCircleIcon,
  Moderate: InfoIcon,
  Elevated: AlertTriangleIcon,
  High: AlertOctagonIcon,
} as const;

/**
 * The score at a glance: the gauge and the risk meter, the band and the recommendation, and the
 * figures behind the score. The scoring page and the assessment summary (on screen and in its PDF)
 * show the same one. `framed` gives it its own card; inside a section that is already one, it
 * goes without.
 */
export default function ScoreVerdict({ scoreResult, framed = true }: { scoreResult: ScoreResult; framed?: boolean }) {
  const BandIcon = BAND_ICON[scoreResult.band];
  return (
    <section className={`verdict${framed ? " card" : ""}`}>
      <div className="verdict-score">
        <ScoreGauge score={scoreResult.riskScore100} band={scoreResult.band} />
        <RiskMeter score={scoreResult.riskScore100} band={scoreResult.band} />
      </div>

      <div className="verdict-body">
        <span className={`chip chip-${scoreResult.band.toLowerCase()}`}>
          <BandIcon size={14} />
          {scoreResult.band} risk
        </span>
        <h2 className="verdict-reco">{scoreResult.recommendation}</h2>
        <dl className="verdict-stats">
          <div>
            <dt>Weighted risk</dt>
            <dd>{scoreResult.totalWeightedRisk.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Applicable weight</dt>
            <dd>{scoreResult.totalApplicableWeight}</dd>
          </div>
          <div>
            <dt>Normalised</dt>
            <dd>{scoreResult.normalisedRiskScore.toFixed(3)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
