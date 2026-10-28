import { useMotion } from "../../motion/MotionContext.jsx";
import Icon from "../ui/Icon.jsx";

/** Lets visitors pause the decorative animations (saved in this browser). */
export default function MotionToggle({ withLabel = false }) {
  const { reduced, systemReduced, toggle } = useMotion();
  const label = systemReduced
    ? "Animations are reduced by your device settings"
    : reduced
      ? "Turn animations on"
      : "Turn animations off";
  return (
    <button
      type="button"
      className={withLabel ? "btn btn--ghost btn--sm motion-toggle" : "icon-btn motion-toggle"}
      onClick={toggle}
      disabled={systemReduced}
      aria-pressed={!reduced}
      aria-label={withLabel ? undefined : label}
      title={label}
    >
      <Icon name="sparkles" size={18} />
      {withLabel ? <span>{reduced ? "Animations: off" : "Animations: on"}</span> : null}
    </button>
  );
}
