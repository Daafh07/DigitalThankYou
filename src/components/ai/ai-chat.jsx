"use client";

/**
 * AiChat — overlay chat-interface voor het genereren van tegels.
 * Flow: logo upload → jaartal → optionele beschrijving → genereren.
 */

import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Loader2, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import TilePreview3D from "@/components/generated/tile-preview-3d";
import { generateTileFromPrompt } from "@/lib/ai/lm-studio";
import {
  composeTileFrontDataUrl,
  preloadEmptyTileTexture,
} from "@/lib/tile-front-composite";
import { convertLogoToBlueStyle, readImageFile } from "@/lib/tile-logo";
import { TILE_YEAR_OPTIONS, isTileYear } from "@/lib/tile-year";
import { useGeneratedTilesStore } from "@/store/generated-tiles-store";

/**
 * @typedef {'awaiting_logo' | 'awaiting_year' | 'awaiting_confirm' | 'generating'} TileFlowStep
 */

/**
 * @typedef {{ id: string; role: 'user' | 'assistant'; content: string; status?: 'error'; yearPicker?: boolean }} ChatEntry
 */

/**
 * @typedef {Object} TileDraft
 * @property {string} prompt
 * @property {string} logoBlue
 * @property {string} logoFileName
 * @property {string} tileTexture
 * @property {import('@/lib/tile-year').TileYear | undefined} year
 */

/**
 * @param {{ isOpen: boolean; onClose: () => void }} props
 */
