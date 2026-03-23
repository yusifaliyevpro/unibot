import { Controller, Get, Res } from "@nestjs/common";
import * as QRCode from "qrcode";
import { Response } from "express";
import { OnEvent } from "@nestjs/event-emitter";

@Controller("bot")
export class BotController {
  private qrCode: string;

  @OnEvent("qrcode.created")
  handleQrcodeCreatedEvent(qrCode: string) {
    this.qrCode = qrCode;
  }

  @Get("qrcode")
  async getQrCode(@Res() response: Response) {
    if (!this.qrCode) {
      return response.status(404).send("QR code not found");
    }

    response.setHeader("Content-Type", "image/png");
    await QRCode.toFileStream(response, this.qrCode);
  }
}
