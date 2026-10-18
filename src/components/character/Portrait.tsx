// The character's picture: pick a photo (or drop one on it), and it's cropped
// to a square and shrunk, then kept in the character's file (so Export and
// backups take it along).

import { useRef, useState } from "react";

const SIZE = 400;

/** Read an image file and make a square JPEG data URL of it, cropped from the middle. */
export async function squareImage(file: Blob, size = SIZE): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That file isn't a picture Lorewright can read."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    // Faces are usually in the top part of a tall portrait: crop a little above the middle.
    const sx = (img.naturalWidth - side) / 2;
    const sy = img.naturalHeight > img.naturalWidth ? (img.naturalHeight - side) * 0.25 : (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(size, side);
    const g = canvas.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Portrait({ src, name, onChange }: { src?: string; name: string; onChange: (src: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const take = async (file?: File | null) => {
    if (!file) return;
    setError("");
    try {
      onChange(await squareImage(file));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <div
      className={`portrait ${over ? "over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files[0]);
      }}
      title={error || (src ? "Click to change the picture (or drop one here)" : "Add a picture of your character: click, or drop an image here")}
    >
      <button className="portrait-face" onClick={() => input.current?.click()} aria-label={src ? "Change picture" : "Add a picture"}>
        {src ? <img src={src} alt={name} /> : <span className="portrait-empty">{initials}<small>+ photo</small></span>}
      </button>
      {src && (
        <button className="portrait-remove ghost small" onClick={() => onChange(undefined)} aria-label="Remove picture" title="Remove picture">
          ✕
        </button>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
      {error && <span className="portrait-error small error">{error}</span>}
    </div>
  );
}

/** A small round picture for lists and the combat tracker. */
export function Avatar({ src, name, size = 24 }: { src?: string; name: string; size?: number }) {
  if (!src) return null;
  return <img className="avatar" src={src} alt="" title={name} style={{ width: size, height: size }} />;
}
