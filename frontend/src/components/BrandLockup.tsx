/**
 * The iRIS RegAI lockup: the IRIS mark and "iRIS", "RegAI" on the same baseline, and the tagline
 * set against the star's right arm, as in the product logo. One drawing, so the parts stay aligned
 * at any size. Its colours come from the theme; the dark theme uses the logo's light version.
 *
 * Coordinates are those of the logo image (323 x 205): the "iRIS" baseline is at y 93, its letters
 * end at x 319, and the star's right arm ends at x 198 at y 114 (the tagline starts a little after it).
 */
export default function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`lockup ${className}`}
      viewBox="0 0 740 205"
      role="img"
      aria-label="iRIS RegAI. Building Transparency. Driving Growth."
    >
      <image className="lockup-mark lockup-light" href="/brand/iris-logo.png" width="323" height="205" />
      <image className="lockup-mark lockup-dark" href="/brand/iris-logo-dark.png" width="323" height="205" />
      <text className="lockup-regai" x="333" y="93">
        RegAI
      </text>
      <text className="lockup-tagline" x="218" y="123">
        Building Transparency. Driving Growth.
      </text>
    </svg>
  );
}
