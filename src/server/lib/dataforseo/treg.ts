import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Routes DataForSEO calls through treg (https://treg.to) instead of a
 * DataForSEO account: set DATAFORSEO_API_KEY to "treg:<treg token>". treg
 * relays DataForSEO's response envelope untouched, so parsing and billing
 * downstream stay the same; only the URL and the auth header change.
 */
export const TREG_KEY_PREFIX = "treg:";

const TREG_CALL_BASE = "https://treg.to/call/";

/**
 * DataForSEO path -> treg catalog endpoint. Left out on purpose:
 * - every task_post / task_get: treg has no task_get, so a queued task would be
 *   billed and never collected (scheduled runs switch to live, see usesTreg)
 * - llm_responses/models: llm-models.ts falls back to its snapshot list
 * - business_listings/categories, appendix/user_data: not in the catalog
 */
const TREG_ENDPOINTS: Record<string, string> = {
  "/ai_optimization/ai_keyword_data/keywords_search_volume/live":
    "dataforseo.x.ai-optimization-ai-keyword-data-keywords-search-volume-live",
  "/ai_optimization/chat_gpt/llm_responses/live":
    "dataforseo.x.ai-optimization-chat-gpt-llm-responses-live",
  "/ai_optimization/claude/llm_responses/live":
    "dataforseo.x.ai-optimization-claude-llm-responses-live",
  "/ai_optimization/gemini/llm_responses/live":
    "dataforseo.x.ai-optimization-gemini-llm-responses-live",
  "/ai_optimization/perplexity/llm_responses/live":
    "dataforseo.x.ai-optimization-perplexity-llm-responses-live",
  "/ai_optimization/chat_gpt/llm_scraper/live/advanced":
    "dataforseo.x.ai-optimization-chat-gpt-llm-scraper-live-advanced",
  "/ai_optimization/gemini/llm_scraper/live/advanced":
    "dataforseo.x.ai-optimization-gemini-llm-scraper-live-advanced",
  // treg lists LLM Mentions under newer endpoint names with the same body.
  "/ai_optimization/llm_mentions/search/live":
    "dataforseo.x.ai-optimization-llm-mentions-search-mentions-live",
  "/ai_optimization/llm_mentions/aggregated_metrics/live":
    "dataforseo.x.ai-optimization-llm-mentions-target-metrics-live",
  "/ai_optimization/llm_mentions/cross_aggregated_metrics/live":
    "dataforseo.x.ai-optimization-llm-mentions-multi-target-metrics-live",
  "/ai_optimization/llm_mentions/top_pages/live":
    "dataforseo.x.ai-optimization-llm-mentions-top-mentioned-pages-live",
  "/backlinks/summary/live": "dataforseo.web.backlinks.summary",
  "/backlinks/backlinks/live": "dataforseo.web.backlinks.list",
  "/backlinks/referring_domains/live": "dataforseo.web.linking_domains.list",
  "/backlinks/domain_pages_summary/live":
    "dataforseo.x.backlinks-domain-pages-summary-live",
  "/backlinks/history/live": "dataforseo.x.backlinks-history-live",
  "/business_data/business_listings/search/live":
    "dataforseo.x.business-data-business-listings-search-live",
  "/business_data/google/my_business_info/live":
    "dataforseo.x.business-data-google-my-business-info-live",
  "/business_data/google/questions_and_answers/live":
    "dataforseo.x.business-data-google-questions-and-answers-live",
  "/dataforseo_labs/google/domain_rank_overview/live":
    "dataforseo.x.dataforseo-labs-google-domain-rank-overview-live",
  "/dataforseo_labs/google/keyword_ideas/live":
    "dataforseo.x.dataforseo-labs-google-keyword-ideas-live",
  "/dataforseo_labs/google/keyword_overview/live":
    "dataforseo.x.dataforseo-labs-google-keyword-overview-live",
  "/dataforseo_labs/google/keyword_suggestions/live":
    "dataforseo.x.dataforseo-labs-google-keyword-suggestions-live",
  "/dataforseo_labs/google/ranked_keywords/live":
    "dataforseo.google.domain.ranked_keywords",
  "/dataforseo_labs/google/related_keywords/live":
    "dataforseo.google.keywords.ideas",
  "/dataforseo_labs/google/relevant_pages/live":
    "dataforseo.x.dataforseo-labs-google-relevant-pages-live",
  "/dataforseo_labs/google/serp_competitors/live":
    "dataforseo.x.dataforseo-labs-google-serp-competitors-live",
  "/keywords_data/google_ads/search_volume/live":
    "dataforseo.google.keywords.volume",
  "/keywords_data/google_ads/keywords_for_keywords/live":
    "dataforseo.x.keywords-data-google-ads-keywords-for-keywords-live",
  "/on_page/lighthouse/live/json": "dataforseo.x.on-page-lighthouse-live-json",
  "/serp/google/local_finder/live/advanced":
    "dataforseo.x.serp-google-local-finder-live-advanced",
  "/serp/google/maps/live/advanced":
    "dataforseo.x.serp-google-maps-live-advanced",
  "/serp/google/organic/live/advanced":
    "dataforseo.x.serp-google-organic-live-advanced",
};

const LOCATIONS_PATH = /^\/serp\/google\/locations\/([^/]+)$/;

/** The treg call URL for a DataForSEO request URL. */
export function tregCallUrl(dataforseoUrl: string): string {
  const url = new URL(dataforseoUrl);
  const path = url.pathname.replace(/^\/v3/, "");
  // Production host only: a sandbox probe must never reach a billed endpoint.
  if (url.origin === "https://api.dataforseo.com") {
    const id = TREG_ENDPOINTS[path];
    if (id) return TREG_CALL_BASE + id;
    const country = LOCATIONS_PATH.exec(path)?.[1];
    if (country)
      return `${TREG_CALL_BASE}dataforseo.x.serp-google-locations-country?country=${country}`;
  }
  throw new AppError(
    "UPSTREAM_UNAVAILABLE",
    `treg does not serve DataForSEO ${url.origin}${url.pathname}`,
    { provider: "treg", providerPath: url.pathname },
  );
}

/** Whether DataForSEO calls go through treg (see TREG_KEY_PREFIX). */
export async function usesTreg(): Promise<boolean> {
  const key = await getOptionalEnvValue("DATAFORSEO_API_KEY");
  return key?.startsWith(TREG_KEY_PREFIX) ?? false;
}
