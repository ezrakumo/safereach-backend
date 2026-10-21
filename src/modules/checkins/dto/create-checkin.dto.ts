import {
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCheckInDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // ISO date-time, e.g. 2026-10-21T22:00:00.000Z
  @IsNotEmpty()
  @IsDateString()
  expectedAt: string;

  // Minutes of grace after expectedAt before contacts are alerted (default 10)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  graceMinutes?: number;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
