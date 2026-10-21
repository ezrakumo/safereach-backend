import { IsNotEmpty, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'Invalid phone number' })
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;
}