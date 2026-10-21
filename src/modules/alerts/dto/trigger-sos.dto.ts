import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class TriggerSosDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsBoolean()
  isSilent?: boolean;

  @IsOptional()
  @IsString()
  addressLandmark?: string;

  @IsOptional()
  @IsString()
  message?: string;
}