import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { UpdateContactDto } from './dto/update-contact.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private contacts: ContactsService) {}

  @Post()
  add(@GetUser('id') userId: string, @Body() dto: CreateContactDto) {
    return this.contacts.addContact(userId, dto);
  }

  @Get()
  list(@GetUser('id') userId: string) {
    return this.contacts.getContacts(userId);
  }

  @Get(':id')
  getOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.contacts.getContactById(userId, id);
  }

  @Put(':id')
  update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contacts.updateContact(userId, id, dto);
  }

  @Delete(':id')
  remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.contacts.deleteContact(userId, id);
  }
}