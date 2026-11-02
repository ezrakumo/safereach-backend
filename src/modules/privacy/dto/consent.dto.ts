import { IsBoolean, IsOptional } from 'class-validator';

export class ConsentDto {
  @IsOptional() @IsBoolean()
  acceptPrivacy?: boolean;

  @IsOptional() @IsBoolean()
  acceptTerms?: boolean;

  @IsOptional() @IsBoolean()
  locationConsent?: boolean;

  @IsOptional() @IsBoolean()
  marketingConsent?: boolean;
}
