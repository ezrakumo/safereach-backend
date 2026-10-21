import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { NotifyVia } from '@prisma/client';

export class CreateContactDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'Invalid phone number' })
  phoneNumber: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(NotifyVia, { each: true })
  notifyVia?: NotifyVia[];
}