export default function AiChat({ isOpen, onClose }) {
  const addTile = useGeneratedTilesStore((s) => s.addTile);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [flowStep, setFlowStep] = useState(
    /** @type {TileFlowStep} */ ("awaiting_logo"),
  );
  const [draft, setDraft] = useState(/** @type {TileDraft | null} */ (null));
  const [previewText, setPreviewText] = useState(
    /** @type {string | null} */ (null),
  );
  const [logoBlueDataUrl, setLogoBlueDataUrl] = useState(
    /** @type {string | null} */ (null),
  );
  const [logoFileName, setLogoFileName] = useState(
    /** @type {string | null} */ (null),
  );
  const [previewTileTexture, setPreviewTileTexture] = useState(
    /** @type {string | null} */ (null),
  );
  const [previewYear, setPreviewYear] = useState(
    /** @type {string | null} */ (null),
  );
  const [messages, setMessages] = useState(
    /** @type {ChatEntry[]} */ ([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Upload eerst je partnerlogo met de knop links onderin. Daarna kies je een jaartal; pas als alle stappen klaar zijn, genereren we je tegel.",
      },
    ]),
  );

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const resetSession = useCallback(() => {
    setFlowStep("awaiting_logo");
    setDraft(null);
    setPreviewText(null);
    setPreviewTileTexture(null);
    setPreviewYear(null);
    setLogoBlueDataUrl(null);
    setLogoFileName(null);
    setInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (isOpen) {
      preloadEmptyTileTexture();
      const timer = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(timer);
    }
    resetSession();
    return undefined;
  }, [isOpen, resetSession]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading, isProcessingLogo]);

  const askForYear = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-year-${Date.now()}`,
        role: "assistant",
        content:
          "Je logo staat in Delft-blauw op de tegel. Welk jaartal hoort erbij? Kies 2024, 2025 of 2026 — het jaartal komt op de achterkant van de tegel, onder de tekst.",
        yearPicker: true,
      },
    ]);
    setFlowStep("awaiting_year");
  }, []);

  const handleLogoSelect = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file || isLoading || isProcessingLogo) return;

      setIsProcessingLogo(true);

      try {
        const image = await readImageFile(file);
        const blueDataUrl = convertLogoToBlueStyle(image);
        const tileTexture = await composeTileFrontDataUrl(blueDataUrl);

        setLogoBlueDataUrl(blueDataUrl);
        setLogoFileName(file.name);
        setPreviewTileTexture(tileTexture);
        setPreviewText(input.trim() || "Jouw logo");
        setPreviewYear(null);

        setDraft({
          prompt: input.trim(),
          logoBlue: blueDataUrl,
          logoFileName: file.name,
          tileTexture,
          year: undefined,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `user-logo-${Date.now()}`,
            role: "user",
            content: `Logo geüpload: ${file.name}`,
          },
        ]);

        askForYear();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Logo kon niet worden verwerkt.";

        setMessages((prev) => [
          ...prev,
          {
            id: `error-logo-${Date.now()}`,
            role: "assistant",
            content: message,
            status: "error",
          },
        ]);
        setLogoBlueDataUrl(null);
        setLogoFileName(null);
        setPreviewTileTexture(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } finally {
        setIsProcessingLogo(false);
      }
    },
    [askForYear, input, isLoading, isProcessingLogo],
  );

  const handleRemoveLogo = useCallback(() => {
    resetSession();
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Upload eerst je partnerlogo met de knop links onderin. Daarna kies je een jaartal; pas als alle stappen klaar zijn, genereren we je tegel.",
      },
    ]);
  }, [resetSession]);

  const finalizeTile = useCallback(
    async (tileDraft) => {
      if (!tileDraft?.year || !isTileYear(tileDraft.year)) return;

      setFlowStep("generating");
      setIsLoading(true);

      try {
        const tilePayload = await generateTileFromPrompt(tileDraft.prompt, {
          logoBlue: tileDraft.logoBlue,
          tileTexture: tileDraft.tileTexture,
          logoFileName: tileDraft.logoFileName,
          year: tileDraft.year,
        });

        addTile(tilePayload);

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-done-${Date.now()}`,
            role: "assistant",
            content: `Tegel "${tilePayload.title}" (${tileDraft.year}) staat op je workspace. Draai de tegel om het jaartal op de achterkant te zien.`,
          },
        ]);

        resetSession();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Er ging iets mis bij het genereren.";

        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: message,
            status: "error",
          },
        ]);
        setFlowStep("awaiting_confirm");
      } finally {
        setIsLoading(false);
      }
    },
    [addTile, resetSession],
  );

  const handleYearSelect = useCallback(
    (year) => {
      if (flowStep !== "awaiting_year" || !draft || isLoading) return;
      if (!isTileYear(year)) return;

      setPreviewYear(year);
      setDraft((prev) => (prev ? { ...prev, year } : prev));

      setMessages((prev) => [
        ...prev,
        {
          id: `user-year-${Date.now()}`,
          role: "user",
          content: year,
        },
        {
          id: `assistant-confirm-${Date.now()}`,
          role: "assistant",
          content:
            "Wil je nog een titel of korte beschrijving toevoegen? Typ die hieronder en klik op Versturen om je tegel te genereren. Je kunt ook meteen versturen zonder extra tekst.",
        },
      ]);

      setFlowStep("awaiting_confirm");
      setTimeout(() => inputRef.current?.focus(), 80);
    },
    [draft, flowStep, isLoading],
  );

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (flowStep !== "awaiting_confirm" || !draft?.year || isLoading) return;

      const prompt = input.trim();

      if (prompt) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-prompt-${Date.now()}`,
            role: "user",
            content: prompt,
          },
        ]);
      }

      setPreviewText(prompt || "Jouw logo");

      const tileDraft = { ...draft, prompt };
      setDraft(tileDraft);
      setInput("");

      await finalizeTile(tileDraft);
    },
    [draft, finalizeTile, flowStep, input, isLoading],
  );

  const showPreview = Boolean(logoBlueDataUrl || previewTileTexture);
  const canSubmit =
    flowStep === "awaiting_confirm" && !isLoading && !isProcessingLogo;
  const canUploadLogo =
    flowStep === "awaiting_logo" && !isLoading && !isProcessingLogo;
  const inputDisabled =
    flowStep !== "awaiting_confirm" || isLoading || isProcessingLogo;

  const inputPlaceholder =
    flowStep === "awaiting_logo"
      ? "Upload eerst je logo…"
      : flowStep === "awaiting_year"
        ? "Kies eerst een jaartal…"
        : "Optioneel: titel of beschrijving…";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="AI tegel generator"
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={[
              "fixed bottom-24 right-6 z-50 flex w-[min(440px,calc(100vw-2rem))] flex-col",
              "overflow-hidden rounded-2xl border border-white/15",
              "bg-slate-900/85 shadow-2xl backdrop-blur-2xl",
            ].join(" ")}
            style={{ maxHeight: "min(680px, calc(100vh - 6rem))" }}
          >
            <motion.div
              className="flex items-center justify-between border-b border-white/10 px-5 py-4"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <motion.div
                className="flex items-center gap-2.5"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Nieuwe tegel
                  </p>
                  <p className="text-xs text-white/50">
                    Logo → jaartal → genereren
                  </p>
                </div>
              </motion.div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chat sluiten"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </motion.div>

            {showPreview && (
              <div className="shrink-0 space-y-2 border-b border-white/10 px-4 py-4">
                <p className="text-xs font-medium text-white/50">
                  Voorbeeld tegel (emptytile + logo)
                </p>
                <TilePreview3D
                  frontText={previewText ?? ""}
                  tileFrontDataUrl={previewTileTexture}
                  backYear={previewYear}
                  isGenerating={isLoading || isProcessingLogo}
                />
              </div>
            )}

            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.map((msg, i) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={[
                    "max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "ml-auto bg-blue-600/80 text-white"
                      : msg.status === "error"
                        ? "bg-rose-500/15 text-rose-200"
                        : "bg-white/8 text-white/85",
                  ].join(" ")}
                >
                  <p>{msg.content}</p>
                  {msg.yearPicker && flowStep === "awaiting_year" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TILE_YEAR_OPTIONS.map((year) => (
                        <button
                          key={year}
                          type="button"
                          disabled={isLoading || isProcessingLogo}
                          onClick={() => handleYearSelect(year)}
                          className={[
                            "rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition",
                            "border-blue-400/40 bg-blue-500/20 text-blue-100",
                            "hover:bg-blue-500/35 hover:text-white",
                            "disabled:cursor-not-allowed disabled:opacity-45",
                          ].join(" ")}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}

              {(isLoading || isProcessingLogo) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-sm text-white/50"
                >
                  <Loader2 size={16} className="animate-spin" />
                  {isProcessingLogo
                    ? "Logo omzetten naar Delft-blauw…"
                    : "Tegel genereren…"}
                </motion.div>
              )}
            </div>

            {logoFileName && flowStep !== "awaiting_logo" && (
              <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-xs text-white/55">
                  Logo: {logoFileName}
                  {draft?.year ? ` · Jaar: ${draft.year}` : ""}
                </span>
                {flowStep !== "generating" && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="shrink-0 text-xs text-white/45 transition hover:text-white"
                  >
                    Opnieuw beginnen
                  </button>
                )}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="border-t border-white/10 p-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                aria-hidden
                onChange={handleLogoSelect}
              />

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5 pl-3 focus-within:border-blue-400/40">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canUploadLogo}
                  aria-label="Logo uploaden"
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    "text-white/55 transition hover:bg-white/10 hover:text-white",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    logoBlueDataUrl ? "text-blue-300" : "",
                  ].join(" ")}
                >
                  {isProcessingLogo ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ImagePlus size={18} />
                  )}
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={inputPlaceholder}
                  disabled={inputDisabled}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none disabled:opacity-50"
                />

                <motion.button
                  type="submit"
                  disabled={!canSubmit}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    "bg-blue-600 text-white transition",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  ].join(" ")}
                  aria-label="Tegel genereren"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
