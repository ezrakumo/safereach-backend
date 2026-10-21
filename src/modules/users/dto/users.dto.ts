import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/.+/, { message: 'avatarUrl must start with http:// or https://' })
  avatarUrl?: string;
}

export class FcmTokenDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  fcmToken: string;
}

export class DeleteAccountDto {
  // Must match the phone number on the account - prevents accidental deletion
  @IsNotEmpty()
  @IsString()
  confirmPhone: string;
}
