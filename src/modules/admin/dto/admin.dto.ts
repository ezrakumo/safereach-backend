import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ReasonDto {
  @IsNotEmpty() @IsString() @MinLength(3) @MaxLength(300)
  reason: string;
}

export class AuditQueryDto {
  @IsOptional() @IsString() @MaxLength(60)
  action?: string;

  @IsOptional() @IsString()
  actorId?: string;

  @IsOptional() @IsString()
  entityId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

export class UserSearchDto {
  @IsOptional() @IsString() @MaxLength(60)
  q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
