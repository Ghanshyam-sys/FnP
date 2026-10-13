import { useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loading } from "./LoadState";
import { reachedByBack } from "../state/backNavigation";

/**
 * For a page that no longer applies (the form or review page of a submitted case). Opened from a
 * link, reloaded, or reached with Forward, it sends the user to `to` (the case's status). Reached
 * with the browser's Back button, it steps back once more instead, so Back keeps going back:
 * redirecting forward to the status page would land the user where they just came from, and every
 * further Back would bounce the same way.
 */
export default function LeaveLockedPage({ to }: { to: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cameBack = reachedByBack(location.key);
  const stepped = useRef(false);

  useEffect(() => {
    if (cameBack && !stepped.current) {
      stepped.current = true; // once, even where effects run twice (development)
      navigate(-1);
    }
  }, [cameBack, navigate]);

  return cameBack ? <Loading /> : <Navigate to={to} replace />;
}
