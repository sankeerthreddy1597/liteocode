import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_CHAT_MODEL_ID,
  SUPPORTED_CHAT_MODELS,
  isOllamaModelId,
  type AnyChatModelId,
  Mode,
  type ModeType,
} from "@litecode/shared";

const FALLBACK_MODEL_ID: AnyChatModelId = "claude-sonnet-4-6";
const CLOUD_MODEL_IDS = SUPPORTED_CHAT_MODELS.map((m) => m.id as AnyChatModelId);

const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1"
).replace(/\/v1\/?$/, "");

type PromptConfigContextValue = {
  mode: ModeType;
  toggleMode: () => void;
  setMode: (mode: ModeType) => void;
  model: AnyChatModelId;
  setModel: (model: AnyChatModelId) => void;
  availableModels: AnyChatModelId[];
};

const PromptConfigContext = createContext<PromptConfigContextValue | null>(null);

export function usePromptConfig(): PromptConfigContextValue {
  const value = useContext(PromptConfigContext);
  if (!value) {
    throw new Error("usePromptConfig must be used within a PromptConfigProvider");
  }
  return value;
}

type PromptConfigProviderProps = {
  children: ReactNode;
};

export function PromptConfigProvider({ children }: PromptConfigProviderProps) {
  const [mode, setMode] = useState<ModeType>(Mode.BUILD);
  const [model, setModel] = useState<AnyChatModelId>(DEFAULT_CHAT_MODEL_ID);
  const [ollamaModels, setOllamaModels] = useState<AnyChatModelId[]>([]);

  useEffect(() => {
    fetch(`${OLLAMA_BASE_URL}/api/tags`)
      .then((res) => res.json())
      .then((data: unknown) => {
        const models = (data as { models?: { name: string }[] }).models ?? [];
        const fetched = models.map((m) => `ollama:${m.name}` as AnyChatModelId);
        setOllamaModels(fetched);

        if (isOllamaModelId(DEFAULT_CHAT_MODEL_ID) && !fetched.includes(DEFAULT_CHAT_MODEL_ID)) {
          setModel(FALLBACK_MODEL_ID);
        }
      })
      .catch(() => {
        if (isOllamaModelId(DEFAULT_CHAT_MODEL_ID)) {
          setModel(FALLBACK_MODEL_ID);
        }
      });
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  const availableModels: AnyChatModelId[] = [...CLOUD_MODEL_IDS, ...ollamaModels];

  return (
    <PromptConfigContext.Provider
      value={{ mode, toggleMode, setMode, model, setModel, availableModels }}
    >
      {children}
    </PromptConfigContext.Provider>
  );
}
