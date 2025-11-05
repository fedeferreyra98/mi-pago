declare module 'qrcode' {
  interface QRCodeToDataURLOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    type?: string;
    quality?: number;
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toFile(path: string, text: string, options?: QRCodeToDataURLOptions): Promise<void>;
  export function toString(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
