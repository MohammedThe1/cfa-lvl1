const KEY = "madar-personal-font";
async function activate(data) {
  const font = await new FontFace("Thmanyah", `url(${data})`).load();
  document.fonts.add(font);
  document.documentElement.classList.add("personal-font");
}
export async function loadPersonalFont() {
  try {
    const value = localStorage.getItem(KEY);
    if (value) await activate(value);
  } catch {
    localStorage.removeItem(KEY);
  }
}
export function choosePersonalFont() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".woff2,.woff,.ttf,.otf";
    input.addEventListener("cancel", () => resolve());
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (!file) return resolve();
        if (file.size > 2000000)
          throw Error("Font exceeds 2 MB. Use a smaller licensed webfont.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const signature = String.fromCharCode(...bytes.slice(0, 4));
        if (
          !["wOF2", "wOFF", "OTTO"].includes(signature) &&
          !(
            bytes[0] === 0 &&
            bytes[1] === 1 &&
            bytes[2] === 0 &&
            bytes[3] === 0
          )
        )
          throw Error("Choose a valid WOFF2, WOFF, TTF or OTF font file.");
        const data = await new Promise((ok, fail) => {
          const reader = new FileReader();
          reader.onload = () => ok(reader.result);
          reader.onerror = fail;
          reader.readAsDataURL(file);
        });
        // Check font parsing before retaining it, and preserve study data if quota is exceeded.
        const font = await new FontFace("Thmanyah", `url(${data})`).load();
        localStorage.setItem(KEY, data);
        document.fonts.add(font);
        document.documentElement.classList.add("personal-font");
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}
