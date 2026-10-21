import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { NotifyVia } from '@prisma/client';

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'Invalid phone number' })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(NotifyVia, { each: true })
  notifyVia?: NotifyVia[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}