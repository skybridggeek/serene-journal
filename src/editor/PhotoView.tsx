import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useState } from "react";
import { api } from "../api";

/// Node view for inline photos. The document stores only the local filename;
/// the (possibly decrypted) data URL is resolved on display.
export function PhotoView({
  node,
}: {
  node: { attrs: { src?: string } };
}) {
  const src = node.attrs.src ?? "";
  const isUrl = /^(data:|https?:|asset:)/.test(src);
  const [url, setUrl] = useState<string | null>(isUrl ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isUrl || !src) return;
    let cancelled = false;
    api
      .photoData(src)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, isUrl]);

  return (
    <NodeViewWrapper className="photo-node">
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          title="Click to view full size"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("serene-photo-zoom", { detail: url })
            );
          }}
        />
      ) : failed ? (
        <div className="photo-node-error">Photo file not found</div>
      ) : (
        <div className="photo-node-loading">Loading photo…</div>
      )}
    </NodeViewWrapper>
  );
}
