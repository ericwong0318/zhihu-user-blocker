import { FactCheckConfig, ProviderId } from './providers';
import { FactCheckLanguage } from './prompt';

const KNOWN_PROVIDERS: ProviderId[] = [
  'claude',
  'local',
  'gemini',
  'openai',
  'deepseek',
  'openrouter',
  'other',
];

const KNOWN_LANGUAGES: FactCheckLanguage[] = ['zh-CN', 'zh-TW', 'en'];

const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && KNOWN_PROVIDERS.includes(value as ProviderId);

const isFactCheckLanguage = (value: unknown): value is FactCheckLanguage =>
  typeof value === 'string' &&
  KNOWN_LANGUAGES.includes(value as FactCheckLanguage);

const normalizeRawConfig = (raw: unknown): FactCheckConfig | null => {
  if (!raw || typeof raw !== 'object') return null;
  const config = raw as Record<string, unknown>;
  if (!isProviderId(config.provider)) return null;

  return {
    provider: config.provider,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : undefined,
    model: typeof config.model === 'string' ? config.model : undefined,
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : undefined,
    language: isFactCheckLanguage(config.language)
      ? config.language
      : undefined,
  };
};

export const normalizeFactCheckConfigs = (
  configs: unknown,
  legacyConfig?: unknown,
): FactCheckConfig[] => {
  const normalized: FactCheckConfig[] = Array.isArray(configs)
    ? configs
        .map(normalizeRawConfig)
        .filter((cfg): cfg is FactCheckConfig => cfg !== null)
    : [];

  if (normalized.length > 0) {
    return normalized;
  }

  const legacy = normalizeRawConfig(legacyConfig);
  return legacy ? [legacy] : [];
};

export const hasFactCheckConfigs = (
  configs: unknown,
  legacyConfig?: unknown,
): boolean => normalizeFactCheckConfigs(configs, legacyConfig).length > 0;