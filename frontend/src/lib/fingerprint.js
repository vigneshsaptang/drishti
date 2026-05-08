export function buildFingerprint() {
  return {
    user_agent: navigator.userAgent,
    screen_width: screen.width,
    screen_height: screen.height,
    device_pixel_ratio: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    color_depth: screen.colorDepth,
    hardware_concurrency: navigator.hardwareConcurrency || 0,
  };
}

export async function fingerprintHash(fp) {
  const raw = [
    fp.screen_width, fp.screen_height, fp.device_pixel_ratio,
    fp.timezone, fp.platform, fp.color_depth, fp.hardware_concurrency,
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
