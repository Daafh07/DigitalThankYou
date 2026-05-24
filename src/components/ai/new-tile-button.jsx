'use client';

/**
 * NewTileButton — floating actieknop rechtsonder die de AI chat-overlay opent.
 */

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import AiChat from './ai-chat';

export default function NewTileButton() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setIsChatOpen(true)}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 24, delay: 0.3 }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.96 }}
        className={[
          'fixed bottom-6 right-6 z-30 flex items-center gap-2.5',
          'rounded-full px-5 py-3.5',
          'bg-blue-600 text-white shadow-lg shadow-blue-600/30',
          'ring-1 ring-blue-400/30 backdrop-blur-sm',
          'transition-shadow hover:shadow-xl hover:shadow-blue-600/40',
        ].join(' ')}
        aria-label="Nieuwe tegel"
      >
        <Plus size={18} strokeWidth={2.5} />
        <span className="text-sm font-semibold tracking-wide">Nieuwe tegel</span>
      </motion.button>

      <AiChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </>
  );
}
