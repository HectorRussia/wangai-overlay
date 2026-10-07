const repository = "HectorRussia/wangai-overlay";

// Cache release metadata briefly, but never pin a visitor to an old redirect.
export async function GET() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "WANGAI-download",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Release lookup unavailable");
    const release = await response.json();
    if (!release || release.draft !== false || release.prerelease !== false ||
        typeof release.tag_name !== "string" || !Array.isArray(release.assets)) {
      throw new Error("No published stable release");
    }
    const version = /^v?(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1];
    if (!version) throw new Error("Unsupported release version");
    for (const kind of ["portable", "setup"]) {
      const name = `WANGAI_${version}_x64-${kind}.exe`;
      const url = `https://github.com/${repository}/releases/download/${release.tag_name}/${name}`;
      const asset = release.assets.find((item: { name?: string; browser_download_url?: string } | null) =>
        item?.name === name && item.browser_download_url === url);
      if (asset) {
        return new Response(null, {
          status: 302,
          headers: { Location: url, "Cache-Control": "no-store" },
        });
      }
    }
  } catch {
    // Do not redirect to a beta, an updater payload, or an unrelated file.
  }
  return new Response("ดาวน์โหลดไม่พร้อมใช้งานชั่วคราว กรุณารีเฟรชหน้านี้เพื่อลองใหม่ในอีกสักครู่", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
    },
  });
}
