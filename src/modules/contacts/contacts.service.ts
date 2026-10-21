import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { UpdateContactDto } from './dto/update-contact.dto.js';
import { NotifyVia } from '@prisma/client';

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async addContact(userId: string, dto: CreateContactDto) {
    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    const count = await this.prisma.emergencyContact.count({
      where: { userId, isActive: true },
    });
    if (count >= 5) {
      throw new BadRequestException('Maximum 5 emergency contacts allowed');
    }

    const exists = await this.prisma.emergencyContact.findUnique({
      where: { userId_phoneNumber: { userId, phoneNumber } },
    });
    if (exists) throw new BadRequestException('This contact already exists');

    return this.prisma.emergencyContact.create({
      data: {
        userId,
        fullName: dto.fullName.trim(),
        phoneNumber,
        relationship: dto.relationship,
        notifyVia: dto.notifyVia ?? [NotifyVia.PUSH, NotifyVia.SMS],
      },
    });
  }

  async getContacts(userId: string) {
    return this.prisma.emergencyContact.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getContactById(userId: string, contactId: string) {
    const contact = await this.prisma.emergencyContact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.userId !== userId || !contact.isActive) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async updateContact(userId: string, contactId: string, dto: UpdateContactDto) {
    await this.getContactById(userId, contactId);

    const data: any = { ...dto };
    if (dto.phoneNumber) {
      data.phoneNumber = this.normalizePhone(dto.phoneNumber);

      const duplicate = await this.prisma.emergencyContact.findFirst({
        where: { userId, phoneNumber: data.phoneNumber, NOT: { id: contactId } },
      });
      if (duplicate) throw new BadRequestException('Another contact already uses this number');
    }
    if (dto.fullName) data.fullName = dto.fullName.trim();

    return this.prisma.emergencyContact.update({
      where: { id: contactId },
      data,
    });
  }

  async deleteContact(userId: string, contactId: string) {
    await this.getContactById(userId, contactId);
    await this.prisma.emergencyContact.update({
      where: { id: contactId },
      data: { isActive: false },
    });
    return { success: true };
  }

  private normalizePhone(phone: string): string {
    let p = phone.replace(/[\s-]/g, '');
    if (p.startsWith('0') && p.length === 11) p = '+234' + p.substring(1);
    else if (!p.startsWith('+') && p.length === 10) p = '+234' + p;
    else if (p.startsWith('234') && !p.startsWith('+')) p = '+' + p;
    return p;
  }
}