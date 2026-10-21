import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateTrackPointDto {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  // GPS accuracy in meters (0-100)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy?: number;

  // Speed in m/s
  @IsOptional()
  @IsNumber()
  speed?: number;

  // Direction of travel in degrees (0-360)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  // Phone battery percentage, so contacts know if the phone may die
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  battery?: number;
}
