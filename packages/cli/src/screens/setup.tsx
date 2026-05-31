import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { saveConfig, type Config } from "../lib/config";
import { useTheme } from "../providers/theme";
import type { TextareaRenderable } from "@opentui/core";
import { TEXTAREA_KEY_BINDINGS } from "../components/input-bar";

type Step = "anthropic" | "openai" | "saving";

const STEP_PROMPTS: Record<Exclude<Step, "saving">, { label: string; hint: string }> = {
  anthropic: {
    label: "Anthropic API key",
    hint: "Used for Claude models. Press Enter to skip.",
  },
  openai: {
    label: "OpenAI API key",
    hint: "Used for GPT models. Press Enter to skip.",
  },
};

const STEPS: Exclude<Step, "saving">[] = ["anthropic", "openai"];

export function Setup() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState<Step>("anthropic");
  const [config, setConfig] = useState<Config>({});
  const textareaRef = useRef<TextareaRenderable>(null);

  const advance = useCallback(
    async (value: string) => {
      const trimmed = value.trim();

      if (currentStep === "anthropic") {
        const next: Config = trimmed ? { ...config, anthropicApiKey: trimmed } : config;
        setConfig(next);
        setCurrentStep("openai");
        textareaRef.current?.setText("");
        return;
      }

      if (currentStep === "openai") {
        const final: Config = trimmed ? { ...config, openaiApiKey: trimmed } : config;
        setCurrentStep("saving");
        await saveConfig(final);
        // Apply immediately so models are usable right away
        if (final.anthropicApiKey) process.env.ANTHROPIC_API_KEY = final.anthropicApiKey;
        if (final.openaiApiKey) process.env.OPENAI_API_KEY = final.openaiApiKey;
        navigate("/", { replace: true });
      }
    },
    [currentStep, config, navigate],
  );

  // Wire up submit handler
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => {
      void advance(textarea.plainText);
    };
  }, [advance]);

  useKeyboard((key) => {
    if (key.name === "escape" && currentStep !== "saving") {
      key.preventDefault();
      const textarea = textareaRef.current;
      if (textarea && textarea.plainText.length > 0) {
        textarea.setText("");
      }
    }
  });

  if (currentStep === "saving") {
    return (
      <box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
        gap={1}
      >
        <text>Saving configuration…</text>
      </box>
    );
  }

  const prompt = STEP_PROMPTS[currentStep];
  const stepIndex = STEPS.indexOf(currentStep) + 1;

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
      gap={2}
    >
      <box flexDirection="column" gap={1} width="100%" maxWidth={72} paddingX={2}>
        <box flexDirection="column" gap={1}>
          <text attributes={TextAttributes.BOLD}>litecode setup</text>
          <text attributes={TextAttributes.DIM}>
            API keys are stored in ~/.litecode/config.json on your machine.
          </text>
        </box>

        <box flexDirection="column" gap={1} paddingTop={1}>
          <box flexDirection="row" gap={1}>
            <text attributes={TextAttributes.DIM}>
              {stepIndex}/{STEPS.length}
            </text>
            <text>{prompt.label}</text>
          </box>
          <text attributes={TextAttributes.DIM}>{prompt.hint}</text>

          <box
            border={["left"]}
            borderColor={colors.primary}
            width="100%"
            paddingX={2}
            paddingY={1}
            backgroundColor={colors.surface}
          >
            <textarea
              ref={textareaRef}
              focused
              keyBindings={TEXTAREA_KEY_BINDINGS}
              placeholder="sk-…"
            />
          </box>
        </box>

        <box paddingTop={1}>
          <text attributes={TextAttributes.DIM}>
            Press Enter to continue · Esc to clear
          </text>
        </box>
      </box>
    </box>
  );
}
