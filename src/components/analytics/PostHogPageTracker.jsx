import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePostHog } from "@posthog/react";
import { isPostHogEnabled } from "../../lib/posthog";

export default function PostHogPageTracker() {
  const location = useLocation();
  const posthog = usePostHog();

  useEffect(() => {
    if (!isPostHogEnabled() || !posthog) return;

    const params = new URLSearchParams(location.search);
    posthog.capture("app_pageview", {
      pathname: location.pathname,
      search: location.search,
      business_id: params.get("businessId") ?? undefined,
      agendamento_id: params.get("agendamentoId") ?? undefined,
    });
  }, [location.pathname, location.search, posthog]);

  return null;
}
