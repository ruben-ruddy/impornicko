// src/prisma/prisma.service.ts
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    console.log('Prisma conectado a la base de datos.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Prisma desconectado de la base de datos.');
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}