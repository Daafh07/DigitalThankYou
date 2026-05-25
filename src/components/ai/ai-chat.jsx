'use client';

/**
 * AiChat — overlay chat-interface voor het genereren van tegels via natuurlijke taal.
 * Ondersteunt logo-upload: conversie naar Delft-blauw en plaatsing op emptytile.svg.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import TilePreview3D from '@/components/generated/tile-preview-3d';
import { generateTileFromPrompt } from '@/lib/ai/lm-studio';
import {
  composeTileFrontDataUrl,
  preloadEmptyTileTexture,
} from '@/lib/tile-front-composite';
import {
  convertLogoToBlueStyle,
  readImageFile,
} from '@/lib/tile-logo';
import { useGeneratedTilesStore } from '@/store/generated-tiles-store';

/**
 * @typedef {{ id: string; role: 'user' | 'assistant'; content: string; status?: 'error' }} ChatEntry
 */

/**
 * @param {{ isOpen: boolean; onClose: () => void }} props
 */
export default function AiChat({ isOpen, onClose }) {
  const addTile = useGeneratedTilesStore((s) => s.addTile);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [previewText, setPreviewText] = useState(/** @type {string | null} */ (null));
  const [logoBlueDataUrl, setLogoBlueDataUrl] = useState(
    /** @type {string | null} */ (null),
  );
  const [logoFileName, setLogoFileName] = useState(/** @type {string | null} */ (null));
  const [messages, setMessages] = useState(
    /** @type {ChatEntry[]} */ ([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Beschrijf de tegel die je wilt maken, of upload een logo. Het logo wordt automatisch in Delft-blauw gezet en op de tegel geplaatst.',
      },
    ]),
  );

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const resetLogoState = useCallback(() => {
    setLogoBlueDataUrl(null);
    setLogoFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  useEffect(() => {
    if (isOpen) {
      preloadEmptyTileTexture();
      const timer = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(timer);
    }
    setPreviewText(null);
    resetLogoState();
    return undefined;
  }, [isOpen, resetLogoState]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isLoading]);

  const handleLogoSelect = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingLogo(true);

    try {
      const image = await readImageFile(file);
      const blueDataUrl = convertLogoToBlueStyle(image);
      setLogoBlueDataUrl(blueDataUrl);
      setLogoFileName(file.name);
      setPreviewText(input.trim() || 'Jouw logo');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Logo kon niet worden verwerkt.';

      setMessages((prev) => [
        ...prev,
        {
          id: `error-logo-${Date.now()}`,
          role: 'assistant',
          content: message,
          status: 'error',
        },
      ]);
      resetLogoState();
    } finally {
      setIsProcessingLogo(false);
    }
  }, [input, resetLogoState]);

  const handleRemoveLogo = useCallback(() => {
    resetLogoState();
    if (!input.trim()) setPreviewText(null);
  }, [input, resetLogoState]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const prompt = input.trim();
      const hasLogo = Boolean(logoBlueDataUrl);

      if ((!prompt && !hasLogo) || isLoading || isProcessingLogo) return;

      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: hasLogo
          ? prompt
            ? `${prompt} (met logo: ${logoFileName ?? 'geüpload'})`
            : `Logo geüpload: ${logoFileName ?? 'partnerlogo'}`
          : prompt,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setPreviewText(prompt || 'Jouw logo');
      setIsLoading(true);

      try {
        const tileTexture = hasLogo
          ? await composeTileFrontDataUrl(logoBlueDataUrl)
          : undefined;

        const tilePayload = await generateTileFromPrompt(prompt, {
          logoBlue: logoBlueDataUrl ?? undefined,
          tileTexture,
        });

        addTile(tilePayload);

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: hasLogo
              ? `Tegel "${tilePayload.title}" is aangemaakt met je logo in Delft-blauw.`
              : `Tegel "${tilePayload.title}" is aangemaakt en toegevoegd aan je workspace.`,
          },
        ]);

        resetLogoState();
        setPreviewText(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Er ging iets mis bij het genereren.';

        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: message,
            status: 'error',
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      addTile,
      input,
      isLoading,
      isProcessingLogo,
      logoBlueDataUrl,
      logoFileName,
      resetLogoState,
    ],
  );

  const showPreview = Boolean(previewText || logoBlueDataUrl);
  const canSubmit =
    (input.trim() || logoBlueDataUrl) && !isLoading && !isProcessingLogo;

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
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={[
              'fixed bottom-24 right-6 z-50 flex w-[min(440px,calc(100vw-2rem))] flex-col',
              'overflow-hidden rounded-2xl border border-white/15',
              'bg-slate-900/85 shadow-2xl backdrop-blur-2xl',
            ].join(' ')}
            style={{ maxHeight: 'min(680px, calc(100vh - 6rem))' }}
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
                  <p className="text-sm font-semibold text-white">Nieuwe tegel</p>
                  <p className="text-xs text-white/50">
                    Logo uploaden of beschrijven
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
                  {logoBlueDataUrl ? 'Voorbeeld tegel (emptytile + logo)' : 'Voorbeeld tegel'}
                </p>
                <TilePreview3D
                  frontText={previewText ?? ''}
                  logoBlueDataUrl={logoBlueDataUrl}
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
                    'max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'ml-auto bg-blue-600/80 text-white'
                      : msg.status === 'error'
                        ? 'bg-rose-500/15 text-rose-200'
                        : 'bg-white/8 text-white/85',
                  ].join(' ')}
                >
                  {msg.content}
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
                    ? 'Logo omzetten naar Delft-blauw…'
                    : 'Tegel genereren…'}
                </motion.div>
              )}
            </div>

            {logoFileName && (
              <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-xs text-white/55">
                  Logo: {logoFileName}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="shrink-0 text-xs text-white/45 transition hover:text-white"
                >
                  Verwijderen
                </button>
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
                  disabled={isLoading || isProcessingLogo}
                  aria-label="Logo uploaden"
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    'text-white/55 transition hover:bg-white/10 hover:text-white',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    logoBlueDataUrl ? 'text-blue-300' : '',
                  ].join(' ')}
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
                  placeholder={
                    logoBlueDataUrl
                      ? 'Optioneel: titel of beschrijving…'
                      : 'Bijv. partnernaam of lichte tegel over sponsors…'
                  }
                  disabled={isLoading || isProcessingLogo}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                />

                <motion.button
                  type="submit"
                  disabled={!canSubmit}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    'bg-blue-600 text-white transition',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  ].join(' ')}
                  aria-label="Versturen"
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
