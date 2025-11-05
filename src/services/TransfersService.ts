import { Comprobante, ComprobanteDetail, Transfer, TransferStatus } from '@/types/index.js';
import TransfersRepository from '@/repositories/TransfersRepository.js';
import BankingAPI from '@/services/BankingAPI.js';
import { ValidationError, NotFoundError } from '@/errors/AppError.js';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export class TransfersService {
  private transfersRepository = TransfersRepository;
  private bankingAPI = BankingAPI;

  /**
   * Get transfer detail with validation
   */
  async getTransferDetail(transferId: string, usuarioId: string): Promise<Transfer> {
    const transfer = await this.transfersRepository.getTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found');
    }

    // Verify user has access to this transfer
    if (transfer.usuario_id_origen !== usuarioId && transfer.usuario_id_destino !== usuarioId) {
      throw new ValidationError('User does not have access to this transfer');
    }

    return transfer;
  }

  /**
   * Generate a comprobante (receipt) for a transfer
   */
  async generateComprobante(transfer: Transfer): Promise<Comprobante> {
    const numeroComprobante = this.generateComprobanteNumber();
    const fecha_hora = new Date();

    const comprobanteData = {
      id_transferencia: transfer.id_transferencia,
      numero_comprobante: numeroComprobante,
      fecha_hora,
      monto: transfer.monto,
      destinatario_alias: transfer.comprobante_json?.destinatario_alias as string | undefined,
      destinatario_cbu: transfer.cbu_destino,
      estado: transfer.estado,
      estado_descarga: 'generado' as const,
      pdf_url: undefined,
      fecha_expiracion: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    return this.transfersRepository.createComprobante(transfer.id_transferencia, comprobanteData);
  }

  /**
   * Generate a sequential receipt number (COMP-YYYYMMDD-XXXXX)
   */
  generateComprobanteNumber(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const randomStr = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');
    return `COMP-${dateStr}-${randomStr}`;
  }

  /**
   * Create a PDF receipt with transfer details and QR code
   */
  async createPdfReceipt(comprobanteDetail: ComprobanteDetail): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('Mi Pago', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('Transfer Receipt', { align: 'center' }).moveDown();

        // Receipt Number and Date
        doc.fontSize(10).text(`Receipt #: ${comprobanteDetail.numero_comprobante}`);
        doc.text(`Date/Time: ${comprobanteDetail.fecha_hora.toLocaleString('es-AR')}`);
        doc.moveDown();

        // Separator line
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown();

        // Transfer Details Section
        doc.fontSize(12).font('Helvetica-Bold').text('Transfer Details', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`From: ${comprobanteDetail.remitente_alias || 'N/A'}`);
        if (comprobanteDetail.destinatario_alias) {
          doc.text(`To: ${comprobanteDetail.destinatario_alias}`);
        }
        if (comprobanteDetail.destinatario_cbu) {
          doc.text(`CBU: ${this.maskCBU(comprobanteDetail.destinatario_cbu)}`);
        }
        doc.moveDown();

        // Amount Section
        doc.fontSize(14).font('Helvetica-Bold').text(`Amount: $${comprobanteDetail.monto.toFixed(2)}`, {
          align: 'center',
        });
        doc.moveDown();

        // Additional Details
        if (comprobanteDetail.referencia) {
          doc.fontSize(10).text(`Reference: ${comprobanteDetail.referencia}`);
        }
        doc.text(`Status: ${comprobanteDetail.estado.toUpperCase()}`);
        doc.moveDown();

        // QR Code
        try {
          const qrDataUrl = await QRCode.toDataURL(comprobanteDetail.numero_comprobante);
          const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
          doc.image(qrBuffer, { width: 150, height: 150, align: 'center' });
        } catch (qrError) {
          doc.fontSize(10).text('QR Code generation failed', { align: 'center' });
        }

        doc.moveDown();

        // Footer
        doc.fontSize(8).text('This receipt is valid for 24 hours.', { align: 'center' });
        doc.text('Share securely or download for records.', { align: 'center' });
        doc.text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Mask CBU for security (show only last 4 digits)
   */
  private maskCBU(cbu: string): string {
    if (cbu.length < 4) return '****';
    return '*'.repeat(cbu.length - 4) + cbu.slice(-4);
  }

  /**
   * Upload PDF to cloud storage (Supabase)
   */
  async uploadPdfToStorage(pdf: Buffer, comprobanteId: string): Promise<string> {
    try {
      const fileName = `receipts/${comprobanteId}-${Date.now()}.pdf`;

      // Write to temporary file for Supabase storage
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `${comprobanteId}.pdf`);
      fs.writeFileSync(tempFilePath, pdf);

      // For production, you would upload to Supabase Storage:
      // const { error } = await supabaseAdmin.storage
      //   .from('receipts')
      //   .upload(fileName, pdf, { contentType: 'application/pdf' });
      //
      // if (error) throw error;
      //
      // const { data } = supabaseAdmin.storage
      //   .from('receipts')
      //   .getPublicUrl(fileName);
      //
      // return data.publicUrl;

      // For now, return a local file path URL
      const pdfUrl = `/api/receipts/${comprobanteId}`;

      // Clean up temp file
      fs.unlinkSync(tempFilePath);

      return pdfUrl;
    } catch (error) {
      throw new Error(`Failed to upload PDF: ${error}`);
    }
  }

  /**
   * Get a shareable link for a receipt
   */
  async shareComprobante(transferId: string, usuarioId: string): Promise<string> {
    const transfer = await this.getTransferDetail(transferId, usuarioId);
    const comprobante = await this.transfersRepository.getComprobanteByTransferId(transferId);

    if (!comprobante) {
      throw new NotFoundError('Receipt not found for this transfer');
    }

    // Generate a shareable token (expires in 7 days)
    const shareToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // For production, you would store this token in a shares table
    // For now, return a simple share URL
    const shareUrl = `/api/receipts/share/${shareToken}`;

    return shareUrl;
  }

  /**
   * Get a temporary download link (24h expiry)
   */
  async getDownloadLink(transferId: string, usuarioId: string): Promise<string> {
    const transfer = await this.getTransferDetail(transferId, usuarioId);
    const comprobante = await this.transfersRepository.getComprobanteByTransferId(transferId);

    if (!comprobante || !comprobante.pdf_url) {
      throw new NotFoundError('Receipt not available for download');
    }

    // Check if the receipt is still within the 24-hour window
    const now = new Date();
    if (comprobante.fecha_expiracion && comprobante.fecha_expiracion < now) {
      throw new ValidationError('Receipt download link has expired');
    }

    return comprobante.pdf_url;
  }

  /**
   * Get receipt details formatted for display
   */
  async getComprobanteDetail(comprobanteId: string, usuarioId: string): Promise<ComprobanteDetail> {
    const comprobante = await this.transfersRepository.getComprobanteById(comprobanteId);

    if (!comprobante) {
      throw new NotFoundError('Receipt not found');
    }

    // Get the associated transfer to verify user access
    const transfer = await this.transfersRepository.getTransferById(comprobante.id_transferencia);

    if (!transfer || (transfer.usuario_id_origen !== usuarioId && transfer.usuario_id_destino !== usuarioId)) {
      throw new ValidationError('User does not have access to this receipt');
    }

    // Determine if receipt can be shared and downloaded
    const now = new Date();
    const isExpired = comprobante.fecha_expiracion && comprobante.fecha_expiracion < now;
    const esCompartible = comprobante.estado === TransferStatus.ACREDITADA;
    const esDescargable = !isExpired && comprobante.estado_descarga === 'disponible';

    return {
      numero_comprobante: comprobante.numero_comprobante,
      fecha_hora: comprobante.fecha_hora,
      monto: comprobante.monto,
      remitente_alias: transfer.comprobante_json?.remitente_alias || 'Wallet Account',
      destinatario_alias: comprobante.destinatario_alias,
      destinatario_cbu: comprobante.destinatario_cbu,
      referencia: transfer.referencia,
      estado: comprobante.estado,
      compartible: esCompartible,
      descargable: esDescargable,
    };
  }

  /**
   * List user's receipts with pagination
   */
  async getUserComprobantesList(
    usuarioId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Comprobante[]> {
    return this.transfersRepository.getComprobantesByUserId(usuarioId, limit, offset);
  }

  /**
   * Get total transfer amount for today for a user
   */
  async getDailyTransferTotal(usuarioId: string): Promise<number> {
    const transfers = await this.transfersRepository.getTransfersByUserIdAndDate(usuarioId, new Date());
    return transfers
      .filter(transfer => transfer.estado === TransferStatus.ACREDITADA)
      .reduce((sum, transfer) => sum + transfer.monto, 0);
  }

  /**
   * Get count of transfers made today for a user
   */
  async getDailyTransferCount(usuarioId: string): Promise<number> {
    const transfers = await this.transfersRepository.getTransfersByUserIdAndDate(usuarioId, new Date());
    return transfers.filter(transfer => transfer.estado === TransferStatus.ACREDITADA).length;
  }
}

export default new TransfersService();
