import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

function uid() {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDoc(doc) {
  if (doc?.blocks?.length) return doc;
  return {
    blocks: [
      { id: uid(), type: "heading", text: "" },
      { id: uid(), type: "paragraph", text: "" },
    ],
  };
}

/**
 * Lightweight Notion-style block canvas.
 */
export default function ChannelCanvas({
  channelId,
  doc,
  canEdit,
  onSave,
}) {
  const [blocks, setBlocks] = useState(() => normalizeDoc(doc).blocks);
  const saveTimer = useRef(null);
  const focused = useRef(null);

  useEffect(() => {
    setBlocks(normalizeDoc(doc).blocks);
  }, [channelId, doc]);

  const persist = useCallback(
    (nextBlocks) => {
      if (!canEdit || !onSave) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSave({ blocks: nextBlocks });
      }, 500);
    },
    [canEdit, onSave]
  );

  const updateBlock = (id, patch) => {
    setBlocks((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
      persist(next);
      return next;
    });
  };

  const addBlock = (afterId, type = "paragraph") => {
    const block = { id: uid(), type, text: "" };
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === afterId);
      const next = [...prev];
      next.splice(idx + 1, 0, block);
      persist(next);
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById(`canvas-block-${block.id}`)?.focus();
    });
  };

  const removeBlock = (id) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((b) => b.id !== id);
      persist(next);
      return next;
    });
  };

  const onKeyDown = (e, block, index) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addBlock(block.id, "paragraph");
    }
    if (e.key === "Backspace" && !block.text && blocks.length > 1) {
      e.preventDefault();
      removeBlock(block.id);
      const prev = blocks[index - 1];
      if (prev) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`canvas-block-${prev.id}`);
          if (el) {
            el.focus();
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }
        });
      }
    }
    if (e.key === "/" && !block.text) {
      // quick type switch hints via placeholder only
    }
  };

  return (
    <div className="channel-canvas" data-lenis-prevent>
      <div className="channel-canvas-inner">
        {blocks.map((block, index) => (
          <div key={block.id} className={`canvas-block canvas-${block.type}`}>
            <textarea
              id={`canvas-block-${block.id}`}
              className="canvas-input"
              rows={1}
              value={block.text}
              readOnly={!canEdit}
              placeholder={
                block.type === "heading"
                  ? "Heading"
                  : block.type === "bullet"
                    ? "List item"
                    : "Type '/' for blocks, or start writing…"
              }
              onChange={(e) => {
                updateBlock(block.id, { text: e.target.value });
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onFocus={() => {
                focused.current = block.id;
              }}
              onKeyDown={(e) => onKeyDown(e, block, index)}
              onInput={(e) => {
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
              }}
            />
            {canEdit && (
              <div className="canvas-block-tools">
                <button
                  type="button"
                  className={block.type === "heading" ? "active" : ""}
                  onClick={() => updateBlock(block.id, { type: "heading" })}
                  title="Heading"
                >
                  H
                </button>
                <button
                  type="button"
                  className={block.type === "paragraph" ? "active" : ""}
                  onClick={() => updateBlock(block.id, { type: "paragraph" })}
                  title="Text"
                >
                  T
                </button>
                <button
                  type="button"
                  className={block.type === "bullet" ? "active" : ""}
                  onClick={() => updateBlock(block.id, { type: "bullet" })}
                  title="Bullet"
                >
                  •
                </button>
              </div>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            className="canvas-add"
            onClick={() => addBlock(blocks[blocks.length - 1]?.id, "paragraph")}
          >
            <Plus size={14} /> Add block
          </button>
        )}
      </div>
    </div>
  );
}
