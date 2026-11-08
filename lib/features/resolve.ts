import { FEATURE_CATALOG, FEATURE_BY_KEY, isFeatureEnabled } from "@/lib/features/catalog";

export function getFeatureState(featureKey: string, userRole?: string | null) {
  return isFeatureEnabled(featureKey, userRole);
}

export const FEATURE_KEYS = FEATURE_CATALOG.map((feature) => feature.key);
export const FEATURE_DEFAULTS = new Map(FEATURE_CATALOG.map((feature) => [feature.key, feature.defaultEnabled]));

export function getFeatureAvailability(featureKey: string, userRole?: string | null) {
  const feature = FEATURE_BY_KEY.get(featureKey);
  if (!feature) {
    return { enabled: false, feature: null };
  }

  return {
    enabled: getFeatureState(featureKey, userRole),
    feature,
  };
}
