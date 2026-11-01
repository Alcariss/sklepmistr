import { isValidBarcode } from './products';

type Detected = { rawValue: string };
type Detector = { detect(source: HTMLVideoElement): Promise<Detected[]> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_INTERVAL_MS = 200;

/**
 * Chrome on Android and macOS reads barcodes natively. Safari on iPhone does
 * not, so there the ZXing WebAssembly reader is loaded, from this app's own
 * origin rather than a CDN, and only once someone actually scans.
 */
async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      const formats = FORMATS.filter((format) => supported.includes(format));
      if (formats.length > 0) {
        return new native({ formats });
      }
    } catch {
      // Fall through to the WebAssembly reader.
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url')
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
    }
  });
  return new BarcodeDetector({ formats: FORMATS as never[] });
}

function cameraMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Kamera není povolená. Povolte ji v nastavení prohlížeče, nebo opište číslo pod kódem.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Zařízení nemá kameru. Opište číslo pod čárovým kódem.';
  }
  return 'Kameru se nepodařilo spustit. Opište číslo pod čárovým kódem.';
}

/**
 * Opens the scanner in `dialog` and resolves with a valid barcode, read by
 * the camera or typed in, or with null when the user closes it.
 */
export function scanBarcode(dialog: HTMLDialogElement): Promise<string | null> {
  dialog.innerHTML = `
    <h2>Naskenovat čárový kód</h2>
    <div class="scanner">
      <video playsinline muted></video>
      <div class="scan-frame" aria-hidden="true"></div>
    </div>
    <p id="scan-status" class="muted" role="status">Spouštím kameru…</p>
    <form id="scan-manual" class="row">
      <input name="code" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="14"
        placeholder="nebo opište číslo pod kódem" aria-label="Číslo čárového kódu" />
      <button type="submit" class="secondary">Hledat</button>
    </form>
    <div class="dialog-actions"><span class="spacer"></span>
      <button type="button" class="secondary" data-scan-close>Zavřít</button></div>`;

  const video = dialog.querySelector('video') as HTMLVideoElement;
  const status = dialog.querySelector('#scan-status') as HTMLElement;
  const manual = dialog.querySelector('#scan-manual') as HTMLFormElement;
  let stream: MediaStream | null = null;
  let timer = 0;
  let finished = false;

  return new Promise((resolve) => {
    const finish = (code: string | null): void => {
      if (finished) {
        return;
      }
      finished = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      dialog.removeEventListener('close', onClose);
      if (!dialog.open) {
        resolve(code);
        return;
      }
      // `close` fires asynchronously. Resolve only after it has, so a caller
      // that reuses this dialog is not hit by the scanner's own close event.
      dialog.addEventListener('close', () => resolve(code), { once: true });
      dialog.close();
    };
    const onClose = (): void => finish(null);
    dialog.addEventListener('close', onClose);
    dialog.querySelector('[data-scan-close]')?.addEventListener('click', () => finish(null));

    manual.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = (manual.elements.namedItem('code') as HTMLInputElement).value.replace(/\s/g, '');
      if (isValidBarcode(code)) {
        finish(code);
      } else {
        status.textContent = 'Tohle číslo není platný čárový kód. Zkontrolujte ho.';
      }
    });

    dialog.showModal();

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('no camera API'), { name: 'NotFoundError' });
        }
        const [detector, media] = await Promise.all([
          createDetector(),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
            audio: false
          })
        ]);
        stream = media;
        if (finished) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = media;
        await video.play();
        status.textContent = 'Namiřte kameru na čárový kód.';

        const tick = async (): Promise<void> => {
          if (finished) {
            return;
          }
          if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            try {
              const code = (await detector.detect(video)).map((found) => found.rawValue).find(isValidBarcode);
              if (code) {
                navigator.vibrate?.(60);
                finish(code);
                return;
              }
            } catch (error) {
              console.warn('Sklepmistr: barcode detection failed', error);
            }
          }
          timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (error) {
        console.warn('Sklepmistr: camera unavailable', error);
        status.textContent = cameraMessage(error);
        (manual.elements.namedItem('code') as HTMLInputElement).focus();
      }
    })();
  });
}
