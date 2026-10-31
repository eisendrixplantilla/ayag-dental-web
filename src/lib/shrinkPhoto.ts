/**
 * A photo from the camera or the gallery, made small enough to keep with the record: at most
 * 1600px on its longest side as a JPEG, stepping the size and quality down until it's under
 * ~450 KB. A phone photo of several MB comes out around 150 KB. The browser turns it upright
 * from the camera's orientation as it draws it.
 */
const STEPS = [
  { side: 1600, quality: 0.82 },
  { side: 1280, quality: 0.75 },
  { side: 1024, quality: 0.7 },
  { side: 800, quality: 0.65 },
];
const MAX_LENGTH = 600_000;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a photo this browser can open.")); };
    img.src = url;
  });
}

export async function shrinkPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPEG or PNG).");
  const img = await load(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the photo.");
  let out = "";
  for (const { side, quality } of STEPS) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    // White under a transparent PNG, which JPEG would otherwise turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= MAX_LENGTH) return out;
  }
  return out;
}
